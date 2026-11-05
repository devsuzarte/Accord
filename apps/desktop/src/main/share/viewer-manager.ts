import { tm } from '../i18n'
import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type { MiniViewerState, ViewerTarget } from '@sharescreen/shared'
import { createMiniViewerWindow, createViewerWindow, MINI_WIDTHS } from '../windows/viewer'

interface Entry {
  win: BrowserWindow
  target: ViewerTarget
  mini: MiniViewerState | null
  size: number
}

/**
 * Uma janela de viewer por pessoa transmitindo; abrir de novo só traz a janela para frente.
 * A mesma transmissão pode virar miniatura sobre o jogo (outra janela, sem moldura).
 */
export class ViewerManager {
  private readonly byIdentity = new Map<string, Entry>()
  private readonly byContents = new Map<number, Entry>()
  private dragOffset: { x: number; y: number } | null = null

  open(target: ViewerTarget): void {
    const existing = this.byIdentity.get(target.identity)
    if (existing && !existing.win.isDestroyed()) {
      if (existing.mini) return existing.win.showInactive()
      if (existing.win.isMinimized()) existing.win.restore()
      existing.win.focus()
      return
    }
    this.create({ ...target, mini: false }, null)
  }

  private create(target: ViewerTarget, near: Electron.Rectangle | null): void {
    const title = tm('viewer.windowTitle', { name: target.name })
    const win = target.mini ? createMiniViewerWindow(title, near) : createViewerWindow(title)
    const entry: Entry = {
      win,
      target,
      mini: target.mini ? { locked: false, opacity: 1 } : null,
      size: 1,
    }
    const id = win.webContents.id
    this.byIdentity.set(target.identity, entry)
    this.byContents.set(id, entry)
    win.on('closed', () => {
      if (this.byIdentity.get(target.identity) === entry) this.byIdentity.delete(target.identity)
      this.byContents.delete(id)
    })
  }

  /** Janela ↔ miniatura. Troca a janela (a conexão de assistir reabre em ~1 s). */
  toggleMini(contentsId: number): void {
    const entry = this.byContents.get(contentsId)
    if (!entry || entry.win.isDestroyed()) return
    const near = entry.win.getBounds()
    const next: ViewerTarget = { ...entry.target, mini: !entry.mini }
    entry.win.close()
    this.create(next, near)
  }

  setMini(contentsId: number, patch: Partial<MiniViewerState>): void {
    const entry = this.byContents.get(contentsId)
    if (!entry?.mini || entry.win.isDestroyed()) return
    if (typeof patch.locked === 'boolean') entry.mini.locked = patch.locked
    if (typeof patch.opacity === 'number' && patch.opacity >= 0.3 && patch.opacity <= 1) {
      entry.mini.opacity = patch.opacity
    }
    this.applyMini(entry)
  }

  /** Atalho de destravar: todas as miniaturas voltam a aceitar clique. */
  unlockAll(): void {
    for (const entry of this.byIdentity.values()) {
      if (entry.mini?.locked && !entry.win.isDestroyed()) {
        entry.mini.locked = false
        this.applyMini(entry)
      }
    }
  }

  cycleSize(contentsId: number): void {
    const entry = this.byContents.get(contentsId)
    if (!entry?.mini || entry.win.isDestroyed()) return
    entry.size = (entry.size + 1) % MINI_WIDTHS.length
    const bounds = entry.win.getBounds()
    const width = MINI_WIDTHS[entry.size]!
    const height = Math.round((width * 9) / 16)
    // Cresce para o lado de dentro da tela (a miniatura costuma ficar num canto).
    const wa = screen.getDisplayMatching(bounds).workArea
    const right = bounds.x + bounds.width
    const bottom = bounds.y + bounds.height
    const x = right > wa.x + wa.width / 2 ? right - width : bounds.x
    const y = bottom > wa.y + wa.height / 2 ? bottom - height : bounds.y
    entry.win.setBounds({ x, y, width, height })
  }

  drag(contentsId: number, phase: 'start' | 'move' | 'end'): void {
    const entry = this.byContents.get(contentsId)
    if (!entry?.mini || entry.win.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    if (phase === 'start') {
      const { x, y } = entry.win.getBounds()
      this.dragOffset = { x: cursor.x - x, y: cursor.y - y }
      return
    }
    if (!this.dragOffset) return
    const { width, height } = entry.win.getBounds()
    entry.win.setBounds({
      x: Math.round(cursor.x - this.dragOffset.x),
      y: Math.round(cursor.y - this.dragOffset.y),
      width,
      height,
    })
    if (phase === 'end') this.dragOffset = null
  }

  private applyMini(entry: Entry): void {
    if (!entry.mini) return
    // Travada: o clique vai para o jogo; o mouse ainda "passa" (forward) para mostrar o selo.
    entry.win.setIgnoreMouseEvents(entry.mini.locked, { forward: true })
    entry.win.setOpacity(entry.mini.opacity)
    entry.win.webContents.send(IpcChannel.ViewerMiniState, entry.mini)
  }

  /** Saiu da chamada: nenhuma transmissão continua aberta na tela. */
  closeAll(): void {
    for (const entry of this.byIdentity.values()) if (!entry.win.isDestroyed()) entry.win.close()
  }

  targetFor(webContentsId: number): ViewerTarget | null {
    return this.byContents.get(webContentsId)?.target ?? null
  }

  miniStateFor(webContentsId: number): MiniViewerState | null {
    return this.byContents.get(webContentsId)?.mini ?? null
  }

  isViewer(webContentsId: number): boolean {
    return this.byContents.has(webContentsId)
  }
}
