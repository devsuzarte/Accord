import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, screen } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type { ChatMode, ChatPrefs, ChatState, Size } from '@sharescreen/shared'
import {
  hardenNavigation,
  keepOnTop,
  loadPage,
  overlaySurfaceOptions,
  preventMinimize,
  secureWebPreferences,
} from '../windows/common'
import type { OverlayManager } from './overlay-manager'

const EXPANDED = { width: 420, height: 580 }
const MINI_WIDTH = 332
/** As janelas têm 16px de margem transparente (sombra). */
const GAP = -20

const emptyState: ChatState = { messages: [], access: null, channelName: null, identity: null }

/**
 * Chat temporário do canal. Uma janela só, em dois modos:
 *  - aberto: focável, com as mensagens, imagens e o campo de texto (ao lado do pill);
 *  - mínimo: as mensagens rolando como num chat de live, sem campo, e os cliques atravessam
 *    (embaixo ou em cima do pill). Pode ser desligado em Overlay → "Mostrar o chat na tela".
 */
export class ChatWindow {
  private win: BrowserWindow | null = null
  private mode: ChatMode = 'mini'
  private state: ChatState = emptyState
  private miniHeight = 0
  private seen = 0
  private prefs: ChatPrefs = { overlay: true }
  private readonly prefsFile = join(app.getPath('userData'), 'chat.json')

  constructor(
    private readonly overlay: OverlayManager,
    private readonly sendToPill: (channel: string, payload: unknown) => void,
  ) {
    try {
      const saved = JSON.parse(readFileSync(this.prefsFile, 'utf8')) as Partial<ChatPrefs>
      if (typeof saved.overlay === 'boolean') this.prefs.overlay = saved.overlay
    } catch {
      /* padrão */
    }
    overlay.onChange(() => this.sync())
  }

  getState(): ChatState {
    return this.state
  }

  getPrefs(): ChatPrefs {
    return this.prefs
  }

  setPrefs(prefs: ChatPrefs): void {
    this.prefs = { overlay: prefs.overlay }
    try {
      writeFileSync(this.prefsFile, JSON.stringify(this.prefs))
    } catch {
      /* ignora */
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.ChatPrefsChanged, this.prefs)
    }
    this.sync()
  }

  /** O pill mandou as mensagens novas (ou saiu da chamada). */
  report(state: ChatState): void {
    const left = !state.access
    this.state = state
    if (left) {
      this.mode = 'mini'
      this.seen = 0
    }
    this.ensure().webContents.send(IpcChannel.ChatStateChanged, state)
    this.sync()
  }

  toggle(): void {
    this.setMode(this.mode === 'expanded' && this.win?.isVisible() ? 'mini' : 'expanded')
  }

  setMode(mode: ChatMode): void {
    if (mode === 'expanded' && !this.state.access) return
    this.mode = mode
    this.ensure().webContents.send(IpcChannel.ChatModeChanged, mode)
    this.sync()
    if (mode === 'expanded') this.win?.focus()
  }

  resizeMini(size: Size): void {
    this.miniHeight = Math.ceil(size.height)
    if (this.mode === 'mini') this.sync()
  }

  is(webContentsId: number): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.webContents.id === webContentsId
  }

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = new BrowserWindow({
      ...overlaySurfaceOptions,
      width: MINI_WIDTH,
      height: 100,
      focusable: false,
      webPreferences: secureWebPreferences(),
    })
    win.setContentProtection(true)
    keepOnTop(win)
    preventMinimize(win)
    hardenNavigation(win)
    win.webContents.on('did-finish-load', () => {
      win.webContents.send(IpcChannel.ChatModeChanged, this.mode)
      win.webContents.send(IpcChannel.ChatStateChanged, this.state)
    })
    win.on('closed', () => {
      this.win = null
    })
    loadPage(win, 'chat')
    this.win = win
    return win
  }

  /** Mostra, esconde, posiciona e conta as não lidas conforme o modo e o estado da chamada. */
  private sync(): void {
    const win = this.win
    const inCall = !!this.state.access
    const overlay = this.overlay.getState()

    if (this.mode === 'expanded' && inCall && win?.isVisible()) {
      this.seen = this.state.messages.length
    }
    const mine = this.state.identity
    const unread = this.state.messages.slice(this.seen).filter((m) => m.identity !== mine).length
    this.sendToPill(IpcChannel.ChatUnreadChanged, unread)

    if (!win || win.isDestroyed()) return
    const showExpanded = inCall && this.mode === 'expanded'
    const showMini =
      inCall &&
      this.mode === 'mini' &&
      this.prefs.overlay &&
      overlay.visible &&
      this.miniHeight > 40

    if (!showExpanded && !showMini) {
      if (win.isVisible()) win.hide()
      return
    }

    if (showExpanded) {
      win.setFocusable(true)
      win.setIgnoreMouseEvents(false)
      this.place(EXPANDED.width, EXPANDED.height, 'side')
      if (!win.isVisible()) {
        win.show()
        win.focus()
      }
    } else {
      win.setFocusable(false)
      win.setIgnoreMouseEvents(true)
      this.place(MINI_WIDTH, Math.min(this.miniHeight, 420), 'under')
      if (!win.isVisible()) win.showInactive()
    }
  }

  private place(width: number, height: number, where: 'side' | 'under'): void {
    if (!this.win) return
    const pill = this.overlay.pillBounds()
    const { workArea: wa } = screen.getDisplayMatching(pill)
    const pillOnRight = pill.x + pill.width / 2 > wa.x + wa.width / 2
    const pillLow = pill.y + pill.height / 2 > wa.y + wa.height / 2
    let x: number
    let y: number
    if (where === 'side') {
      x = pillOnRight ? pill.x - width - GAP : pill.x + pill.width + GAP
      y = pillLow ? pill.y + pill.height - height : pill.y
    } else {
      x = pillOnRight ? pill.x + pill.width - width : pill.x
      y = pillLow ? pill.y - height - GAP : pill.y + pill.height + GAP
    }
    this.win.setBounds({
      x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - width)),
      y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - height)),
      width,
      height,
    })
  }
}
