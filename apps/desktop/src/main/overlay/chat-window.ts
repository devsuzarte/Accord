import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, nativeImage, screen } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type {
  CallSnapshot,
  ChatMode,
  ChatPrefs,
  ChatState,
  ChatView,
  MusicView,
  Size,
  Theme,
} from '@sharescreen/shared'
import iconPath from '../../../resources/icon.png?asset'
import {
  hardenNavigation,
  keepOnTop,
  loadPage,
  overlaySurfaceOptions,
  preventMinimize,
  secureWebPreferences,
} from '../windows/common'
import type { OverlayManager } from './overlay-manager'
import { protectWindow } from '../windows/content-protection'

const MINI_WIDTH = 332
/** As janelas do overlay têm 16px de margem transparente (sombra). */
const GAP = -20
const FULL = { width: 1120, height: 740 }
const TITLE_BAR_HEIGHT = 44

const emptyState: ChatState = {
  messages: [],
  access: null,
  channelName: null,
  identity: null,
  emojis: [],
  gifs: { provider: null },
}

interface SavedPrefs extends ChatPrefs {
  bounds?: Electron.Rectangle
  maximized?: boolean
}

/**
 * Chat do canal. Duas janelas:
 *  - completa: uma janela de verdade (barra de tarefas, redimensionar, maximizar), com a
 *    lista da call ao lado, a conversa no centro, emojis, GIFs e a sala de música;
 *  - mínima: as mensagens rolando sobre a tela, como num chat de live, sem campo e com os
 *    cliques atravessando (embaixo ou em cima do pill). Some enquanto a completa está em uso.
 */
export class ChatWindow {
  private mini: BrowserWindow | null = null
  private full: BrowserWindow | null = null
  private state: ChatState = emptyState
  private call: CallSnapshot | null = null
  private music: MusicView = { state: null, access: null, identity: null }
  private playerOpen = false
  private view: ChatView = 'chat'
  private miniHeight = 0
  private seen = 0
  private prefs: SavedPrefs = { overlay: true }
  private quitting = false
  private readonly prefsFile = join(app.getPath('userData'), 'chat.json')

  constructor(
    private readonly overlay: OverlayManager,
    private readonly sendToPill: (channel: string, payload: unknown) => void,
    private readonly theme: () => Theme,
  ) {
    try {
      const saved = JSON.parse(readFileSync(this.prefsFile, 'utf8')) as Partial<SavedPrefs>
      if (typeof saved.overlay === 'boolean') this.prefs.overlay = saved.overlay
      if (saved.bounds && typeof saved.bounds.width === 'number') this.prefs.bounds = saved.bounds
      if (typeof saved.maximized === 'boolean') this.prefs.maximized = saved.maximized
    } catch {
      /* padrão */
    }
    overlay.onChange(() => this.sync())
    app.on('before-quit', () => {
      this.quitting = true
    })
  }

  getState(): ChatState {
    return this.state
  }

  getPrefs(): ChatPrefs {
    return { overlay: this.prefs.overlay }
  }

  getView(): ChatView {
    return this.view
  }

