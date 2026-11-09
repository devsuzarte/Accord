import { BrowserWindow } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type { PointerPing } from '@sharescreen/shared'
import type { ShareService } from '../share/share-service'
import {
  hardenNavigation,
  keepOnTop,
  loadPage,
  overlaySurfaceOptions,
  secureWebPreferences,
} from '../windows/common'
import { protectWindow } from '../windows/content-protection'

const HIDE_AFTER_MS = 3200

/**
 * Marcadores na tela de quem transmite: uma janela transparente do tamanho da tela (ou da
 * janela) compartilhada, que o clique atravessa e que NÃO aparece na transmissão (content
 * protection) — quem assiste vê o marcador desenhado por cima do vídeo, no próprio viewer.
 */
export class PointerWindow {
  private win: BrowserWindow | null = null
  private ready = false
  private queue: PointerPing[] = []
  private hideTimer: NodeJS.Timeout | null = null

  constructor(private readonly share: ShareService) {}

  show(ping: PointerPing): void {
    const bounds = this.share.captureBounds()
    if (!bounds || bounds.width < 50 || bounds.height < 50) {
      console.info('[apontar] não sei onde fica o que está sendo transmitido; marcador ignorado')
      return
    }
    const win = this.ensure()
    win.setBounds(bounds)
    if (!win.isVisible()) win.showInactive()
    if (this.ready) win.webContents.send(IpcChannel.PointerPing, ping)
    else this.queue.push(ping)
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => this.win?.hide(), HIDE_AFTER_MS)
  }

  isPointer(contentsId: number): boolean {
    return this.win?.webContents.id === contentsId
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = new BrowserWindow({
      ...overlaySurfaceOptions,
      focusable: false,
      webPreferences: secureWebPreferences(),
    })
    win.setIgnoreMouseEvents(true)
    protectWindow(win, { always: true })
    keepOnTop(win)
    hardenNavigation(win)
    this.ready = false
    win.webContents.once('did-finish-load', () => {
      this.ready = true
      for (const ping of this.queue) win.webContents.send(IpcChannel.PointerPing, ping)
      this.queue = []
    })
    win.on('closed', () => {
      this.win = null
      this.ready = false
    })
    loadPage(win, 'pointer')
    this.win = win
    return win
  }
}
