/**
 * Tipos de domínio compartilhados entre API e desktop.
 * Espelham o modelo de dados de docs/02-arquitetura.md.
 */

export type Role = 'owner' | 'admin' | 'member'

export interface PublicUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export interface Channel {
  id: string
  name: string
  position: number
  userLimit: number | null
}

/** Estado de um participante numa chamada (vem do LiveKit + presença da API). */
export interface ParticipantState {
  userId: string
  /** É você (participante local). */
  isLocal: boolean
  role: Role
  /** O dono silenciou o microfone dessa pessoa para todos. */
  serverMicBlocked: boolean
  /** O dono silenciou o som da transmissão dessa pessoa para todos. */
  serverAudioBlocked: boolean
  /** Você silenciou a voz dessa pessoa só para você. */
  localMicMuted: boolean
  /** Você silenciou o som da transmissão dessa pessoa só para você. */
  localAudioMuted: boolean
  /** Volume da voz dessa pessoa só para você: 0 a 2 (0% a 200%). */
  volume: number
  displayName: string
  avatarUrl: string | null
  speaking: boolean
  micMuted: boolean
  deafened: boolean
  streaming: boolean
}

export type OverlayMode = 'hidden' | 'collapsed' | 'compact' | 'expanded'

export type StreamQualityPreset = 'balanced' | 'smooth' | 'motion' | 'fluid'

export interface HealthResponse {
  status: 'ok'
  version: string
  uptimeSeconds: number
}

/** Resposta de `POST /join` (entrada aberta no canal "Geral"). */
export interface JoinResponse {
  livekitUrl: string
  token: string
  identity: string
  channelName: string
  role: Role
}

export type ModerationAction =
  'mute-mic' | 'unmute-mic' | 'mute-audio' | 'unmute-audio' | 'kick' | 'make-admin' | 'remove-admin'

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting'

/** Preferências de áudio da pessoa — valem antes de entrar e durante a chamada. */
export interface AudioState {
  micMuted: boolean
  deafened: boolean
  /** '' = padrão do sistema. */
  inputDeviceId: string
  outputDeviceId: string
  /** Supressão de ruído do microfone: RNNoise (IA leve) ou só o filtro padrão do Chromium. */
  noiseSuppression: 'rnnoise' | 'standard'
  /** Sons do app (entrar, sair, mutar…). */
  sounds: boolean
}

/** Retrato da chamada: o pill (dono da conexão) publica, o painel acompanha. */
export interface CallSnapshot {
  status: CallStatus
  audio: AudioState
  /** Sua transmissão em andamento, se houver. */
  sharing: ShareState | null
  channelName: string | null
  participants: ParticipantState[]
  /** Mensagem pronta para mostrar quando entrar falhou ou a conexão caiu. */
  error: string | null
  /** Servidor da chamada atual (para gerar convites). */
  server: { url: string; name: string; password: string | null } | null
}

/** Comandos que o painel manda para o pill (via main). */
export type CallCommand =
  | { type: 'join'; name: string; serverUrl: string; password?: string | null }
  | { type: 'leave' }
  | { type: 'toggle-mic' }
  | { type: 'toggle-deafen' }
  | { type: 'set-input'; deviceId: string }
  | { type: 'set-output'; deviceId: string }
  | { type: 'set-noise'; mode: AudioState['noiseSuppression'] }
  | { type: 'set-sounds'; enabled: boolean }
  | { type: 'local-mute'; name: string; kind: 'mic' | 'audio'; muted: boolean }
  | { type: 'set-volume'; name: string; volume: number }
  | { type: 'moderate'; action: ModerationAction; target: string }
  | { type: 'watch'; identity: string }

// ───────────────────────── Compartilhamento de tela ─────────────────────────

export type ShareKind = 'screen' | 'window'

/** Uma tela ou janela que pode ser transmitida (nunca guias de navegador). */
export interface ShareSource {
  id: string
  name: string
  kind: ShareKind
  /** Miniatura em data URL. */
  thumbnail: string
  /** Ícone do aplicativo (só janelas), em data URL. */
  icon: string | null
}

export interface ShareSourceList {
  sources: ShareSource[]
  /** Se dá para transmitir o som (captura nativa disponível neste sistema). */
  audioSupported: boolean
}

/** O que a pessoa escolheu no seletor. */
export interface ShareRequest {
  sourceId: string
  sourceName: string
  kind: ShareKind
  preset: StreamQualityPreset
  audio: boolean
}

export type ShareAudioResult = { ok: true } | { ok: false; reason: string }

/** Estado da sua transmissão, mostrado no pill. */
export interface ShareState {
  sourceName: string
  kind: ShareKind
  /** on: transmitindo som · off: escolheu sem som · failed: tentou e não deu. */
  audio: 'on' | 'off' | 'failed'
}

/** Quem o viewer vai assistir. */
export interface ViewerTarget {
  identity: string
  name: string
  serverUrl: string
  /** Senha do canal, se houver (o viewer entra com conexão própria). */
  password?: string | null
}

// ───────────────────────── Perfil e aparência ─────────────────────────

/** Seu nome e sua foto (PNG, JPG, WebP ou GIF) — guardados neste computador. */
export interface Profile {
  name: string
  /** Foto em data URL, ou null para usar as iniciais. */
  avatar: string | null
}

/** Cores editáveis do app. As demais (hover, bordas, lombada) são derivadas destas. */
export interface ThemeColors {
  background: string
  surface: string
  accent: string
  text: string
  textMuted: string
  speaking: string
  danger: string
  warning: string
}

