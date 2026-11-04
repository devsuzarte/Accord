import { BrowserWindow, screen } from 'electron'
import {
  hardenNavigation,
  keepOnTop,
  loadPage,
  overlaySurfaceOptions,
  preventMinimize,
  secureWebPreferences,
} from '../windows/common'
import type { OverlayManager } from './overlay-manager'

// As duas janelas têm 16px de margem transparente (sombra): -20 deixa ~12px visíveis entre elas.
const GAP = -20

/**
 * Lista de pessoas da chamada: abre ao lado do pill (do lado que tem espaço).
 * Clique direito numa pessoa abre as ações (silenciar para mim, para todos, desconectar).
 */
export class PeopleWindow {
  private win: BrowserWindow | null = null
  /** Tamanho do conteúdo (medido no renderer); a janela acompanha. */
  private size = { width: 312, height: 160 }

  constructor(private readonly overlay: OverlayManager) {}

  toggle(): void {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isVisible()) this.win.hide()
      else this.show()
      return
    }
    const win = new BrowserWindow({
      ...overlaySurfaceOptions,
      width: this.size.width,
      height: this.size.height,
      focusable: true,
      webPreferences: secureWebPreferences(),
    })
    win.setContentProtection(true)
    keepOnTop(win)
    preventMinimize(win)
    hardenNavigation(win)
    win.once('ready-to-show', () => this.show())
    win.on('closed', () => {
      this.win = null
    })
    loadPage(win, 'people')
    this.win = win
  }

  private show(): void {
    if (!this.win) return
    this.place()
    this.win.show()
    this.win.focus()
  }

  resize(size: { width: number; height: number }): void {
    this.size = { width: Math.ceil(size.width), height: Math.ceil(size.height) }
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.place()
  }

  /** Ao lado do pill, do lado com espaço; alinhado pelo topo (ou pela base, perto do fim da tela). */
  private place(): void {
    if (!this.win) return
    const { width, height } = this.size
    const pill = this.overlay.pillBounds()
    const { workArea: wa } = screen.getDisplayMatching(pill)
    const roomRight = wa.x + wa.width - (pill.x + pill.width)
    const x = roomRight >= width + GAP ? pill.x + pill.width + GAP : pill.x - width - GAP
    const nearBottom = pill.y + pill.height / 2 > wa.y + wa.height / 2
    const y = nearBottom ? pill.y + pill.height - height : pill.y
    this.win.setBounds({
      x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - width)),
      y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - height)),
      width,
      height,
    })
  }

  hide(): void {
    this.win?.hide()
  }

  send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  is(webContentsId: number): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.webContents.id === webContentsId
  }
}
