import { join } from 'node:path'
import { app } from 'electron'
import { HotkeyService } from './hotkeys'
import { captureRendererLogs, setupLogging } from './logger'
import { registerIpcHandlers } from './ipc'
import { OverlayManager } from './overlay/overlay-manager'
import { DiscoveryService } from './network/discovery'
import { HostService } from './network/host-service'
import { PeopleWindow } from './overlay/people-window'
import { SettingsStore } from './settings/settings-store'
import { ShareService } from './share/share-service'
import { ViewerManager } from './share/viewer-manager'
import { createTray } from './tray'

/**
 * --profile=<nome>: pasta de dados separada. Serve para abrir uma segunda instância
 * no mesmo PC e testar uma chamada consigo mesmo (a trava de instância única é por pasta).
 */
const profile = process.argv
  .find((arg) => arg.startsWith('--profile='))
  ?.slice('--profile='.length)
  .replace(/[^a-zA-Z0-9_-]/g, '')
if (profile) {
  app.setPath('userData', join(app.getPath('appData'), `Accord-${profile}`))
}

// O áudio da chamada toca sem precisar de um clique antes (política de autoplay do Chromium).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Uma instância por perfil: abrir de novo traz o overlay e o painel
// (também é por aqui que chegarão os links accord:// no M4).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // A segunda instância começa no canto oposto para não ficar em cima da primeira.
  const overlay = new OverlayManager({ defaultCorner: profile ? 'top-right' : 'top-left' })
  const hotkeys = new HotkeyService(overlay)
  const share = new ShareService(overlay)
  const viewers = new ViewerManager()
  const host = new HostService()

  app.on('second-instance', () => overlay.openPanel('channels'))

  app.on('web-contents-created', (_event, contents) => {
    contents.once('did-finish-load', () => {
      const page = contents.getURL().split('/').slice(-2, -1)[0] ?? 'janela'
      captureRendererLogs(contents, page)
    })
  })

  app.whenReady().then(() => {
    setupLogging()
    app.setAppUserModelId('com.devsuzarte.accord')
    const settings = new SettingsStore()
    overlay.create()
    hotkeys.registerAll()
    share.register()
    const people = new PeopleWindow(overlay)
    const discovery = new DiscoveryService()
    registerIpcHandlers({ overlay, hotkeys, share, viewers, people, settings, discovery, host })
    const tray = createTray(overlay, profile)
    settings.onLanguageChange = tray.rebuild
  })

  // O app vive na bandeja: fechar janelas não encerra; só "Sair" encerra.
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => {
    hotkeys.dispose()
    // O servidor aberto pelo botão Hospedar fecha junto com o app.
    host.stop()
  })
}