export interface Theme {
  /** Id da paleta pronta usada como base (ou 'custom' depois de editar). */
  preset: string
  colors: ThemeColors
  /** Imagem de fundo (data URL, aceita GIF) mostrada atrás do conteúdo. */
  backgroundImage: string | null
  /** 0 a 0.6 — fica baixa de propósito para não atrapalhar a leitura. */
  backgroundOpacity: number
}

// ───────────────────────── Servidores e canais ─────────────────────────

export interface ChannelPerson {
  name: string
  /** Caminho da foto no servidor ("/avatars/…") ou null. */
  avatar: string | null
}

export interface ChannelInfo {
  id: string
  name: string
  people: ChannelPerson[]
}

/** Resposta de `GET /info`: quem é este servidor e o que tem nele. */
export interface ServerInfo {
  /** Muda a cada vez que o servidor abre; serve para juntar o mesmo servidor achado por vários caminhos. */
  id: string
  name: string
  version: string
  port: number
  channels: ChannelInfo[]
  /** Pede senha para entrar. */
  locked: boolean
}

/** Por onde o servidor foi achado (decide o rótulo e a ordem na lista). */
export type ServerRoute = 'this-pc' | 'lan' | 'radmin' | 'tailscale' | 'vpn' | 'saved'

export interface DiscoveredServer extends ServerInfo {
  /** URL da API, pronta para o `join`. */
  url: string
  route: ServerRoute
  latencyMs: number
}

export type ProbeResult = { ok: true; server: DiscoveredServer } | { ok: false; url: string }

/** Um endereço deste PC para passar a quem vai entrar. */
export interface HostAddress {
  route: Exclude<ServerRoute, 'this-pc' | 'saved'>
  address: string
}

export interface HostState {
  /**
   * stopped: dá para hospedar · starting · running: hospedando pelo app ·
   * external: já tem um servidor aberto neste PC (por fora do app) ·
   * unavailable: o servidor não veio junto (só no desenvolvimento) · error: falhou ao abrir
   */
  status: 'stopped' | 'starting' | 'running' | 'external' | 'unavailable' | 'error'
  /** URL para entrar no próprio canal. */
  url: string
  addresses: HostAddress[]
  /** Código do erro (traduzido no painel). */
  error: 'port-in-use' | 'crashed' | 'timeout' | null
  /** O canal aberto por este app pede senha. */
  locked: boolean
}

export interface HostStartOptions {
  password?: string | null
  /** Continuar a sessão de um host que caiu (com a cópia guardada neste PC). */
  restore?: boolean
}

/** Erros de `POST /moderate` (o app traduz). */
export type ModerationError =
  | 'invalid-session'
  | 'unknown-action'
  | 'forbidden'
  | 'not-self'
  | 'owner-protected'
  | 'voice-unreachable'

// ───────────────────────── Atualização automática ─────────────────────────

export interface UpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error'
  /** Versão nova encontrada (baixando ou pronta). */
  version: string | null
  /** 0 a 100 enquanto baixa. */
  progress: number
}

// ───────────────────────── Senha, chat e sessão ─────────────────────────

/** Cabeçalho com a senha do canal (quando o host definiu uma). */
export const PASSWORD_HEADER = 'x-accord-password'
/** Tópico das mensagens de chat enviadas pelo servidor (dados do LiveKit). */
export const CHAT_TOPIC = 'accord.chat'
export const CHAT_MAX_TEXT = 2000
export const CHAT_MAX_FILE_BYTES = 15 * 1024 * 1024
export const CHAT_MAX_ATTACHMENTS = 4

export type SessionError =
  | 'password-required'
  | 'wrong-password'
  | 'invalid-session'
  | 'too-large'
  | 'session-full'
  | 'bad-message'
  | 'not-found'

export interface ChatAttachment {
  id: string
  name: string
  /** Tipo MIME. */
  type: string
  size: number
  image: boolean
  /** Caminho no servidor (`/chat/files/<id>`); some quando a sessão acaba. */
  path: string
}

export interface ChatMessage {
  id: string
  /** Quando o servidor recebeu (ms desde 1970). */
  at: number
  identity: string
  name: string
  /** Caminho da foto no servidor, se houver. */
  avatar: string | null
  text: string
  attachments: ChatAttachment[]
}

/** Mensagem que o servidor manda pelo tópico CHAT_TOPIC. */
export type ChatEvent = { type: 'message'; message: ChatMessage }

/**
 * Cópia da sessão que os próximos da fila guardam, para continuar se o host cair:
 * senha, chat (os anexos vão em arquivos ao lado) e quem o dono silenciou.
 */
export interface SessionSnapshot {
  version: 1
  savedAt: number
  password: string | null
  messages: ChatMessage[]
  files: ChatAttachment[]
  blocks: Record<string, { mic: boolean; audio: boolean }>
}

/** O que o pill conta para o main e a janela de chat (o chat vive no pill, como a chamada). */
export interface ChatState {
  messages: ChatMessage[]
  /** Para a janela de chat enviar direto ao servidor. */
  access: { serverUrl: string; token: string; password: string | null } | null
  channelName: string | null
  /** Sua identidade (para destacar suas mensagens). */
  identity: string | null
}

/** Para onde a sessão vai se o host cair: ordem de chegada e endereços de cada um. */
export interface SessionMirrorRequest {
  serverUrl: string
  token: string
  password: string | null
  /** Baixar também os anexos (só os dois primeiros da fila). */
  files: boolean
}
