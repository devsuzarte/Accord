import { BrowserWindow, screen } from 'electron'
import type { Rectangle } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type { OverlayCorner, OverlayEdges, OverlayState, PanelTab, Size } from '@sharescreen/shared'
import {
  hardenNavigation,
  keepOnTop,
  loadPage,
  overlaySurfaceOptions,
  preventMinimize,
  secureWebPreferences,
} from '../windows/common'
import { loadPosition, savePosition } from './position-store'

/** Distância (px) da borda que faz o pill "grudar" nela ao soltar. */
const SNAP_DISTANCE = 24
/** Folga entre o pill encaixado e a borda da área útil. */
const EDGE_MARGIN = 12
/** Espaço entre o pill e o painel preso a ele. */
const PANEL_GAP = 6
/** 384px de painel + 2 × 16px de moldura para a sombra (--frame-pad). */
const PANEL_WIDTH = 416

/**
 * Pill + painel preso ao pill.
 * Técnicas em docs/09-estudo-overlay-opencluely.md §2 e §3.
 */
export interface OverlayManagerOptions {
  /** Canto inicial quando ainda não há posição salva. */
  defaultCorner?: OverlayCorner
}

export class OverlayManager {
  constructor(private readonly options: OverlayManagerOptions = {}) {}

  private pill!: BrowserWindow
  private panel!: BrowserWindow
  private edges: OverlayEdges = { horizontal: 'left', vertical: 'top' }
  private ghost = false
  private visible = true
  private panelHiddenAt = 0
  private moveSettleTimer: NodeJS.Timeout | null = null
  /** Última posição definida por código: eventos 'move' chegam depois (assíncronos). */
  private expectedPosition: { x: number; y: number } | null = null
  private trackUserMoves = false

  create(): void {
    this.pill = this.createPill()
    this.panel = this.createPanel()

    screen.on('display-removed', () => this.restorePosition())
    screen.on('display-metrics-changed', () => this.restorePosition())
  }

  // ───────────────────────── Pill ─────────────────────────

  private createPill(): BrowserWindow {
    const pill = new BrowserWindow({
      ...overlaySurfaceOptions,
      width: 72,
      height: 72,
      // Não focável: clicar no pill nunca tira o foco do jogo (§2 item 12).
      // No Windows, focusable:false também implica skipTaskbar.
      focusable: false,
      webPreferences: secureWebPreferences({
        // O pill guardará a sessão da chamada: não pode ser congelado oculto (§2 item 13).
        backgroundThrottling: false,
      }),
    })

    pill.setContentProtection(true) // não aparece na própria transmissão (§2 item 8)
    keepOnTop(pill)
    preventMinimize(pill)
    hardenNavigation(pill)

    pill.on('move', () => this.onPillMove())

    pill.once('ready-to-show', () => {
      this.restorePosition()
      if (this.visible) pill.showInactive()
      // Alguns gerenciadores de janela reposicionam no primeiro show: reaplica e só então
      // passa a tratar movimentos como arrasto do usuário.
      setTimeout(() => {
        this.restorePosition()
        this.trackUserMoves = true
      }, 150)
    })
    pill.webContents.on('did-finish-load', () => this.broadcastState())
    loadPage(pill, 'pill')
    return pill
  }

  /** O renderer mediu o conteúdo: a janela vira exatamente esse tamanho (§1.1). */
  resizePill(size: Size): void {
    const width = Math.max(1, Math.ceil(size.width))
    const height = Math.max(1, Math.ceil(size.height))
    const current = this.pill.getBounds()
    if (current.width === width && current.height === height) return

    // Cresce para longe da borda encaixada: encaixado à direita cresce para a esquerda, etc.
    const x = this.edges.horizontal === 'right' ? current.x + current.width - width : current.x
    const y = this.edges.vertical === 'bottom' ? current.y + current.height - height : current.y
    this.setPillBounds(this.clampToWorkArea({ x, y, width, height }))
  }

  private setPillBounds(bounds: Rectangle): void {
    this.expectedPosition = { x: bounds.x, y: bounds.y }
    this.pill.setBounds(bounds)
    this.positionPanel()
  }

  private onPillMove(): void {
    this.positionPanel()
    if (!this.trackUserMoves) return
    const { x, y } = this.pill.getBounds()
    // Movimento causado por nós (resize, encaixe, restaurar) não é arrasto do usuário.
    if (this.expectedPosition && this.expectedPosition.x === x && this.expectedPosition.y === y) {
      return
    }
    // Arrasto do usuário (-webkit-app-region: drag): encaixa quando ele para de mover.
    if (this.moveSettleTimer) clearTimeout(this.moveSettleTimer)
    this.moveSettleTimer = setTimeout(() => this.snapAndSave(), 220)
  }

