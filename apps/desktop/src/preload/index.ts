/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IpcChannel, SHARE_AUDIO_PORT_MESSAGE } from '@sharescreen/shared'
import type { ChatMode, ChatPrefs, Invite } from '@sharescreen/shared'
import type {
  CallCommand,
  CallSnapshot,
  HostState,
  LanguageState,
  OverlayState,
  PanelTab,
  PlatformBridge,
  Profile,
  ShareRequest,
  Theme,
  UpdateState,
  ChatState,
} from '@sharescreen/shared'

/** Assina um canal main → renderer e devolve a função de cancelar. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

/**
 * Implementação Electron do PlatformBridge.
 * Nunca exponha ipcRenderer diretamente ao renderer.
 */
const platform: PlatformBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
    quit: () => ipcRenderer.send(IpcChannel.AppQuit),
  },
  overlay: {
    resize: (size) => ipcRenderer.send(IpcChannel.OverlayResize, size),
    getState: () => ipcRenderer.invoke(IpcChannel.OverlayGetState),
    setGhost: (ghost) => ipcRenderer.send(IpcChannel.OverlaySetGhost, ghost),
    moveTo: (corner) => ipcRenderer.send(IpcChannel.OverlayMoveTo, corner),
    drag: (phase) => ipcRenderer.send(IpcChannel.OverlayDrag, phase),
    onStateChange: (listener) => subscribe<OverlayState>(IpcChannel.OverlayStateChanged, listener),
  },
  panel: {
    toggle: (tab) => ipcRenderer.send(IpcChannel.PanelToggle, tab),
    close: () => ipcRenderer.send(IpcChannel.PanelClose),
    resize: (size) => ipcRenderer.send(IpcChannel.PanelResize, size),
    hold: (hold) => ipcRenderer.send(IpcChannel.PanelHold, hold),
    onOpenTab: (listener) => subscribe<PanelTab>(IpcChannel.PanelOpenTab, listener),
  },
  hotkeys: {
    list: () => ipcRenderer.invoke(IpcChannel.HotkeysList),
    voice: () => ipcRenderer.invoke(IpcChannel.VoiceHotkeysGet),
    setVoice: (patch) => ipcRenderer.invoke(IpcChannel.VoiceHotkeysSet, patch),
    onVoiceChange: (listener) => subscribe(IpcChannel.VoiceHotkeysChanged, listener),
    capturing: (active) => ipcRenderer.send(IpcChannel.VoiceHotkeyCapture, active),
  },
  call: {
    command: (command) => ipcRenderer.send(IpcChannel.CallCommand, command),
    onCommand: (listener) => subscribe<CallCommand>(IpcChannel.CallCommand, listener),
    report: (snapshot) => ipcRenderer.send(IpcChannel.CallReport, snapshot),
    getState: () => ipcRenderer.invoke(IpcChannel.CallGetState),
    onState: (listener) => subscribe<CallSnapshot>(IpcChannel.CallStateChanged, listener),
  },
  share: {
    openPicker: () => ipcRenderer.send(IpcChannel.ShareOpenPicker),
    listSources: () => ipcRenderer.invoke(IpcChannel.ShareListSources),
    select: (request) => ipcRenderer.send(IpcChannel.ShareSelect, request),
    cancel: () => ipcRenderer.send(IpcChannel.ShareCancel),
    onStart: (listener) => subscribe<ShareRequest>(IpcChannel.ShareStart, listener),
    startAudio: (source) => ipcRenderer.invoke(IpcChannel.ShareAudioStart, source),
    stopAudio: () => ipcRenderer.send(IpcChannel.ShareAudioStop),
  },
  viewer: {
    open: (target) => ipcRenderer.send(IpcChannel.ViewerOpen, target),
    getTarget: () => ipcRenderer.invoke(IpcChannel.ViewerGetTarget),
    toggleMini: () => ipcRenderer.send(IpcChannel.ViewerToggleMini),
    setMini: (patch) => ipcRenderer.send(IpcChannel.ViewerMiniSet, patch),
    onMiniState: (listener) => subscribe(IpcChannel.ViewerMiniState, listener),
    cycleMiniSize: () => ipcRenderer.send(IpcChannel.ViewerMiniSize),
    drag: (phase) => ipcRenderer.send(IpcChannel.ViewerDrag, phase),
  },
  people: {
    toggle: () => ipcRenderer.send(IpcChannel.PeopleToggle),
    close: () => ipcRenderer.send(IpcChannel.PeopleClose),
    resize: (size) => ipcRenderer.send(IpcChannel.PeopleResize, size),
  },
  profile: {
    get: () => ipcRenderer.invoke(IpcChannel.ProfileGet),
    set: (profile) => ipcRenderer.send(IpcChannel.ProfileSet, profile),
    onChange: (listener) => subscribe<Profile>(IpcChannel.ProfileChanged, listener),
  },
  theme: {
    get: () => ipcRenderer.invoke(IpcChannel.ThemeGet),
    set: (theme) => ipcRenderer.send(IpcChannel.ThemeSet, theme),
    onChange: (listener) => subscribe<Theme>(IpcChannel.ThemeChanged, listener),
  },
  language: {
    get: () => ipcRenderer.invoke(IpcChannel.LanguageGet),
    set: (setting) => ipcRenderer.send(IpcChannel.LanguageSet, setting),
    onChange: (listener) => subscribe<LanguageState>(IpcChannel.LanguageChanged, listener),
  },
  discovery: {
    scan: (saved) => ipcRenderer.invoke(IpcChannel.DiscoveryScan, saved),
    probe: (address) => ipcRenderer.invoke(IpcChannel.DiscoveryProbe, address),
  },
  host: {
    getState: () => ipcRenderer.invoke(IpcChannel.HostGetState),
    start: (options) => ipcRenderer.invoke(IpcChannel.HostStart, options),
    setPassword: (password) => ipcRenderer.invoke(IpcChannel.HostSetPassword, password),
    stop: (mode) => ipcRenderer.send(IpcChannel.HostStop, mode ?? 'end'),
    rotateInvite: () => ipcRenderer.invoke(IpcChannel.HostRotateInvite),
    allowFirewall: () => ipcRenderer.invoke(IpcChannel.HostAllowFirewall),
    onChange: (listener) => subscribe<HostState>(IpcChannel.HostStateChanged, listener),
  },
  update: {
    getState: () => ipcRenderer.invoke(IpcChannel.UpdateGetState),
    check: () => ipcRenderer.send(IpcChannel.UpdateCheck),
    install: () => ipcRenderer.send(IpcChannel.UpdateInstall),
    onChange: (listener) => subscribe<UpdateState>(IpcChannel.UpdateStateChanged, listener),
  },
  chat: {
    report: (state) => ipcRenderer.send(IpcChannel.ChatReport, state),
    getState: () => ipcRenderer.invoke(IpcChannel.ChatGetState),
    onState: (listener) => subscribe<ChatState>(IpcChannel.ChatStateChanged, listener),
    toggle: () => ipcRenderer.send(IpcChannel.ChatToggle),
    setMode: (mode) => ipcRenderer.send(IpcChannel.ChatSetMode, mode),
    onMode: (listener) => subscribe<ChatMode>(IpcChannel.ChatModeChanged, listener),
    resize: (size) => ipcRenderer.send(IpcChannel.ChatResize, size),
    getPrefs: () => ipcRenderer.invoke(IpcChannel.ChatGetPrefs),
    setPrefs: (prefs) => ipcRenderer.send(IpcChannel.ChatSetPrefs, prefs),
    onPrefs: (listener) => subscribe<ChatPrefs>(IpcChannel.ChatPrefsChanged, listener),
    onUnread: (listener) => subscribe<number>(IpcChannel.ChatUnreadChanged, listener),
  },
  session: {
    mirror: (request) => ipcRenderer.send(IpcChannel.SessionMirror, request),
    saveMessages: (messages) => ipcRenderer.invoke(IpcChannel.SessionSaveMessages, messages),
    mirrorNow: () => ipcRenderer.invoke(IpcChannel.SessionMirrorNow),
  },
  pointer: {
    show: (ping) => ipcRenderer.send(IpcChannel.PointerShow, ping),
    onPing: (listener) => subscribe(IpcChannel.PointerPing, listener),
  },
  invite: {
    take: () => ipcRenderer.invoke(IpcChannel.InviteTake),
    onInvite: (listener) => subscribe<Invite>(IpcChannel.InviteReceived, listener),
  },
}

// MessagePorts não atravessam o contextBridge: repassamos pela janela.
ipcRenderer.on(IpcChannel.ShareAudioPort, (event) => {
  window.postMessage({ type: SHARE_AUDIO_PORT_MESSAGE }, '*', event.ports)
})

contextBridge.exposeInMainWorld('platform', platform)
