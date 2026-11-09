import type { LanguageSetting, LanguageState } from './i18n'
import type { Invite } from './invite'
import type {
  AppCapabilities,
  AppInfo,
  CaptureProtection,
  ChatMode,
  ChatPrefs,
  HotkeyInfo,
  VoiceHotkeys,
  OverlayCorner,
  OverlayState,
  PanelTab,
  Size,
} from './ipc'
import type {
  CallCommand,
  CallSnapshot,
  DiscoveredServer,
  HostState,
  HostStartOptions,
  ChatMessage,
  ChatState,
  SessionMirrorRequest,
  ProbeResult,
  ShareAudioResult,
  ShareKind,
  ShareRequest,
  Profile,
  ShareSourceList,
  Theme,
  UpdateState,
  ViewerTarget,
  MiniViewerState,
  HostStopMode,
  PointerPing,
} from './types'

type Unsubscribe = () => void

/**
 * Única porta de acesso da UI ao sistema operacional.
 * O Electron implementa no preload; um port futuro (ex.: Tauri) implementaria
 * esta mesma interface sem tocar na UI.
 */
export interface PlatformBridge {
  app: {
    getInfo(): Promise<AppInfo>
    quit(): void
    capabilities(): Promise<AppCapabilities>
  }
  /** Esconder as janelas do Accord das capturas (só o painel muda). */
  captureProtection: {
    get(): Promise<CaptureProtection>
    set(value: CaptureProtection): void
    onChange(listener: (value: CaptureProtection) => void): Unsubscribe
  }
  overlay: {
    /** Informa o tamanho do conteúdo do pill; a janela se ajusta a ele. */
    resize(size: Size): void
    getState(): Promise<OverlayState>
    setGhost(ghost: boolean): void
    moveTo(corner: OverlayCorner): void
    /** Arrasto do pill pela lombada (o main lê a posição do cursor). */
    drag(phase: 'start' | 'move' | 'end'): void
    onStateChange(listener: (state: OverlayState) => void): Unsubscribe
  }
  panel: {
    toggle(tab?: PanelTab): void
    close(): void
    resize(size: Size): void
    /** Mantém o painel aberto mesmo sem foco (ex.: enquanto a janela de escolher arquivo está aberta). */
    hold(hold: boolean): void
    onOpenTab(listener: (tab: PanelTab) => void): Unsubscribe
  }
  hotkeys: {
    list(): Promise<HotkeyInfo[]>
    /** Mutar, ensurdecer, push-to-talk e destravar a miniatura. */
    voice(): Promise<VoiceHotkeys>
    /** Painel: salva (só o que veio). */
    setVoice(patch: Partial<Omit<VoiceHotkeys, 'holdSupported'>>): Promise<VoiceHotkeys>
    onVoiceChange(listener: (hotkeys: VoiceHotkeys) => void): Unsubscribe
    /**
     * Painel: enquanto escolhe um atalho, os atalhos param de funcionar (senão apertar a tecla
     * de mutar para escolhê-la já mutava).
     */
    capturing(active: boolean): void
  }
  call: {
    /** Painel: pede ao pill para entrar/sair. */
    command(command: CallCommand): void
    /** Pill: recebe os pedidos do painel. */
    onCommand(listener: (command: CallCommand) => void): Unsubscribe
    /** Pill: publica o retrato da chamada. */
    report(snapshot: CallSnapshot): void
    /** Painel: lê e acompanha o retrato da chamada. */
    getState(): Promise<CallSnapshot>
    onState(listener: (snapshot: CallSnapshot) => void): Unsubscribe
  }
  share: {
    /** Pill: abre o seletor de tela. */
    openPicker(): void
    /** Seletor: lista telas e janelas. */
    listSources(): Promise<ShareSourceList>
    /** Seletor: confirma a escolha. */
    select(request: ShareRequest): void
    cancel(): void
    /** Pill: recebe a escolha confirmada. */
    onStart(listener: (request: ShareRequest) => void): Unsubscribe
    /**
     * Pill: liga a captura nativa de som. O PCM (s16le, estéreo, 48 kHz) chega por um
     * MessagePort entregue via `window.postMessage` com `{ type: SHARE_AUDIO_PORT_MESSAGE }`
     * — MessagePorts não atravessam o contextBridge.
     */
    startAudio(source: { kind: ShareKind; sourceId: string }): Promise<ShareAudioResult>
    stopAudio(): void
  }
  viewer: {
    /** Pill: abre a janela para assistir à transmissão de alguém. */
    open(target: ViewerTarget): void
    /** Viewer: quem esta janela mostra. */
    getTarget(): Promise<ViewerTarget | null>
    /** Viewer: vira miniatura sobre o jogo (ou volta a ser janela). */
    toggleMini(): void
    /** Miniatura: travar (clique atravessa) e transparência. */
    setMini(patch: Partial<MiniViewerState>): void
    onMiniState(listener: (state: MiniViewerState) => void): Unsubscribe
    /** Miniatura: troca entre os tamanhos pequeno, médio e grande. */
    cycleMiniSize(): void
    /** Miniatura: arrastar pela própria janela (sem barra de título). */
    drag(phase: 'start' | 'move' | 'end'): void
  }
  people: {
    /** Pill: abre/fecha a lista de pessoas da chamada. */
    toggle(): void
    close(): void
    /** Lista de pessoas: tamanho do conteúdo (a janela segue). */
    resize(size: Size): void
  }
  profile: {
    get(): Promise<Profile>
    set(profile: Profile): void
    onChange(listener: (profile: Profile) => void): Unsubscribe
  }
  theme: {
    get(): Promise<Theme>
    set(theme: Theme): void
    onChange(listener: (theme: Theme) => void): Unsubscribe
  }
  language: {
    get(): Promise<LanguageState>
    set(setting: LanguageSetting): void
    onChange(listener: (state: LanguageState) => void): Unsubscribe
  }
  discovery: {
    /** Procura servidores (leva ~2 s). `saved`: endereços que a pessoa adicionou. */
    scan(saved: string[]): Promise<DiscoveredServer[]>
    /** Testa um endereço digitado ("26.1.2.3", "meu-pc:9000"…). */
    probe(address: string): Promise<ProbeResult>
  }
  host: {
    getState(): Promise<HostState>
    /** Abre o servidor e espera ele responder (ou falhar). */
    start(options?: HostStartOptions): Promise<HostState>
    /** `end` = encerra para todos; `handoff` = passa a sessão para o próximo da fila. */
    stop(mode?: HostStopMode): void
    /** Gera um link de convite novo (os antigos param de funcionar). */
    rotateInvite(): Promise<HostState>
    /** Windows: libera as portas do Accord no firewall (pede permissão de administrador). */
    allowFirewall(): Promise<HostState>
    /** Troca a senha do canal aberto por este app (null = sem senha). */
    setPassword(password: string | null): Promise<boolean>
    onChange(listener: (state: HostState) => void): Unsubscribe
  }
  update: {
    getState(): Promise<UpdateState>
    check(): void
    install(): void
    onChange(listener: (state: UpdateState) => void): Unsubscribe
  }
  chat: {
    /** Pill: publica as mensagens e o acesso ao servidor. */
    report(state: ChatState): void
    getState(): Promise<ChatState>
    onState(listener: (state: ChatState) => void): Unsubscribe
    /** Abre o chat (ou volta para o modo mínimo, se já está aberto). */
    toggle(): void
    setMode(mode: ChatMode): void
    onMode(listener: (mode: ChatMode) => void): Unsubscribe
    /** Janela de chat: tamanho do conteúdo no modo mínimo. */
    resize(size: Size): void
    getPrefs(): Promise<ChatPrefs>
    setPrefs(prefs: ChatPrefs): void
    onPrefs(listener: (prefs: ChatPrefs) => void): Unsubscribe
    /** Pill: mensagens que chegaram desde a última vez que o chat foi aberto. */
    onUnread(listener: (count: number) => void): Unsubscribe
  }
  session: {
    /** Pill: guardar (ou parar de guardar) a cópia da sessão para a migração de host. */
    mirror(request: SessionMirrorRequest | null): void
    /** Pill: junta à cópia as mensagens que chegaram depois da última cópia. */
    saveMessages(messages: ChatMessage[]): Promise<void>
    /** Pill: o host avisou que vai sair: atualiza a cópia agora. */
    mirrorNow(): Promise<void>
  }
  pointer: {
    /** Pill: alguém apontou na sua transmissão: mostra o marcador sobre a tela compartilhada. */
    show(ping: PointerPing): void
    /** Overlay de marcadores: recebe os marcadores para desenhar. */
    onPing(listener: (ping: PointerPing) => void): Unsubscribe
  }
  invite: {
    /** Painel: pega o convite que abriu o app (e o tira da fila). */
    take(): Promise<Invite | null>
    onInvite(listener: (invite: Invite) => void): Unsubscribe
  }
}

declare global {
  interface Window {
    platform: PlatformBridge
  }
}