  setPrefs(prefs: ChatPrefs): void {
    this.prefs.overlay = prefs.overlay
    this.savePrefs()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.ChatPrefsChanged, this.getPrefs())
    }
    this.sync()
  }

  /** O pill mandou as mensagens novas (ou saiu da chamada). */
  report(state: ChatState): void {
    const left = !state.access
    this.state = state
    if (left) {
      this.seen = 0
      if (this.full && !this.full.isDestroyed() && this.full.isVisible()) this.full.hide()
    }
    this.ensureMini().webContents.send(IpcChannel.ChatStateChanged, state)
    this.sendFull(IpcChannel.ChatStateChanged, state)
    this.sync()
  }

  /** Retrato da chamada (lista da call na lateral, botões de microfone e fone). */
  reportCall(snapshot: CallSnapshot): void {
    this.call = snapshot
    this.sendFull(IpcChannel.CallStateChanged, snapshot)
  }

  reportMusic(view: MusicView): void {
    this.music = view
    this.sendFull(IpcChannel.MusicStateChanged, view)
  }

  setPlayerOpen(open: boolean): void {
    this.playerOpen = open
    this.sendFull(IpcChannel.MusicPlayerChanged, open)
  }

  /** Botão do chat no pill: abre a janela; se ela já está na frente, esconde. */
  toggle(): void {
    const win = this.full
    if (win && !win.isDestroyed() && win.isVisible() && win.isFocused() && !win.isMinimized()) {
      win.hide()
      this.sync()
      return
    }
    this.open()
  }

  open(view?: ChatView): void {
    if (!this.state.access) return
    if (view) {
      this.view = view
      this.sendFull(IpcChannel.ChatViewChanged, view)
    }
    const win = this.ensureFull()
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) {
      if (this.prefs.maximized) win.maximize()
      win.show()
    }
    win.focus()
    this.sync()
  }

  setMode(mode: ChatMode): void {
    if (mode === 'expanded') return this.open()
    if (this.full && !this.full.isDestroyed()) this.full.hide()
    this.sync()
  }

  resizeMini(size: Size): void {
    this.miniHeight = Math.ceil(size.height)
    this.sync()
  }

  is(webContentsId: number): boolean {
    return this.isMini(webContentsId) || this.isFull(webContentsId)
  }

  isFull(webContentsId: number): boolean {
    return !!this.full && !this.full.isDestroyed() && this.full.webContents.id === webContentsId
  }

  isMini(webContentsId: number): boolean {
    return !!this.mini && !this.mini.isDestroyed() && this.mini.webContents.id === webContentsId
  }

  /** As cores do app mudaram: a barra da janela (botões do sistema) acompanha. */
  applyTheme(theme: Theme): void {
    if (!this.full || this.full.isDestroyed()) return
    try {
      this.full.setTitleBarOverlay(titleBarOverlay(theme))
    } catch {
      /* sistema sem a barra desenhada pelo app */
    }
    this.full.setBackgroundColor(theme.colors.background)
  }

  private sendFull(channel: string, payload: unknown): void {
    if (this.full && !this.full.isDestroyed()) this.full.webContents.send(channel, payload)
  }

  private ensureMini(): BrowserWindow {
    if (this.mini && !this.mini.isDestroyed()) return this.mini
    const win = new BrowserWindow({
      ...overlaySurfaceOptions,
      width: MINI_WIDTH,
      height: 100,
      focusable: false,
      webPreferences: secureWebPreferences(),
    })
    protectWindow(win)
    keepOnTop(win)
    preventMinimize(win)
    hardenNavigation(win)
    win.setIgnoreMouseEvents(true)
    win.webContents.on('did-finish-load', () => {
      win.webContents.send(IpcChannel.ChatModeChanged, 'mini' satisfies ChatMode)
      win.webContents.send(IpcChannel.ChatStateChanged, this.state)
    })
    win.on('closed', () => {
      this.mini = null
    })
    loadPage(win, 'chat')
    this.mini = win
    return win
  }

  private ensureFull(): BrowserWindow {
    if (this.full && !this.full.isDestroyed()) return this.full
    const theme = this.theme()
    const bounds = this.validBounds(this.prefs.bounds)
    const win = new BrowserWindow({
      ...(bounds ?? FULL),
      minWidth: 760,
      minHeight: 500,
      show: false,
      title: 'Accord',
      icon: nativeImage.createFromPath(iconPath),
      backgroundColor: theme.colors.background,
      autoHideMenuBar: true,
      // Barra de título do próprio app (com os botões do sistema por cima, no canto).
      titleBarStyle: 'hidden',
      titleBarOverlay: titleBarOverlay(theme),
      webPreferences: secureWebPreferences(),
    })
    // Como o resto do Accord: segue a escolha "esconder o Accord das capturas" (aba Você).
    protectWindow(win)
    hardenNavigation(win)
    win.on('page-title-updated', (event) => event.preventDefault())
    win.webContents.on('did-finish-load', () => {
      win.webContents.send(IpcChannel.ChatModeChanged, 'expanded' satisfies ChatMode)
      win.webContents.send(IpcChannel.ChatStateChanged, this.state)
      win.webContents.send(IpcChannel.ChatViewChanged, this.view)
      if (this.call) win.webContents.send(IpcChannel.CallStateChanged, this.call)
      win.webContents.send(IpcChannel.MusicStateChanged, this.music)
      win.webContents.send(IpcChannel.MusicPlayerChanged, this.playerOpen)
    })
    // Fechar no X só esconde (a conversa continua; o app vive na bandeja).
    win.on('close', (event) => {
      if (this.quitting) return
      event.preventDefault()
      win.hide()
    })
    const remember = () => {
      if (win.isDestroyed()) return
      this.prefs.maximized = win.isMaximized()
      if (!win.isMaximized() && !win.isMinimized()) this.prefs.bounds = win.getBounds()
      this.savePrefs()
    }
    win.on('moved', remember)
    win.on('resized', remember)
    win.on('maximize', remember)
    win.on('unmaximize', remember)
    for (const event of ['show', 'hide', 'focus', 'blur', 'minimize', 'restore'] as const) {
      win.on(event as 'show', () => this.sync())
    }
    win.on('closed', () => {
      this.full = null
    })
    loadPage(win, 'chat')
    this.full = win
    return win
  }

  private validBounds(bounds: Electron.Rectangle | undefined): Electron.Rectangle | null {
    if (!bounds) return null
    const onScreen = screen.getAllDisplays().some((d) => {
      const wa = d.workArea
      return (
        bounds.x < wa.x + wa.width - 80 &&
        bounds.x + bounds.width > wa.x + 80 &&
        bounds.y >= wa.y - 20 &&
        bounds.y < wa.y + wa.height - 60
      )
    })
    return onScreen && bounds.width >= 760 && bounds.height >= 500 ? bounds : null
  }

  private savePrefs(): void {
    try {
      writeFileSync(this.prefsFile, JSON.stringify(this.prefs))
    } catch {
      /* ignora */
    }
  }

  /** A janela completa está na frente de quem usa? */
  private fullInUse(): boolean {
    const win = this.full
    return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused()
  }

  /** Mostra, esconde e posiciona o modo mínimo e conta as não lidas. */
  private sync(): void {
    const inCall = !!this.state.access
    const overlay = this.overlay.getState()

    if (inCall && this.fullInUse()) this.seen = this.state.messages.length
    const mine = this.state.identity
    const unread = this.state.messages.slice(this.seen).filter((m) => m.identity !== mine).length
    this.sendToPill(IpcChannel.ChatUnreadChanged, unread)

    const win = this.mini
    if (!win || win.isDestroyed()) return
    const show =
      inCall && this.prefs.overlay && overlay.visible && this.miniHeight > 40 && !this.fullInUse()
    if (!show) {
      if (win.isVisible()) win.hide()
      return
    }
    this.placeMini(MINI_WIDTH, Math.min(this.miniHeight, 420))
    if (!win.isVisible()) win.showInactive()
  }

  private placeMini(width: number, height: number): void {
    if (!this.mini) return
    const pill = this.overlay.pillBounds()
    const { workArea: wa } = screen.getDisplayMatching(pill)
    const pillOnRight = pill.x + pill.width / 2 > wa.x + wa.width / 2
    const pillLow = pill.y + pill.height / 2 > wa.y + wa.height / 2
    const x = pillOnRight ? pill.x + pill.width - width : pill.x
    const y = pillLow ? pill.y - height - GAP : pill.y + pill.height + GAP
    this.mini.setBounds({
      x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - width)),
      y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - height)),
      width,
      height,
    })
  }
}

function titleBarOverlay(theme: Theme): Electron.TitleBarOverlayOptions {
  return {
    color: theme.colors.surface,
    symbolColor: theme.colors.text,
    height: TITLE_BAR_HEIGHT,
  }
}
