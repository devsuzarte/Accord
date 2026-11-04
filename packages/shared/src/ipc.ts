/**
 * Allowlist de canais IPC entre renderer e main.
 * Qualquer canal novo precisa ser declarado aqui, no PlatformBridge, no preload e no main.
 */
export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  AppQuit: 'app:quit',

  /** pill → main: tamanho medido do conteúdo (a janela acompanha o DOM). */
  OverlayResize: 'overlay:resize',
  OverlayGetState: 'overlay:get-state',
  OverlaySetGhost: 'overlay:set-ghost',
  OverlayMoveTo: 'overlay:move-to',
  OverlayDrag: 'overlay:drag',
  /** main → renderers: estado do overlay mudou. */
  OverlayStateChanged: 'overlay:state-changed',

  PanelToggle: 'panel:toggle',
  PanelClose: 'panel:close',
  PanelResize: 'panel:resize',
  PanelHold: 'panel:hold',
  UpdateGetState: 'update:get-state',
  UpdateCheck: 'update:check',
  UpdateInstall: 'update:install',
  UpdateStateChanged: 'update:state-changed',
  /** main → painel: qual aba abrir. */
  PanelOpenTab: 'panel:open-tab',

  HotkeysList: 'hotkeys:list',

  /** painel → main → pill: entrar/sair do canal (a conexão vive no pill). */
  CallCommand: 'call:command',
  /** pill → main: retrato atual da chamada. */
  CallReport: 'call:report',
  /** main → painel: retrato da chamada mudou. */
  CallStateChanged: 'call:state-changed',
  CallGetState: 'call:get-state',

  /** pill → main: abrir o seletor de tela. */
  ShareOpenPicker: 'share:open-picker',
  /** seletor → main: telas e janelas disponíveis. */
  ShareListSources: 'share:list-sources',
  /** seletor → main: fonte escolhida (ou cancelar). */
  ShareSelect: 'share:select',
  ShareCancel: 'share:cancel',
  /** main → pill: comece a transmitir esta fonte. */
  ShareStart: 'share:start',
  /** pill → main: ligar/desligar a captura nativa de som da transmissão. */
  ShareAudioStart: 'share:audio-start',
  ShareAudioStop: 'share:audio-stop',
  /** main → pill: MessagePort por onde chega o PCM da transmissão. */
  ShareAudioPort: 'share:audio-port',

  /** pill → main: abrir o viewer de alguém. */
  ViewerOpen: 'viewer:open',
  /** viewer → main: quem esta janela deve mostrar. */
  ViewerGetTarget: 'viewer:get-target',

  /** pill → main: abrir/fechar a janela com a lista de pessoas. */
  PeopleToggle: 'people:toggle',
  PeopleClose: 'people:close',
  PeopleResize: 'people:resize',

  /** Perfil (nome e foto) e aparência: guardados no main, enviados a todas as janelas. */
  ProfileGet: 'profile:get',
  ProfileSet: 'profile:set',
  ProfileChanged: 'profile:changed',
  ThemeGet: 'theme:get',
  ThemeSet: 'theme:set',
  ThemeChanged: 'theme:changed',

  /** Idioma do app (PT-BR ou inglês; "sistema" segue o Windows). */
  LanguageGet: 'language:get',
  LanguageSet: 'language:set',
  LanguageChanged: 'language:changed',

  /** painel → main: procurar servidores na rede, Radmin, Tailscale e endereços salvos. */
  DiscoveryScan: 'discovery:scan',
  /** painel → main: testar um endereço digitado. */
  DiscoveryProbe: 'discovery:probe',

  /** Hospedar pelo app: o main sobe o servidor (API + LiveKit) como processo filho. */
  HostGetState: 'host:get-state',
  HostStart: 'host:start',
  HostStop: 'host:stop',
  HostStateChanged: 'host:state-changed',
  HostSetPassword: 'host:set-password',
  ChatReport: 'chat:report',
  ChatGetState: 'chat:get-state',
  ChatStateChanged: 'chat:state-changed',
  ChatToggle: 'chat:toggle',
  ChatSetMode: 'chat:set-mode',
  ChatModeChanged: 'chat:mode-changed',
  ChatResize: 'chat:resize',
  ChatGetPrefs: 'chat:get-prefs',
  ChatSetPrefs: 'chat:set-prefs',
  ChatPrefsChanged: 'chat:prefs-changed',
  ChatUnreadChanged: 'chat:unread-changed',
  SessionMirror: 'session:mirror',
  SessionSaveMessages: 'session:save-messages',
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Marca da mensagem `window.postMessage` que entrega o MessagePort do som da transmissão. */
export const SHARE_AUDIO_PORT_MESSAGE = 'sharescreen:share-audio-port'

export interface AppInfo {
  name: string
  version: string
  platform: string
  electron: string
  chrome: string
}

export type PanelTab = 'channels' | 'overlay' | 'you' | 'appearance'

/** Canto/borda para onde o pill pode ser mandado. */
export type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** De que lado da tela o pill está encaixado (define para onde ele cresce e onde o painel abre). */
export interface OverlayEdges {
  horizontal: 'left' | 'right' | null
  vertical: 'top' | 'bottom' | null
}

export interface OverlayState {
  visible: boolean
  /** Modo fantasma: cliques atravessam o pill. */
  ghost: boolean
  panelOpen: boolean
  edges: OverlayEdges
}

export interface Size {
  width: number
  height: number
}

export interface HotkeyInfo {
  id: 'toggle-overlay' | 'toggle-ghost'
  accelerator: string
  registered: boolean
}

/** Como a janela de chat aparece: aberta (com o campo de texto) ou mínima (só as mensagens rolando). */
export type ChatMode = 'expanded' | 'mini'

export interface ChatPrefs {
  /** Mostrar as mensagens rolando na tela (modo mínimo) durante a chamada. */
  overlay: boolean
}
