import { app, ipcMain } from 'electron'
import type { IpcMainEvent } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type {
  AppInfo,
  CallCommand,
  CallSnapshot,
  OverlayCorner,
  PanelTab,
  ShareRequest,
  Size,
  ViewerTarget,
} from '@sharescreen/shared'
import type { HotkeyService } from './hotkeys'
import { tm } from './i18n'
import type { DiscoveryService } from './network/discovery'
import type { HostService } from './network/host-service'
import type { PeopleWindow } from './overlay/people-window'
import type { SettingsStore } from './settings/settings-store'
import type { ShareService } from './share/share-service'
import type { ViewerManager } from './share/viewer-manager'
import type { OverlayManager } from './overlay/overlay-manager'

const corners: OverlayCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const tabs: PanelTab[] = ['channels', 'overlay', 'you', 'appearance']

function isSize(value: unknown): value is Size {
  const v = value as Size
  return (
    typeof v === 'object' &&
    v !== null &&
    Number.isFinite(v.width) &&
    Number.isFinite(v.height) &&
    v.width > 0 &&
    v.height > 0 &&
    v.width < 4000 &&
    v.height < 4000
  )
}

function isCallCommand(value: unknown): value is CallCommand {
  const v = value as CallCommand
  if (typeof v !== 'object' || v === null) return false
  if (v.type === 'leave' || v.type === 'toggle-mic' || v.type === 'toggle-deafen') return true
  if (v.type === 'set-input' || v.type === 'set-output') {
    return typeof v.deviceId === 'string' && v.deviceId.length < 512
  }
  if (v.type === 'set-noise') return v.mode === 'rnnoise' || v.mode === 'standard'
  if (v.type === 'set-sounds') return typeof v.enabled === 'boolean'
  if (v.type === 'local-mute') {
    return (
      typeof v.name === 'string' &&
      v.name.length <= 32 &&
      (v.kind === 'mic' || v.kind === 'audio') &&
      typeof v.muted === 'boolean'
    )
  }
  if (v.type === 'moderate') {
    return (
      moderationActions.includes(v.action) && typeof v.target === 'string' && v.target.length < 128
    )
  }
  if (v.type === 'watch') return typeof v.identity === 'string' && v.identity.length < 128
  return (
    v.type === 'join' &&
    typeof v.name === 'string' &&
    v.name.trim().length > 0 &&
    v.name.length <= 32 &&
    typeof v.serverUrl === 'string' &&
    /^https?:\/\//.test(v.serverUrl)
  )
}

const idleCall: CallSnapshot = {
  status: 'idle',
  audio: {
    micMuted: false,
    deafened: false,
    inputDeviceId: '',
    outputDeviceId: '',
    noiseSuppression: 'rnnoise',
    sounds: true,
  },
  sharing: null,
  channelName: null,
  participants: [],
  error: null,
}

const presets = ['balanced', 'smooth', 'motion', 'fluid']

function isShareRequest(value: unknown): value is ShareRequest {
  const v = value as ShareRequest
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.sourceId === 'string' &&
    /^(screen|window):/.test(v.sourceId) &&
    typeof v.sourceName === 'string' &&
    (v.kind === 'screen' || v.kind === 'window') &&
    presets.includes(v.preset) &&
    typeof v.audio === 'boolean'
  )
}

function isViewerTarget(value: unknown): value is ViewerTarget {
  const v = value as ViewerTarget
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.identity === 'string' &&
    typeof v.name === 'string' &&
    typeof v.serverUrl === 'string' &&
    /^https?:\/\//.test(v.serverUrl)
  )
}

/** Handlers do main. Todo canal novo: declarar em packages/shared/src/ipc.ts primeiro. */
export interface IpcDependencies {
  overlay: OverlayManager
  hotkeys: HotkeyService
  share: ShareService
  viewers: ViewerManager
  people: PeopleWindow
  settings: SettingsStore
  discovery: DiscoveryService
  host: HostService
}

const moderationActions = [
  'mute-mic',
  'unmute-mic',
  'mute-audio',
  'unmute-audio',
  'kick',
  'make-admin',
  'remove-admin',
]