  private snapAndSave(): void {
    const bounds = this.pill.getBounds()
    const { workArea: wa, id } = screen.getDisplayMatching(bounds)
    let { x, y } = bounds
    const edges: OverlayEdges = { horizontal: null, vertical: null }

    const fromLeft = bounds.x - wa.x
    const fromRight = wa.x + wa.width - (bounds.x + bounds.width)
    const fromTop = bounds.y - wa.y
    const fromBottom = wa.y + wa.height - (bounds.y + bounds.height)

    if (fromLeft <= SNAP_DISTANCE) {
      x = wa.x + EDGE_MARGIN
      edges.horizontal = 'left'
    } else if (fromRight <= SNAP_DISTANCE) {
      x = wa.x + wa.width - bounds.width - EDGE_MARGIN
      edges.horizontal = 'right'
    }
    if (fromTop <= SNAP_DISTANCE) {
      y = wa.y + EDGE_MARGIN
      edges.vertical = 'top'
    } else if (fromBottom <= SNAP_DISTANCE) {
      y = wa.y + wa.height - bounds.height - EDGE_MARGIN
      edges.vertical = 'bottom'
    }

    const next = this.clampToWorkArea({ ...bounds, x, y })
    if (next.x !== bounds.x || next.y !== bounds.y) this.setPillBounds(next)
    this.setEdges(edges)
    savePosition({ displayId: id, x: next.x - wa.x, y: next.y - wa.y, edges })
  }

  /** Restaura a posição salva (ou canto superior esquerdo) e garante que está visível. */
  restorePosition(): void {
    if (this.pill.isDestroyed()) return
    const saved = loadPosition()
    const display =
      screen.getAllDisplays().find((d) => d.id === saved?.displayId) ?? screen.getPrimaryDisplay()
    const wa = display.workArea
    const { width, height } = this.pill.getBounds()
    const [defaultV, defaultH] = (this.options.defaultCorner ?? 'top-left').split('-') as [
      'top' | 'bottom',
      'left' | 'right',
    ]
    const edges = saved?.edges ?? { horizontal: defaultH, vertical: defaultV }

    let x = saved ? wa.x + saved.x : wa.x + EDGE_MARGIN
    let y = saved ? wa.y + saved.y : wa.y + EDGE_MARGIN
    if (edges.horizontal === 'left') x = wa.x + EDGE_MARGIN
    if (edges.horizontal === 'right') x = wa.x + wa.width - width - EDGE_MARGIN
    if (edges.vertical === 'top') y = wa.y + EDGE_MARGIN
    if (edges.vertical === 'bottom') y = wa.y + wa.height - height - EDGE_MARGIN

    this.setEdges(edges)
    this.setPillBounds(this.clampToWorkArea({ x, y, width, height }))
  }

  moveTo(corner: OverlayCorner): void {
    const [vertical, horizontal] = corner.split('-') as ['top' | 'bottom', 'left' | 'right']
    const { workArea: wa, id } = screen.getDisplayMatching(this.pill.getBounds())
    const { width, height } = this.pill.getBounds()
    const x = horizontal === 'left' ? wa.x + EDGE_MARGIN : wa.x + wa.width - width - EDGE_MARGIN
    const y = vertical === 'top' ? wa.y + EDGE_MARGIN : wa.y + wa.height - height - EDGE_MARGIN
    const edges: OverlayEdges = { horizontal, vertical }
    this.setEdges(edges)
    this.setPillBounds({ x, y, width, height })
    savePosition({ displayId: id, x: x - wa.x, y: y - wa.y, edges })
  }

  private clampToWorkArea(bounds: Rectangle): Rectangle {
    const { workArea: wa } = screen.getDisplayMatching(bounds)
    const x = Math.min(Math.max(bounds.x, wa.x), wa.x + wa.width - bounds.width)
    const y = Math.min(Math.max(bounds.y, wa.y), wa.y + wa.height - bounds.height)
    return { ...bounds, x: Math.round(x), y: Math.round(y) }
  }

  private setEdges(edges: OverlayEdges): void {
    const changed =
      edges.horizontal !== this.edges.horizontal || edges.vertical !== this.edges.vertical
    this.edges = edges
    if (changed) this.broadcastState()
  }

  // ───────────────────────── Painel ─────────────────────────

  private createPanel(): BrowserWindow {
    const panel = new BrowserWindow({
      ...overlaySurfaceOptions,
      width: PANEL_WIDTH,
      height: 320,
      // Focável: o painel tem campos de texto (login, convite, nome de canal).
      focusable: true,
      webPreferences: secureWebPreferences(),
    })
    panel.setContentProtection(true)
    keepOnTop(panel)
    preventMinimize(panel)
    hardenNavigation(panel)

    // Comportamento de popover: perdeu o foco, fecha.
    panel.on('blur', () => this.hidePanel())
    panel.webContents.on('did-finish-load', () => this.broadcastState())
    loadPage(panel, 'panel')
    return panel
  }

