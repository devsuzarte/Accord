import { tm } from '../i18n'
import type { BrowserWindow } from 'electron'
import type { ViewerTarget } from '@sharescreen/shared'
import { createViewerWindow } from '../windows/viewer'

/** Uma janela de viewer por pessoa transmitindo; abrir de novo só traz a janela para frente. */
export class ViewerManager {
  private readonly windows = new Map<string, BrowserWindow>()
  private readonly targets = new Map<number, ViewerTarget>()

  open(target: ViewerTarget): void {
    const existing = this.windows.get(target.identity)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
      return
    }
    const win = createViewerWindow(tm('viewer.windowTitle', { name: target.name }))
    const id = win.webContents.id
    this.windows.set(target.identity, win)
    this.targets.set(id, target)
    win.on('closed', () => {
      this.windows.delete(target.identity)
      this.targets.delete(id)
    })
  }

  targetFor(webContentsId: number): ViewerTarget | null {
    return this.targets.get(webContentsId) ?? null
  }
}