export function registerIpcHandlers({
  overlay,
  hotkeys,
  share,
  viewers,
  people,
  settings,
  discovery,
  host,
}: IpcDependencies): void {
  type Sender = Pick<IpcMainEvent, 'sender'>
  const fromPill = (event: Sender) => overlay.isPill(event.sender.id)
  const fromPanel = (event: Sender) => overlay.isPanel(event.sender.id)

  ipcMain.handle(IpcChannel.AppGetInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }))
  ipcMain.on(IpcChannel.AppQuit, () => app.quit())

  ipcMain.on(IpcChannel.OverlayResize, (event, size: unknown) => {
    if (fromPill(event) && isSize(size)) overlay.resizePill(size)
  })
  ipcMain.handle(IpcChannel.OverlayGetState, () => overlay.getState())
  ipcMain.on(IpcChannel.OverlaySetGhost, (_event, ghost: unknown) => {
    if (typeof ghost === 'boolean') overlay.setGhost(ghost)
  })
  ipcMain.on(IpcChannel.OverlayDrag, (event, phase: unknown) => {
    if (fromPill(event) && (phase === 'start' || phase === 'move' || phase === 'end')) {
      overlay.drag(phase)
    }
  })
  ipcMain.on(IpcChannel.OverlayMoveTo, (_event, corner: unknown) => {
    if (corners.includes(corner as OverlayCorner)) overlay.moveTo(corner as OverlayCorner)
  })

  ipcMain.on(IpcChannel.PanelToggle, (_event, tab: unknown) => {
    overlay.togglePanel(tabs.includes(tab as PanelTab) ? (tab as PanelTab) : undefined)
  })
  ipcMain.on(IpcChannel.PanelClose, () => overlay.hidePanel())
  ipcMain.on(IpcChannel.PanelHold, (event, hold: unknown) => {
    if (fromPanel(event) && typeof hold === 'boolean') overlay.holdPanel(hold)
  })
  ipcMain.on(IpcChannel.PanelResize, (event, size: unknown) => {
    if (fromPanel(event) && isSize(size)) overlay.resizePanel(size)
  })

  ipcMain.handle(IpcChannel.HotkeysList, () => hotkeys.list())

  // Idioma: qualquer janela lê; só o painel troca.
  ipcMain.handle(IpcChannel.LanguageGet, () => settings.getLanguage())
  ipcMain.on(IpcChannel.LanguageSet, (event, setting: unknown) => {
    if (fromPanel(event)) settings.setLanguage(setting)
  })

  // Procurar canais e hospedar (só o painel).
  ipcMain.handle(IpcChannel.DiscoveryScan, (event, saved: unknown) => {
    if (!fromPanel(event)) return []
    const list = Array.isArray(saved)
      ? saved.filter((s): s is string => typeof s === 'string' && s.length < 256)
      : []
    return discovery.scan(list)
  })
  ipcMain.handle(IpcChannel.DiscoveryProbe, (event, address: unknown) => {
    if (!fromPanel(event) || typeof address !== 'string' || address.length > 255) {
      return { ok: false, url: '' }
    }
    return discovery.probe(address)
  })
  ipcMain.handle(IpcChannel.HostGetState, () => host.refresh())
  ipcMain.on(IpcChannel.HostStart, (event) => {
    if (fromPanel(event)) void host.start()
  })
  ipcMain.on(IpcChannel.HostStop, (event) => {
    if (fromPanel(event)) host.stop()
  })

  // Chamada: a conexão vive no pill; o main só repassa e guarda o último retrato.
  let lastCall: CallSnapshot = idleCall
  ipcMain.on(IpcChannel.CallCommand, (event, command: unknown) => {
    if ((fromPanel(event) || people.is(event.sender.id)) && isCallCommand(command)) {
      overlay.sendToPill(IpcChannel.CallCommand, command)
    }
  })
  ipcMain.on(IpcChannel.CallReport, (event, snapshot: CallSnapshot) => {
    if (!fromPill(event)) return
    lastCall = snapshot
    overlay.sendToPanel(IpcChannel.CallStateChanged, snapshot)
    people.send(IpcChannel.CallStateChanged, snapshot)
    // Saiu da chamada: a lista de pessoas não tem mais o que mostrar.
    if (snapshot.status === 'idle') people.hide()
  })
  ipcMain.handle(IpcChannel.CallGetState, () => lastCall)

  // Compartilhamento de tela.
  ipcMain.on(IpcChannel.ShareOpenPicker, (event) => {
    if (fromPill(event)) share.openPicker()
  })
  ipcMain.handle(IpcChannel.ShareListSources, (event) =>
    share.isPicker(event.sender.id) ? share.listSources() : { sources: [], audioSupported: false },
  )
  ipcMain.on(IpcChannel.ShareSelect, (event, request: unknown) => {
    if (share.isPicker(event.sender.id) && isShareRequest(request)) share.select(request)
  })
  ipcMain.on(IpcChannel.ShareCancel, (event) => {
    if (share.isPicker(event.sender.id)) share.closePicker()
  })
  ipcMain.handle(IpcChannel.ShareAudioStart, (event, source: unknown) => {
    const s = source as { kind?: unknown; sourceId?: unknown }
    if (!overlay.isPill(event.sender.id)) return { ok: false, reason: tm('share.audio.badOrigin') }
    if ((s?.kind !== 'screen' && s?.kind !== 'window') || typeof s.sourceId !== 'string') {
      return { ok: false, reason: tm('share.audio.badSource') }
    }
    return share.startAudio(s.kind, s.sourceId)
  })
  ipcMain.on(IpcChannel.ShareAudioStop, (event) => {
    if (fromPill(event)) share.stopAudio()
  })

  // Viewer.
  ipcMain.on(IpcChannel.ViewerOpen, (event, target: unknown) => {
    if (fromPill(event) && isViewerTarget(target)) viewers.open(target)
  })
  ipcMain.handle(IpcChannel.ViewerGetTarget, (event) => viewers.targetFor(event.sender.id))

  // Lista de pessoas.
  ipcMain.on(IpcChannel.PeopleToggle, (event) => {
    if (fromPill(event)) people.toggle()
  })
  ipcMain.on(IpcChannel.PeopleClose, (event) => {
    if (people.is(event.sender.id)) people.hide()
  })
  ipcMain.on(IpcChannel.PeopleResize, (event, size: unknown) => {
    if (people.is(event.sender.id) && isSize(size)) people.resize(size)
  })

  // Perfil e aparência (qualquer janela do app lê; só o painel grava).
  ipcMain.handle(IpcChannel.ProfileGet, () => settings.getProfile())
  ipcMain.on(IpcChannel.ProfileSet, (event, profile: unknown) => {
    if (fromPanel(event)) settings.setProfile(profile)
  })
  ipcMain.handle(IpcChannel.ThemeGet, () => settings.getTheme())
  ipcMain.on(IpcChannel.ThemeSet, (event, theme: unknown) => {
    if (fromPanel(event)) settings.setTheme(theme)
  })
}
