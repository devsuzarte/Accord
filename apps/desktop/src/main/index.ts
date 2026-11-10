import { join } from 'node:path'
import { app, BrowserWindow, powerMonitor } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import { HotkeyService } from './hotkeys'
import { captureRendererLogs, setupLogging } from './logger'
import { registerIpcHandlers } from './ipc'
import { OverlayManager } from './overlay/overlay-manager'
import { DiscoveryService } from './network/discovery'
import { HostService } from './network/host-service'
import { SessionMirror } from './network/session-mirror'
import { restrictPermissions } from './windows/permissions'
import { ChatWindow } from './overlay/chat-window'
import { PeopleWindow } from './overlay/people-window'
import { SettingsStore } from './settings/settings-store'
import { ShareService } from './share/share-service'
import { PointerWindow } from './overlay/pointer-window'
import { ViewerManager } from './share/viewer-manager'
import { createTray } from './tray'
import { InviteService } from './invites'
import { applyHardwareAccelerationChoice, watchChildProcesses } from './process-watch'
import { Updater, updatesEnabled } from './updater'

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

// GPU que trava sem parar: a pessoa pode ter escolhido rodar sem aceleração (docs/16 P3).
applyHardwareAccelerationChoice()
watchChildProcesses()

// Só em desenvolvimento: SHARESCREEN_FAKE_MEDIA=1 troca microfone e câmera por dispositivos
// falsos do Chromium (um bipe e uma imagem de teste). Duas instâncias no mesmo PC deixam de
// brigar pelo microfone, e dá para testar sem nenhum dispositivo (docs/16 P5).
if (!app.isPackaged && process.env.SHARESCREEN_FAKE_MEDIA === '1') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  console.info('[app] microfone e câmera falsos (SHARESCREEN_FAKE_MEDIA=1)')
}

// O áudio da chamada toca sem precisar de um clique antes (política de autoplay do Chromium).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Windows: o Chromium calcula se a janela está "coberta" e, se estiver, para de desenhá-la.
// Depois de Win+L, de a tela apagar por inatividade ou de ocultar o overlay, as janelas
// transparentes e sempre no topo às vezes não voltam desse estado: aparecem, mas param de
// responder. Sem esse cálculo, elas continuam vivas.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

// Uma instância por perfil: abrir de novo traz o overlay e o painel
// (também é por aqui que chegarão os links accord:// no M4).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // A segunda instância começa no canto oposto para não ficar em cima da primeira.
  const overlay = new OverlayManager({ defaultCorner: profile ? 'top-right' : 'top-left' })
  const hotkeys = new HotkeyService(overlay)
  const share = new ShareService(overlay)
  const pointer = new PointerWindow(share)
  const viewers = new ViewerManager()
  let mirror: SessionMirror | null = null
  let host: HostService | null = null

  const invites = new InviteService(overlay)

  // Abrir de novo (ou clicar num convite com o app aberto) traz o painel.
  app.on('second-instance', (_event, argv) => {
    if (!invites.handleArgs(argv)) overlay.openPanel('channels')
  })

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
    hotkeys.registerAll({
      call: (command) => overlay.sendToPill(IpcChannel.CallCommand, command),
      unlockMini: () => viewers.unlockAll(),
    })
    share.register()
    const people = new PeopleWindow(overlay)
    const discovery = new DiscoveryService()
    const updater = new Updater(updatesEnabled(profile))
    const sessionMirror = new SessionMirror()
    // Sobra de uma sessão anterior (o app fechou sem sair da call): nada fica guardado.
    sessionMirror.clear()
    restrictPermissions()
    const hostService = new HostService(sessionMirror)
    mirror = sessionMirror
    host = hostService
    const chat = new ChatWindow(overlay, (channel, payload) => overlay.sendToPill(channel, payload))
    const { retryPill } = registerIpcHandlers({
      overlay,
      hotkeys,
      share,
      pointer,
      viewers,
      people,
      settings,
      discovery,
      host: hostService,
      updater,
      chat,
      mirror: sessionMirror,
      invites,
    })
    const tray = createTray(overlay, profile, updater, () => viewers.unlockAll(), retryPill)
    updater.onReady = tray.rebuild
    settings.onLanguageChange = tray.rebuild
    invites.register()
    // O app foi aberto por um convite: espera o painel carregar e mostra.
    setTimeout(() => invites.handleArgs(process.argv), 1500)

    // Voltou do bloqueio, da suspensão ou da inatividade: redesenha e reaplica o "sempre no topo".
    const wake = (reason: string) => {
      console.info(`[app] ${reason}: atualizando as janelas do overlay`)
      overlay.refresh()
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.invalidate()
      }
    }
    powerMonitor.on('unlock-screen', () => wake('desbloqueou'))
    powerMonitor.on('resume', () => wake('voltou da suspensão'))
    powerMonitor.on('user-did-become-active', () => wake('voltou da inatividade'))
  })

  // O app vive na bandeja: fechar janelas não encerra; só "Sair" encerra.
  app.on('window-all-closed', () => {})
  // Sair hospedando: passa a sessão para o próximo da fila (avisando antes, para ser rápido)
  // em vez de deixar todo mundo esperando a conexão cair.
  let handedOff = false
  app.on('before-quit', (event) => {
    if (handedOff || !host || host.getState().status !== 'running') return
    event.preventDefault()
    handedOff = true
    void host.stop('handoff').finally(() => app.quit())
  })
  app.on('will-quit', () => {
    hotkeys.dispose()
    // O servidor aberto pelo botão Hospedar fecha junto com o app.
    host?.kill()
    mirror?.clear()
  })
}
