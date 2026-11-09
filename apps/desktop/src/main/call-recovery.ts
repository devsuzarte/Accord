import { Notification } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type { CallCommand, CallSnapshot } from '@sharescreen/shared'
import { tm } from './i18n'
import type { OverlayManager, PillLifecycleEvent } from './overlay/overlay-manager'
import type { ShareService } from './share/share-service'

type JoinCommand = Extract<CallCommand, { type: 'join' }>

/**
 * Volta para a chamada quando o pill trava (docs/16 P1).
 *
 * A sala do LiveKit vive no pill. Se o renderer dele morre, a chamada cai junto. O main já vê
 * todo pedido de "entrar" passar (painel → main → pill), então guarda o último e, quando o pill
 * recarregado manda o primeiro retrato, pede para entrar de novo no mesmo servidor.
 *
 * Enquanto isso, o painel e a lista de pessoas veem "reconectando" em vez de "fora da
 * chamada", e as transmissões abertas não fecham.
 */
export class CallRecovery {
  private lastJoin: JoinCommand | null = null
  /** 'waiting' = esperando o pill novo; 'rejoining' = pediu para entrar, esperando conectar. */
  private phase: 'none' | 'waiting' | 'rejoining' = 'none'
  private rejoin: JoinCommand | null = null
  /** Guardado ao desistir, para o clique na notificação tentar de novo. */
  private retryJoin: JoinCommand | null = null

  constructor(
    private readonly overlay: OverlayManager,
    private readonly share: ShareService,
    private readonly getLast: () => CallSnapshot,
    private readonly publish: (snapshot: CallSnapshot) => void,
  ) {
    overlay.onPillLifecycle((event) => this.onPill(event))
  }

  get recovering(): boolean {
    return this.phase !== 'none'
  }

  /** Todo comando que vai para o pill passa por aqui. */
  noteCommand(command: CallCommand): void {
    if (command.type === 'join') this.lastJoin = command
    if (command.type === 'leave') {
      this.lastJoin = null
      this.rejoin = null
      this.retryJoin = null
      this.phase = 'none'
    }
  }

  /**
   * Cada retrato que o pill manda. Devolve o que repassar ao painel, ou `null` para segurar
   * (o retrato "fora da chamada" do pill recém-carregado, antes de entrar de novo).
   */
  filterReport(snapshot: CallSnapshot): CallSnapshot | null {
    if (this.phase === 'waiting') {
      // Primeiro retrato do pill novo: o script dele já está ouvindo os comandos.
      const rejoin = this.rejoin
      this.rejoin = null
      if (!rejoin) {
        this.phase = 'none'
        return snapshot
      }
      console.info(`[recover] entrando de novo em ${rejoin.serverUrl}`)
      this.phase = 'rejoining'
      this.overlay.sendToPill(IpcChannel.CallCommand, rejoin)
      return null
    }
    if (this.phase === 'rejoining') {
      if (snapshot.status === 'connected') {
        console.info('[recover] de volta à chamada')
        this.phase = 'none'
        return snapshot
      }
      if (snapshot.status === 'idle') {
        // Sem erro = retrato de antes de o pedido chegar; com erro = não conseguiu entrar.
        if (!snapshot.error) return null
        console.warn(`[recover] não consegui voltar: ${snapshot.error}`)
        this.phase = 'none'
        return snapshot
      }
      return { ...snapshot, status: 'reconnecting', error: tm('recover.crashed') }
    }
    return snapshot
  }

  private onPill(event: PillLifecycleEvent): void {
    // A transmissão morreu com o renderer: o som nativo e o seletor não têm mais dono.
    this.share.stopAudio()
    this.share.closePicker()
    const last = this.getLast()
    const inCall = last.status !== 'idle' && this.lastJoin !== null
    const join =
      inCall && this.lastJoin
        ? // Depois de uma migração de host, o servidor atual é outro: vale o do retrato.
          {
            ...this.lastJoin,
            serverUrl: last.server?.url ?? this.lastJoin.serverUrl,
            resume: true,
          }
        : null
    const cleared = { ...last, sharing: null, shareStats: null, shareAdvice: null }

    if (event.type === 'crashed') {
      this.rejoin = join
      this.phase = 'waiting'
      if (join) this.publish({ ...cleared, status: 'reconnecting', error: tm('recover.crashed') })
      return
    }

    // Desistiu: sai da chamada e deixa a pessoa tentar de novo pela notificação ou pela bandeja.
    this.phase = 'none'
    this.rejoin = null
    this.retryJoin = join ?? this.retryJoin
    this.publish({
      ...cleared,
      status: 'idle',
      participants: [],
      channelName: null,
      server: null,
      error: tm('recover.gaveUp'),
    })
    if (Notification.isSupported()) {
      const notice = new Notification({
        title: tm('recover.gaveUpTitle'),
        body: tm('recover.gaveUpBody'),
      })
      notice.on('click', () => this.retry())
      notice.show()
    }
  }

  /** Recarrega o pill e, se estava numa chamada quando desistiu, entra de novo. */
  retry(): void {
    this.rejoin = this.retryJoin
    this.retryJoin = null
    this.phase = 'waiting'
    this.overlay.reloadPill()
  }
}
