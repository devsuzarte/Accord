import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, nativeImage, screen } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type { MusicView } from '@sharescreen/shared'
import iconPath from '../../../resources/icon.png?asset'
import { hardenNavigation, keepOnTop, loadPage, secureWebPreferences } from '../windows/common'
import { protectWindow } from '../windows/content-protection'

const WIDTH = 400
const HEIGHT = 312
const MARGIN = 16

/**
 * Player da sala de música: janela pequena, sempre no topo, com o player oficial do YouTube.
 * A música só toca aqui: as regras do YouTube não deixam tocar com o player escondido (sem
 * "player em segundo plano"), então o vídeo fica sempre visível, no mínimo 200×200.
 */
export class MusicPlayerWindow {
  private win: BrowserWindow | null = null
  private view: MusicView = { state: null, access: null, identity: null }
  private readonly boundsFile = join(app.getPath('userData'), 'music-player.json')
  /** Avisa a janela de chat (o botão "Ouvir" mostra se o player está aberto). */
  onOpenChange: ((open: boolean) => void) | null = null

  getView(): MusicView {
    return this.view
  }

  isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  is(webContentsId: number): boolean {
    return this.isOpen() && this.win!.webContents.id === webContentsId
  }

  report(view: MusicView): void {
    this.view = view
    if (this.isOpen()) this.win!.webContents.send(IpcChannel.MusicStateChanged, view)
    // Saiu da call: o player fecha junto.
    if (!view.access) this.close()
  }

  open(): void {
    if (!this.view.access) return
    if (this.isOpen()) {
      this.win!.showInactive()
      return
    }
    const bounds = this.savedBounds()
    const win = new BrowserWindow({
      ...bounds,
      minWidth: 320,
      minHeight: 260,
      show: false,
      frame: false,
      resizable: true,
      skipTaskbar: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#0d0d10',
      title: 'Accord — Música',
      icon: nativeImage.createFromPath(iconPath),
      webPreferences: secureWebPreferences(),
    })
    // Sempre fora das capturas: transmitir a tela não leva o vídeo junto (seria retransmitir o YouTube).
    protectWindow(win, { always: true })
    keepOnTop(win)
    hardenNavigation(win)
    win.once('ready-to-show', () => win.showInactive())
    win.on('page-title-updated', (event) => event.preventDefault())
    const save = () => this.saveBounds(win)
    win.on('moved', save)
    win.on('resized', save)
    win.on('closed', () => {
      this.win = null
      this.onOpenChange?.(false)
    })
    loadPage(win, 'music')
    this.win = win
    this.onOpenChange?.(true)
  }

  close(): void {
    if (this.isOpen()) this.win!.close()
  }

  private savedBounds(): Electron.Rectangle {
    const wa = screen.getPrimaryDisplay().workArea
    const fallback = {
      x: wa.x + wa.width - WIDTH - MARGIN,
      y: wa.y + wa.height - HEIGHT - MARGIN,
      width: WIDTH,
      height: HEIGHT,
    }
    try {
      const saved = JSON.parse(readFileSync(this.boundsFile, 'utf8')) as Electron.Rectangle
      const visible = screen
        .getAllDisplays()
        .some(
          (d) =>
            saved.x >= d.workArea.x - 50 &&
            saved.y >= d.workArea.y - 50 &&
            saved.x < d.workArea.x + d.workArea.width - 100 &&
            saved.y < d.workArea.y + d.workArea.height - 100,
        )
      return visible && saved.width >= 320 && saved.height >= 260 ? saved : fallback
    } catch {
      return fallback
    }
  }

  private saveBounds(win: BrowserWindow): void {
    try {
      writeFileSync(this.boundsFile, JSON.stringify(win.getBounds()))
    } catch {
      /* ignora */
    }
  }
}
