/**
 * Allowlist de canais IPC entre renderer e main.
 * Qualquer canal novo precisa ser declarado aqui, no PlatformBridge, no preload e no main.
 */
export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  AppQuit: 'app:quit',
  /** O que este PC consegue fazer (docs/16 P7). */
  AppGetCapabilities: 'app:get-capabilities',
  /** Esconder as janelas do Accord das capturas de tela (docs/16 P6). */
  CaptureProtectionGet: 'capture-protection:get',
  CaptureProtectionSet: 'capture-protection:set',
  CaptureProtectionChanged: 'capture-protection:changed',

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
  /** main → seletor: já aberto, mudou o modo (começar ou trocar a fonte). */
  SharePickerMode: 'share:picker-mode',
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
  ViewerToggleMini: 'viewer:toggle-mini',
  ViewerMiniSet: 'viewer:mini-set',
  ViewerMiniState: 'viewer:mini-state',
  ViewerMiniSize: 'viewer:mini-size',
  ViewerDrag: 'viewer:drag',
  ViewerPoint: 'viewer:point',

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
  HostRotateInvite: 'host:rotate-invite',
  HostAllowFirewall: 'host:allow-firewall',
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
  InviteReceived: 'invite:received',
  InviteTake: 'invite:take',
  SessionSaveMessages: 'session:save-messages',
  SessionMirrorNow: 'session:mirror-now',
  PointerShow: 'pointer:show',
  PointerPing: 'pointer:ping',
  VoiceHotkeysGet: 'hotkeys:voice-get',
  VoiceHotkeysSet: 'hotkeys:voice-set',
  VoiceHotkeysChanged: 'hotkeys:voice-changed',
  VoiceHotkeyCapture: 'hotkeys:capture',
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Marca da mensagem `window.postMessage` que entrega o MessagePort do som da transmissão. */
export const SHARE_AUDIO_PORT_MESSAGE = 'sharescreen:share-audio-port'

/**
 * Aviso do main pelo mesmo MessagePort do som (no meio dos pedaços de PCM): o som do app
 * parou de chegar, voltou, ou a captura não volta mais. Ver docs/16 P4.
 */
export const SHARE_AUDIO_STATUS = 'sharescreen:share-audio-status'
export interface ShareAudioStatus {
  type: typeof SHARE_AUDIO_STATUS
  state: 'flowing' | 'quiet' | 'failed'
  reason?: string
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  electron: string
  chrome: string
}

/**
 * O que este PC consegue fazer. A interface esconde ou explica o que não vai funcionar,
 * em vez de deixar falhar depois (docs/16 P7).
 */
export interface AppCapabilities {
  /** Transmitir o som do app ou da tela (captura nativa; Windows 10 2004+). */
  shareAudio: boolean
  /** As janelas do Accord podem ficar fora das capturas de tela (Windows 10 2004+ ou macOS). */
  captureExclusion: boolean
  /** Aceleração de hardware ligada neste início (pode ter sido desligada pela bandeja). */
  hardwareAcceleration: boolean
}

export interface CaptureProtection {
  /** Pill, painel, chat e lista de pessoas ficam fora das capturas (padrão: sim). */
  hideFromCaptures: boolean
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

/**
 * Atalho escolhido pela pessoa: teclas (códigos virtuais do Windows, VK_*) que precisam estar
 * apertadas juntas. Botões laterais do mouse também valem (VK_XBUTTON1/2, VK_MBUTTON).
 */
export interface KeyBinding {
  keys: number[]
  /** Texto para mostrar ("Ctrl + Shift + M", "Mouse 4"). */
  label: string
  /** Mesmo atalho no formato do Electron, para fora do Windows (sem mouse). */
  accelerator: string | null
}

export type BindingId = 'mute' | 'deafen' | 'ptt' | 'unlockMini'

export interface VoiceHotkeys {
  /** voice = microfone aberto (detecção de voz); ptt = só fala enquanto segura o atalho. */
  voiceMode: 'voice' | 'ptt'
  /** Quanto tempo o microfone fica aberto depois de soltar (evita cortar o fim da frase). */
  pttReleaseMs: number
  bindings: Record<BindingId, KeyBinding | null>
  /** O Windows deixa ler o teclado e o mouse sem roubar a tecla do jogo (push-to-talk). */
  holdSupported: boolean
}

/** Como a janela de chat aparece: aberta (com o campo de texto) ou mínima (só as mensagens rolando). */
export type ChatMode = 'expanded' | 'mini'

export interface ChatPrefs {
  /** Mostrar as mensagens rolando na tela (modo mínimo) durante a chamada. */
  overlay: boolean
}