  togglePanel(tab?: PanelTab): void {
    if (this.panel.isVisible()) {
      this.hidePanel()
      return
    }
    // Clique no pill logo após o painel fechar por blur = o usuário queria fechar.
    if (Date.now() - this.panelHiddenAt < 250) return
    this.openPanel(tab)
  }

  openPanel(tab: PanelTab = 'channels'): void {
    if (this.ghost) this.setGhost(false)
    if (!this.visible) this.setVisible(true)
    this.panel.webContents.send(IpcChannel.PanelOpenTab, tab)
    this.positionPanel()
    this.panel.show()
    this.panel.focus()
    this.broadcastState()
  }

  hidePanel(): void {
    if (!this.panel.isVisible()) return
    this.panel.hide()
    this.panelHiddenAt = Date.now()
    this.broadcastState()
  }

  resizePanel(size: Size): void {
    const { width } = this.panel.getBounds()
    const height = Math.max(1, Math.ceil(size.height))
    this.panel.setBounds({ ...this.panel.getBounds(), width, height })
    this.positionPanel()
  }

  /** Painel preso ao pill, abrindo para o lado que tem espaço (§2 item 11). */
  private positionPanel(): void {
    if (!this.panel || this.panel.isDestroyed()) return
    const pill = this.pill.getBounds()
    const { width, height } = this.panel.getBounds()
    const { workArea: wa } = screen.getDisplayMatching(pill)

    const spaceBelow = wa.y + wa.height - (pill.y + pill.height + PANEL_GAP)
    const spaceAbove = pill.y - wa.y - PANEL_GAP
    const preferBelow =
      this.edges.vertical === 'top' ||
      (this.edges.vertical !== 'bottom' && spaceBelow >= spaceAbove)
    // Respeita a borda encaixada, mas troca de lado se não couber.
    const opensBelow = preferBelow
      ? spaceBelow >= height || spaceBelow >= spaceAbove
      : !(spaceAbove >= height || spaceAbove >= spaceBelow)
    const y = opensBelow ? pill.y + pill.height + PANEL_GAP : pill.y - height - PANEL_GAP

    const pillCenterX = pill.x + pill.width / 2
    const alignRight =
      this.edges.horizontal === 'right' ||
      (this.edges.horizontal !== 'left' && pillCenterX > wa.x + wa.width / 2)
    const x = alignRight ? pill.x + pill.width - width : pill.x

    const clamped = this.clampToWorkArea({ x, y, width, height })
    this.panel.setBounds(clamped)
  }

  // ─────────────────────── Modos e estado ───────────────────────

  /** Modo fantasma: cliques atravessam o pill (§3.2). Sai pelo mesmo atalho. */
  setGhost(ghost: boolean): void {
    this.ghost = ghost
    if (ghost) {
      this.hidePanel()
      this.pill.setIgnoreMouseEvents(true, { forward: true })
    } else {
      this.pill.setIgnoreMouseEvents(false)
    }
    this.broadcastState()
  }

  toggleGhost(): void {
    this.setGhost(!this.ghost)
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (visible) {
      this.pill.showInactive()
    } else {
      this.hidePanel()
      this.pill.hide()
    }
    this.broadcastState()
  }

  toggleVisible(): void {
    this.setVisible(!this.visible)
  }

  getState(): OverlayState {
    return {
      visible: this.visible,
      ghost: this.ghost,
      panelOpen: !!this.panel && !this.panel.isDestroyed() && this.panel.isVisible(),
      edges: this.edges,
    }
  }

  private broadcastState(): void {
    const state = this.getState()
    for (const win of [this.pill, this.panel]) {
      if (win && !win.isDestroyed()) win.webContents.send(IpcChannel.OverlayStateChanged, state)
    }
  }

  /** Repasse de mensagens entre as superfícies (ex.: painel → pill na chamada). */
  sendToPill(channel: string, payload: unknown): void {
    if (!this.pill.isDestroyed()) this.pill.webContents.send(channel, payload)
  }

  /** Envia MessagePorts ao pill (ex.: o PCM do som da transmissão). */
  postToPill(channel: string, ports: Electron.MessagePortMain[]): void {
    if (!this.pill.isDestroyed()) this.pill.webContents.postMessage(channel, null, ports)
  }

  pillBounds(): Rectangle {
    return this.pill.getBounds()
  }

  sendToPanel(channel: string, payload: unknown): void {
    if (!this.panel.isDestroyed()) this.panel.webContents.send(channel, payload)
  }

  /** Para o IPC saber de qual superfície veio a mensagem. */
  isPill(webContentsId: number): boolean {
    return this.pill.webContents.id === webContentsId
  }

  isPanel(webContentsId: number): boolean {
    return this.panel.webContents.id === webContentsId
  }
}
