import { createRequire } from 'node:module'
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
import type Koffi from 'koffi'
import { IpcChannel, SHARE_AUDIO_STATUS } from '@sharescreen/shared'
import type {
  ShareAudioResult,
  ShareAudioStatus,
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
import { protectWindow } from '../windows/content-protection'

const PICKER_WIDTH = 760
const PICKER_HEIGHT = 560
/** Sem nenhum pedaço de som por esse tempo: primeira tentativa de reiniciar a captura. */
const AUDIO_RESTART_MS = 10_000
/** Ainda sem som depois disso (já com o reinício): avisa quem transmite. */
const AUDIO_QUIET_MS = 15_000
const AUDIO_RESTART_MAX_MS = 60_000
const AUDIO_WATCH_MS = 2_000

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
  /** O que está sendo transmitido agora (para os marcadores saberem onde aparecer). */
  private activeSource: { id: string; displayId: string } | null = null
  private readonly audio = new NativeShareAudio()
  private audioPort: MessagePortMain | null = null
  /** Vigia do som (docs/16 P4): a fonte em uso e quando chegou o último pedaço. */
  private audioSource: { kind: ShareKind; sourceId: string } | null = null
  private audioWatch: NodeJS.Timeout | null = null
  private lastChunkAt = 0
  private audioQuiet = false
  private restartDelay = AUDIO_RESTART_MS
  private nextRestartAt = 0

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
        if (source) this.activeSource = { id: source.id, displayId: source.display_id }
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
    protectWindow(picker, { always: true })
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
    this.activeSource = { id: request.sourceId, displayId: '' }
    // Qual monitor é essa tela (para os marcadores aparecerem no monitor certo).
    if (request.sourceId.startsWith('screen:')) {
      void desktopCapturer
        .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const found = sources.find((s) => s.id === request.sourceId)
          if (found && this.activeSource?.id === request.sourceId) {
            this.activeSource = { id: found.id, displayId: found.display_id }
          }
        })
        .catch(() => undefined)
    }
    this.closePicker()
    this.overlay.sendToPill(IpcChannel.ShareStart, request)
  }

  /**
   * Retângulo (em pixels de tela do Electron) do que está sendo transmitido: a tela inteira ou
   * a janela escolhida. `null` quando não dá para saber (janela fora do Windows).
   */
  captureBounds(): Electron.Rectangle | null {
    const source = this.activeSource
    if (!source) return null
    if (source.id.startsWith('screen:')) {
      const displays = screen.getAllDisplays()
      const display =
        displays.find((d) => String(d.id) === source.displayId) ??
        (displays.length === 1 ? displays[0] : undefined)
      return display?.bounds ?? null
    }
    const hwnd = Number(source.id.split(':')[1])
    return Number.isFinite(hwnd) ? windowBounds(hwnd) : null
  }

  // ───────────────────────── Som ─────────────────────────

  startAudio(kind: ShareKind, sourceId: string): ShareAudioResult {
    this.stopAudio()
    const { port1, port2 } = new MessageChannelMain()
    try {
      this.audio.start(kind, sourceId, (chunk) => this.onAudioChunk(port1, chunk))
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
    this.watchAudio(kind, sourceId)
    return { ok: true }
  }

  stopAudio(): void {
    if (this.audioWatch) clearInterval(this.audioWatch)
    this.audioWatch = null
    this.audioSource = null
    this.audio.stop()
    this.audioPort?.close()
    this.audioPort = null
  }

  private onAudioChunk(port: MessagePortMain, chunk: Buffer): void {
    const now = Date.now()
    this.lastChunkAt = now
    this.restartDelay = AUDIO_RESTART_MS
    this.nextRestartAt = now + AUDIO_RESTART_MS
    if (this.audioQuiet) {
      this.audioQuiet = false
      console.info('[share] o som do app voltou a chegar')
      this.sendAudioStatus({ state: 'flowing' })
    }
    port.postMessage(chunk)
  }

  /**
   * A captura nativa não manda nada no silêncio (o loopback-capture descarta pedaços abaixo de
   * -70 dB) e, se der erro (ex.: trocou o dispositivo de saída), para de vez sem avisar. Por
   * fora, as duas coisas parecem iguais. Então: depois de 10 s sem som, reinicia a captura (com
   * espera dobrando até 1 min). No silêncio, reiniciar não muda nada; se a captura tinha
   * morrido, o som volta. Se aos 15 s ainda não chegou nada, avisa quem transmite.
   */
  private watchAudio(kind: ShareKind, sourceId: string): void {
    const now = Date.now()
    this.audioSource = { kind, sourceId }
    this.lastChunkAt = now
    this.audioQuiet = false
    this.restartDelay = AUDIO_RESTART_MS
    this.nextRestartAt = now + AUDIO_RESTART_MS
    this.audioWatch = setInterval(() => this.checkAudio(), AUDIO_WATCH_MS)
  }

  private checkAudio(): void {
    const source = this.audioSource
    const port = this.audioPort
    if (!source || !port) return
    const now = Date.now()
    const silentMs = now - this.lastChunkAt
    if (!this.audioQuiet && silentMs >= AUDIO_QUIET_MS) {
      this.audioQuiet = true
      console.info(`[share] nenhum som do app há ${Math.round(silentMs / 1000)} s`)
      this.sendAudioStatus({ state: 'quiet' })
    }
    if (now < this.nextRestartAt) return
    this.restartDelay = Math.min(this.restartDelay * 2, AUDIO_RESTART_MAX_MS)
    this.nextRestartAt = now + this.restartDelay
    try {
      this.audio.start(source.kind, source.sourceId, (chunk) => this.onAudioChunk(port, chunk))
      console.info(
        `[share] sem som há ${Math.round(silentMs / 1000)} s: reiniciei a captura (próxima em ${this.restartDelay / 1000} s)`,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : tm('share.audio.failed')
      console.warn('[share] não consegui reiniciar a captura do som', error)
      if (this.audioWatch) clearInterval(this.audioWatch)
      this.audioWatch = null
      this.audioSource = null
      this.sendAudioStatus({ state: 'failed', reason })
    }
  }

  private sendAudioStatus(status: Omit<ShareAudioStatus, 'type'>): void {
    this.audioPort?.postMessage({ type: SHARE_AUDIO_STATUS, ...status })
  }
}

let dwmBounds: ((hwnd: number) => Electron.Rectangle | null) | null | undefined

/** Windows: limites visíveis da janela (DwmGetWindowAttribute, sem a sombra invisível). */
function windowBounds(hwnd: number): Electron.Rectangle | null {
  if (process.platform !== 'win32') return null
  if (dwmBounds === undefined) {
    try {
      const koffi = createRequire(__filename)('koffi') as typeof Koffi
      const RECT = koffi.struct('ACCORD_RECT', {
        left: 'int32',
        top: 'int32',
        right: 'int32',
        bottom: 'int32',
      })
      const dwm = koffi.load('dwmapi.dll')
      const DwmGetWindowAttribute = dwm.func(
        'int32 __stdcall DwmGetWindowAttribute(intptr hwnd, uint32 attr, _Out_ ACCORD_RECT *rect, uint32 size)',
      )
      const DWMWA_EXTENDED_FRAME_BOUNDS = 9
      dwmBounds = (h) => {
        const rect = { left: 0, top: 0, right: 0, bottom: 0 }
        if (DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, rect, koffi.sizeof(RECT)) !== 0) {
          return null
        }
        // DWM devolve pixels físicos; o Electron trabalha em pixels "lógicos" (DIP).
        return screen.screenToDipRect(null, {
          x: rect.left,
          y: rect.top,
          width: rect.right - rect.left,
          height: rect.bottom - rect.top,
        })
      }
    } catch (error) {
      console.warn('[share] não consigo ler a posição da janela transmitida', error)
      dwmBounds = null
    }
  }
  return dwmBounds ? dwmBounds(hwnd) : null
}
