import { globalShortcut } from 'electron'
import type { HotkeyInfo } from '@sharescreen/shared'
import type { OverlayManager } from './overlay/overlay-manager'

/**
 * Atalhos globais num lugar só (§2 item 16).
 * Ctrl+Shift evita colidir com os atalhos mais comuns de jogos (WASD, Ctrl+setas).
 * Se outro app já usar o atalho, o registro falha e o painel mostra o aviso.
 */
export class HotkeyService {
  private hotkeys: HotkeyInfo[] = []

  constructor(private readonly overlay: OverlayManager) {}

  registerAll(): void {
    const definitions: Array<Omit<HotkeyInfo, 'registered'> & { run: () => void }> = [
      {
        id: 'toggle-overlay',
        accelerator: 'CommandOrControl+Shift+O',
        run: () => this.overlay.toggleVisible(),
      },
      {
        id: 'toggle-ghost',
        accelerator: 'CommandOrControl+Shift+G',
        run: () => this.overlay.toggleGhost(),
      },
    ]

    this.hotkeys = definitions.map(({ run, ...info }) => {
      const registered = globalShortcut.register(info.accelerator, run)
      if (!registered) console.warn(`[hotkeys] atalho em uso por outro app: ${info.accelerator}`)
      return { ...info, registered }
    })
  }

  list(): HotkeyInfo[] {
    return this.hotkeys
  }

  dispose(): void {
    globalShortcut.unregisterAll()
  }
}
