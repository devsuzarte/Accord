import { app, clipboard, Menu, nativeImage, Notification, shell, Tray } from 'electron'
import { tm } from './i18n'
import { diagnosticReport, logDirectory } from './logger'
import trayIconPath from '../../resources/tray.png?asset'
import type { OverlayManager } from './overlay/overlay-manager'
import type { Updater } from './updater'

/**
 * Sem janela principal e fora da barra de tarefas, a bandeja é a "porta de saída" do app.
 */
export function createTray(
  overlay: OverlayManager,
  profile?: string,
  updater?: Updater,
): { tray: Tray; rebuild: () => void } {
  const tray = new Tray(nativeImage.createFromPath(trayIconPath))
  tray.setToolTip(profile ? `Accord (${profile})` : 'Accord')

  const rebuild = () => {
    const state = overlay.getState()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: state.visible ? tm('tray.hideOverlay') : tm('tray.showOverlay'),
          accelerator: 'CommandOrControl+Shift+O',
          click: () => {
            overlay.toggleVisible()
            rebuild()
          },
        },
        {
          label: tm('tray.ghost'),
          type: 'checkbox',
          checked: state.ghost,
          accelerator: 'CommandOrControl+Shift+G',
          click: () => {
            overlay.toggleGhost()
            rebuild()
          },
        },
        { label: tm('tray.openPanel'), click: () => overlay.openPanel('channels') },
        { type: 'separator' },
        {
          label: tm('tray.help'),
          submenu: [
            {
              label: tm('tray.copyDiagnostics'),
              click: () => {
                clipboard.writeText(diagnosticReport())
                if (Notification.isSupported()) {
                  new Notification({
                    title: tm('tray.diagnosticsCopied'),
                    body: tm('tray.diagnosticsCopiedBody'),
                  }).show()
                }
              },
            },
            { label: tm('tray.openLogs'), click: () => void shell.openPath(logDirectory()) },
          ],
        },
        { type: 'separator' },
        ...(updater?.getState().status === 'ready'
          ? [
              {
                label: tm('tray.installUpdate', { version: updater.getState().version ?? '' }),
                click: () => updater.install(),
              },
            ]
          : []),
        { label: tm('tray.quit'), click: () => app.quit() },
      ]),
    )
  }

  rebuild()
  tray.on('click', () => {
    if (!overlay.getState().visible) overlay.setVisible(true)
    overlay.togglePanel('channels')
  })
  // O menu reflete o estado atual sempre que é aberto.
  tray.on('right-click', rebuild)
  return { tray, rebuild }
}
