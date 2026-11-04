import { createRequire } from 'node:module'
import { app } from 'electron'
import type Koffi from 'koffi'
import type { MessageKey, ShareKind } from '@sharescreen/shared'
import { tm } from '../i18n'

/**
 * Som da transmissão capturado no Windows pelo "process loopback" do WASAPI
 * (pacote loopback-capture, MIT, binário pronto — docs/09 §2 e docs/02 › Compartilhamento):
 *
 *  - janela  → captura SÓ o processo dono da janela (e filhos);
 *  - tela    → captura todo o som do PC EXCETO o próprio sharescreen,
 *              para as vozes da chamada não voltarem para quem assiste (eco).
 *
 * Formato entregue: PCM s16le, estéreo, 48 kHz.
 */

interface LoopbackCapture {
  start(processId: number, callback: (chunk: Buffer) => void): void
  startSystemAudio(callback: (chunk: Buffer) => void, excludeProcessId?: number): void
  stop(): void
}

// O main é empacotado em CommonJS: __filename existe e resolve node_modules a partir daqui.
const require = createRequire(__filename)

let loadError: MessageKey | null = null
let LoopbackCaptureClass: (new () => LoopbackCapture) | null = null
let getWindowPid: ((hwnd: bigint) => number) | null = null

/**
 * Só para testes em desenvolvimento: SHARESCREEN_FAKE_SHARE_AUDIO=1 troca a captura nativa
 * por um tom de 440 Hz, para validar o caminho do som em qualquer sistema.
 */
const fakeAudio = !app.isPackaged && process.env.SHARESCREEN_FAKE_SHARE_AUDIO === '1'

class FakeToneCapture implements LoopbackCapture {
  private timer: NodeJS.Timeout | null = null
  private phase = 0
  private run(callback: (chunk: Buffer) => void) {
    const frames = 480 // 10 ms a 48 kHz
    this.timer = setInterval(() => {
      const chunk = Buffer.alloc(frames * 4)
      for (let i = 0; i < frames; i++) {
        const sample = Math.round(Math.sin(this.phase) * 0.2 * 32767)
        this.phase += (2 * Math.PI * 440) / 48000
        chunk.writeInt16LE(sample, i * 4)
        chunk.writeInt16LE(sample, i * 4 + 2)
      }
      callback(chunk)
    }, 10)
  }
  start(_pid: number, callback: (chunk: Buffer) => void) {
    this.run(callback)
  }
  startSystemAudio(callback: (chunk: Buffer) => void) {
    this.run(callback)
  }
  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

function load(): void {
  if (LoopbackCaptureClass || loadError) return
  if (fakeAudio) {
    LoopbackCaptureClass = FakeToneCapture
    getWindowPid = () => 1
    return
  }
  if (process.platform !== 'win32') {
    loadError = 'share.audio.windowsOnly'
    return
  }
  try {
    LoopbackCaptureClass = (
      require('loopback-capture') as { LoopbackCapture: new () => LoopbackCapture }
    ).LoopbackCapture

    // HWND da janela → PID do processo dono (user32!GetWindowThreadProcessId).
    const koffi = require('koffi') as typeof Koffi
    const user32 = koffi.load('user32.dll')
    const GetWindowThreadProcessId = user32.func(
      'uint32 __stdcall GetWindowThreadProcessId(intptr hWnd, _Out_ uint32 *lpdwProcessId)',
    )
    getWindowPid = (hwnd) => {
      const out = [0]
      GetWindowThreadProcessId(hwnd, out)
      return out[0] ?? 0
    }
  } catch (error) {
    console.error('[audio] captura nativa indisponível', error)
    loadError = 'share.audio.loadFailed'
  }
}

export function nativeAudioSupported(): boolean {
  load()
  return !loadError
}

/** "window:1234567:0" → 1234567n */
function hwndFromSourceId(sourceId: string): bigint | null {
  const match = /^window:(\d+):/.exec(sourceId)
  return match ? BigInt(match[1]!) : null
}

export class NativeShareAudio {
  private capture: LoopbackCapture | null = null

  /** Começa a capturar; cada pedaço de PCM vai para `onChunk`. Lança erro com mensagem pronta. */
  start(kind: ShareKind, sourceId: string, onChunk: (chunk: Buffer) => void): void {
    load()
    if (loadError || !LoopbackCaptureClass)
      throw new Error(tm(loadError ?? 'share.audio.loadFailed'))
    this.stop()

    const capture = new LoopbackCaptureClass()
    if (kind === 'window') {
      const hwnd = hwndFromSourceId(sourceId)
      const pid = hwnd !== null && getWindowPid ? getWindowPid(hwnd) : 0
      if (!pid) throw new Error(tm('share.audio.noProcess'))
      capture.start(pid, onChunk)
    } else {
      // Exclui a árvore do processo principal: inclui as janelas e o serviço de áudio do app.
      capture.startSystemAudio(onChunk, process.pid)
    }
    this.capture = capture
  }

  stop(): void {
    try {
      this.capture?.stop()
    } catch (error) {
      console.warn('[audio] erro ao parar a captura', error)
    }
    this.capture = null
  }
}
