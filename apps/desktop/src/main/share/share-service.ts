import { tm } from '../i18n'
import {
  app,
  BrowserWindow,
  desktopCapturer,
  MessageChannelMain,
  screen,
  session,
  webContents,
} from 'electron'
import type { MessagePortMain } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type {
  ShareAudioResult,
  ShareKind,
  ShareRequest,
  ShareSourceList,
} from '@sharescreen/shared'
import type { OverlayManager } from '../overlay/overlay-manager'
import {
  hardenNavigation,
  keepOnTop,
  loadPage,
  overlaySurfaceOptions,
  secureWebPreferences,
} from '../windows/common'
import { NativeShareAudio, nativeAudioSupported } from './native-audio'

const PICKER_WIDTH = 760
const PICKER_HEIGHT = 560

/**
 * Compartilhamento de tela:
 *  1. o pill pede o seletor → janela "picker" lista telas e janelas (sem guias de navegador);
 *  2. a escolha volta para cá e o pill chama getDisplayMedia → o handler abaixo entrega a fonte;
 *  3. o som (opcional) é capturado nativamente e enviado ao pill por um MessagePort.
 */
export class ShareService {
  private picker: BrowserWindow | null = null
  /** Fonte confirmada no seletor, aguardando o getDisplayMedia do pill. */
  private pendingSourceId: string | null = null
  private readonly audio = new NativeShareAudio()
  private audioPort: MessagePortMain | null = null

  constructor(private readonly overlay: OverlayManager) {}

  register(): void {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      // Só a fonte que a pessoa escolheu no nosso seletor; e só para o pill.
      const requester = request.frame ? webContents.fromFrame(request.frame) : null
      const sourceId = this.pendingSourceId
      this.pendingSourceId = null
      if (!sourceId) {
        console.warn('[share] captura recusada: nenhuma fonte escolhida no seletor')
        callback({})
        return
      }
      // Sem frame identificável (pode acontecer), confiamos na escolha pendente do seletor.
      if (requester && !this.overlay.isPill(requester.id)) {
        console.warn('[share] captura recusada: pedido não veio do pill')
        callback({})
        return
      }
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
        const source = sources.find((s) => s.id === sourceId)
        if (!source) console.warn(`[share] fonte ${sourceId} não existe mais (janela fechada?)`)
        else console.info(`[share] capturando "${source.name}"`)
        callback(source ? { video: source } : {})
      } catch (error) {
        console.error('[share] falha ao listar fontes', error)
        callback({})
      }
    })
  }

  // ───────────────────────── Seletor ─────────────────────────

  openPicker(): void {
    if (this.picker && !this.picker.isDestroyed()) {
      this.picker.focus()
      return
    }
    const pill = this.overlay.pillBounds()
    const { workArea: wa } = screen.getDisplayMatching(pill)
    const picker = new BrowserWindow({
      ...overlaySurfaceOptions,
      width: PICKER_WIDTH,
      height: PICKER_HEIGHT,
      x: Math.round(wa.x + (wa.width - PICKER_WIDTH) / 2),
      y: Math.round(wa.y + (wa.height - PICKER_HEIGHT) / 2),
      focusable: true,
      webPreferences: secureWebPreferences(),
    })
    // O seletor não aparece na própria captura (nem na miniatura de "tela inteira").
    picker.setContentProtection(true)
    keepOnTop(picker)
    hardenNavigation(picker)
    picker.once('ready-to-show', () => {
      picker.show()
      picker.focus()
    })
    picker.on('closed', () => {
      this.picker = null
    })
    loadPage(picker, 'picker')
    this.picker = picker
  }

  closePicker(): void {
    if (this.picker && !this.picker.isDestroyed()) this.picker.close()
    this.picker = null
  }

  isPicker(webContentsId: number): boolean {
    return (
      !!this.picker && !this.picker.isDestroyed() && this.picker.webContents.id === webContentsId
    )
  }

  async listSources(): Promise<ShareSourceList> {
    const sources = await desktopCapturer
      .getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      })
      .catch((error) => {
        console.error('[share] não consegui listar telas e janelas', error)
        return []
      })
    // Nunca oferecer as janelas do próprio sharescreen.
    const ownIds = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()))
    const screenCount = sources.filter((s) => s.id.startsWith('screen:')).length
    let screenNumber = 0
    return {
      audioSupported: nativeAudioSupported(),
      sources: sources
        .filter((s) => !ownIds.has(s.id))
        .filter((s) => s.id.startsWith('screen:') || !s.thumbnail.isEmpty())
        .map((s) => ({
          id: s.id,
          // Telas ganham nome no idioma do app ("Entire screen"/"Screen 1" vêm do sistema).
          name: s.id.startsWith('screen:')
            ? screenCount > 1
              ? tm('share.screenN', { n: ++screenNumber })
              : tm('share.entireScreen')
            : s.name,
          kind: s.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
          thumbnail: s.thumbnail.toDataURL(),
          icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
        })),
    }
  }

  select(request: ShareRequest): void {
    this.pendingSourceId = request.sourceId
    this.closePicker()
    this.overlay.sendToPill(IpcChannel.ShareStart, request)
  }

  // ───────────────────────── Som ─────────────────────────

  startAudio(kind: ShareKind, sourceId: string): ShareAudioResult {
    this.stopAudio()
    const { port1, port2 } = new MessageChannelMain()
    try {
      this.audio.start(kind, sourceId, (chunk) => port1.postMessage(chunk))
      console.info(`[share] som nativo ligado (${kind})`)
      if (kind === 'screen') {
        // Diagnóstico do "eco": o som do próprio app sai pelo serviço de áudio, filho deste processo.
        const audioService = app
          .getAppMetrics()
          .find((m) => m.type === 'Utility' && /audio/i.test(m.serviceName ?? ''))
        console.info(
          `[share] tela inteira sem o som do app: exclui a árvore do pid ${process.pid} (serviço de áudio: pid ${audioService?.pid ?? '?'})`,
        )
      }
    } catch (error) {
      console.warn('[share] som nativo indisponível', error)
      port1.close()
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'Falha ao capturar o som.',
      }
    }
    port1.start()
    this.audioPort = port1
    this.overlay.postToPill(IpcChannel.ShareAudioPort, [port2])
    return { ok: true }
  }

  stopAudio(): void {
    this.audio.stop()
    this.audioPort?.close()
    this.audioPort = null
  }
}
