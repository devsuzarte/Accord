import type {
  AudioState,
  CallServer,
  CallSnapshot,
  PointerPing,
  SessionEvent,
  VoiceHotkeys,
  JoinResponse,
  ModerationAction,
  ParticipantState,
  Profile,
  Role,
  ShareRequest,
  StreamQualityPreset,
  StreamReport,
} from '@sharescreen/shared'
import {
  normalizeServerUrl,
  PASSWORD_HEADER,
  POINTER_TOPIC,
  SESSION_TOPIC,
  STREAM_REPORT_TOPIC,
} from '@sharescreen/shared'
import { ConnectionState, DisconnectReason, Room, RoomEvent, Track } from 'livekit-client'
import type {
  LocalAudioTrack,
  LocalTrackPublication,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
} from 'livekit-client'
import { create } from 'zustand'
import { isLocallyMuted, readLocalMutes, setLocalMute } from '../../shared/localMutes'
import { readVolumes, setVolume as saveVolume, volumeOf } from '../../shared/localVolumes'
import type { LocalMutes } from '../../shared/localMutes'
import { t } from '../../shared/i18n'
import {
  chatMessages,
  endChat,
  handleChatData,
  onChatChange,
  refreshHistory,
  startChat,
  suspendChat,
} from './chat'
import { serverAlive, successionOf, waitForServer } from './migration'
import type { Successor } from './migration'
import { noiseContext, RnnoiseProcessor } from './noise'
import { startScreenShare } from './screenShare'
import type { ActiveShare } from './screenShare'
import { startShareMonitor } from './shareMonitor'
import type { ShareMonitor } from './shareMonitor'
import { playSound, setSoundsOutput } from './sounds'
import type { SoundName } from './sounds'

/**
 * Sessão da chamada. Vive no PILL porque ele fica aberto o tempo todo
 * (backgroundThrottling desligado) — docs/02-architecture.md › Renderer.
 */
interface CallActions {
  join(name: string, serverUrl: string, password?: string | null, resume?: boolean): Promise<void>
  leave(): Promise<void>
  toggleMic(): Promise<void>
  toggleDeafen(): Promise<void>
  setInputDevice(deviceId: string): Promise<void>
  setOutputDevice(deviceId: string): Promise<void>
  startShare(request: ShareRequest): Promise<void>
  stopShare(): Promise<void>
  /** Abre a janela de viewer para assistir a quem está transmitindo. */
  watch(participant: ParticipantState): void
  setNoiseSuppression(mode: AudioState['noiseSuppression']): Promise<void>
  setSounds(enabled: boolean): void
  /** "Mutar para mim": só neste computador, guardado pelo nome da pessoa. */
  localMute(name: string, kind: 'mic' | 'audio', muted: boolean): void
  /** Volume da voz de alguém só para você (0 a 2). */
  setVolume(name: string, volume: number): void
  /** Ações do dono/admin (o servidor confere a permissão). */
  moderate(action: ModerationAction, target: string): Promise<void>
  /** Nome ou foto mudaram na aba Você: atualiza para os outros na hora. */
  applyProfile(profile: Profile): Promise<void>
  /** Troca a qualidade da transmissão sem parar (nem escolher a tela de novo). */
  retuneShare(preset: StreamQualityPreset): Promise<void>
  setShareAutoQuality(enabled: boolean): void
  /** Mede a banda até o host (baixando e mandando alguns MB). */
  runSpeedTest(): Promise<void>
}

export type CallStore = CallSnapshot & CallActions

let room: Room | null = null
let leavingOnPurpose = false
/** Microfone estava ligado antes de ensurdecer (para restaurar ao voltar a ouvir). */
let micBeforeDeafen = true
let serverUrl = ''
let activeShare: ActiveShare | null = null
let shareMonitor: ShareMonitor | null = null
const AUTO_QUALITY_KEY = 'sharescreen.share.autoQuality'
function readAutoQuality(): boolean {
  try {
    return localStorage.getItem(AUTO_QUALITY_KEY) === '1'
  } catch {
    return false
  }
}
/** Token da chamada: também identifica você nos pedidos de moderação. */
let token = ''
/**
 * A sala em uso, guardada na sessionStorage (sobrevive ao recarregar o pill depois de um
 * travamento). Ao voltar, o pill entra com o mesmo token: a mesma identidade substitui a
 * "sombra" que ficou no LiveKit e mantém o papel (dono/admin). Ver docs/16 P1.
 */
const RESUME_KEY = 'sharescreen.call.resume'
interface ResumeEntry {
  base: string
  name: string
  access: JoinResponse
}
function saveResume(entry: ResumeEntry | null): void {
  try {
    if (entry) sessionStorage.setItem(RESUME_KEY, JSON.stringify(entry))
    else sessionStorage.removeItem(RESUME_KEY)
  } catch {
    // Sem armazenamento: só não dá para reaproveitar a identidade.
  }
}
function readResume(base: string, name: string): JoinResponse | null {
  try {
    const entry = JSON.parse(sessionStorage.getItem(RESUME_KEY) ?? 'null') as ResumeEntry | null
    return entry && entry.base === base && entry.name === name ? entry.access : null
  } catch {
    return null
  }
}
let mutes: LocalMutes = readLocalMutes()
let volumes = readVolumes()
/** Última foto enviada ao servidor (evita reenviar a mesma). */
let uploaded: { data: string; path: string } | null = null
/** Senha do canal atual (vai junto em todo pedido ao servidor). */
let password: string | null = null
let myName = ''
/** Fila de quem assume se o host cair (atualizada a cada mudança na sala). */
let succession: Successor[] = []
let amHost = false
let migrating = false
let lastMirror = ''
/** O host avisou que vai sair e passar a sessão (quem vem a seguir assume sem esperar). */
let handoffPending = false
/** Id da sessão (de /info): na migração, só seguimos um servidor da MESMA sessão. */
let sessionId = ''
let reconnectCheck: ReturnType<typeof setTimeout> | null = null
/** Aperte para falar: o microfone só manda som enquanto o atalho está apertado. */
let voiceMode: 'voice' | 'ptt' = 'voice'
let pttHeld = false
let pttReleaseMs = 200
let pttTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Liga/desliga o som do microfone sem "mutar" de verdade (os outros não veem o ícone piscar e
 * não há atraso para reabrir o microfone): no modo aperte-para-falar, fora do atalho vai silêncio.
 */
function applyPushToTalk(): void {
  const publication = room?.localParticipant.getTrackPublication(Track.Source.Microphone)
  const track = publication?.audioTrack?.mediaStreamTrack
  if (!track || publication?.isMuted) return
  track.enabled = voiceMode !== 'ptt' || pttHeld
}

const withPassword = (headers: Record<string, string>, pw: string | null) =>
  pw ? { ...headers, [PASSWORD_HEADER]: pw } : headers

/**
 * O pill só recebe o ÁUDIO das vozes. O vídeo das transmissões (e o som delas) é recebido
 * só pela janela de viewer, quando alguém decide assistir — economiza a banda de quem hospeda.
 * Quem você mutou "para mim" nem é recebido (o indicador de fala continua vindo do servidor).
 */
function subscribeIfVoice(
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
): void {
  if (publication.source !== Track.Source.Microphone) return
  publication.setSubscribed(!isLocallyMuted(mutes, 'mic', participant.name || participant.identity))
}

function subscribeVoices(participant: RemoteParticipant): void {
  participant.trackPublications.forEach((publication) => subscribeIfVoice(publication, participant))
}

const AUDIO_KEY = 'sharescreen.audio'
const defaultAudio: AudioState = {
  micMuted: false,
  deafened: false,
  inputDeviceId: '',
  outputDeviceId: '',
  noiseSuppression: 'rnnoise',
  sounds: true,
}

/** Preferências de áudio salvas neste computador (valem antes e durante a chamada). */
function loadAudio(): AudioState {
  try {
    const saved = JSON.parse(
      localStorage.getItem(AUDIO_KEY) ?? 'null',
    ) as Partial<AudioState> | null
    return { ...defaultAudio, ...saved }
  } catch {
    return { ...defaultAudio }
  }
}

function saveAudio(audio: AudioState): void {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(audio))
  } catch {
    /* ignora */
  }
}

/** Log que vai para o arquivo do app (o main captura linhas que começam com "[call]"). */
function log(message: string): void {
  console.info(`[call] ${message}`)
}

/** Onde ficam os <audio> das vozes remotas (invisível). */
function audioHost(): HTMLElement {
  let host = document.getElementById('call-audio')
  if (!host) {
    host = document.createElement('div')
    host.id = 'call-audio'
    host.hidden = true
    document.body.append(host)
  }
  return host
}

/**
 * Volume de cada voz (as vozes tocam pelo WebAudio, com ganho por pessoa):
 * ensurdecido = 0 para todos; "mutar para mim" = 0; senão o volume escolhido (0 a 200%).
 */
function applyVoiceVolumes(deafened: boolean): void {
  room?.remoteParticipants.forEach((p) => {
    const name = p.name || p.identity
    const volume = deafened || isLocallyMuted(mutes, 'mic', name) ? 0 : volumeOf(volumes, name)
    p.setVolume(volume, Track.Source.Microphone)
  })
}

const moderationErrors = [
  'invalid-session',
  'unknown-action',
  'forbidden',
  'not-self',
  'owner-protected',
  'voice-unreachable',
] as const

/** O servidor devolve um código; a frase sai no idioma do app. */
function moderationMessage(code: string | undefined, status: number): string {
  const known = moderationErrors.find((c) => c === code)
  return known ? t(`mod.err.${known}`) : t('call.err.serverRefused', { status })
}

const toRole = (value: string | undefined): Role =>
  value === 'owner' || value === 'admin' ? value : 'member'

/** Foto: o servidor guarda e devolve um caminho ("/avatars/…") que vale para todos. */
async function uploadAvatar(data: string | null, base: string): Promise<string> {
  if (!data) return ''
  if (uploaded?.data === data) return uploaded.path
  try {
    const response = await fetch(`${base}/avatar`, {
      method: 'POST',
      headers: withPassword({ 'content-type': 'application/json' }, password),
      body: JSON.stringify({ data }),
    })
    if (!response.ok) throw new Error(String(response.status))
    const { path } = (await response.json()) as { path: string }
    uploaded = { data, path }
    return path
  } catch (error) {
    log(`falha ao enviar a foto: ${error}`)
    return ''
  }
}

/** Liga a supressão de ruído escolhida no microfone publicado. */
async function applyNoise(mode: AudioState['noiseSuppression']): Promise<void> {
  const publication = room?.localParticipant.getTrackPublication(Track.Source.Microphone)
  const track = publication?.audioTrack as LocalAudioTrack | undefined
  if (!track) return
  const constraints = (rnnoise: boolean) =>
    track.mediaStreamTrack
      .applyConstraints({
        noiseSuppression: !rnnoise,
        echoCancellation: true,
        autoGainControl: true,
      })
      .catch(() => undefined)
  try {
    if (mode === 'rnnoise') {
      if (track.getProcessor()?.name === 'rnnoise') return
      // Primeiro desliga o filtro do Chromium (dois supressores juntos deixam a voz metálica).
      await constraints(true)
      await track.setAudioContext(noiseContext())
      await track.setProcessor(new RnnoiseProcessor())
      log('supressão de ruído: RNNoise')
    } else {
      if (track.getProcessor()) await track.stopProcessor()
      await constraints(false)
      log('supressão de ruído: padrão')
    }
  } catch (error) {
    log(`falha na supressão de ruído: ${error}`)
    await constraints(false)
  }
}

function toState(p: Participant, isLocal: boolean, deafened: boolean): ParticipantState {
  const mic = p.getTrackPublication(Track.Source.Microphone)
  const name = p.name || p.identity
  const serverMicBlocked = p.attributes.serverMic === 'blocked'
  return {
    userId: p.identity,
    isLocal,
    role: toRole(p.attributes.role),
    serverMicBlocked,
    serverAudioBlocked: p.attributes.serverAudio === 'blocked',
    localMicMuted: !isLocal && isLocallyMuted(mutes, 'mic', name),
    localAudioMuted: !isLocal && isLocallyMuted(mutes, 'audio', name),
    volume: isLocal ? 1 : volumeOf(volumes, name),
    displayName: name,
    avatarUrl: p.attributes.avatar ? `${serverUrl}${p.attributes.avatar}` : null,
    speaking: p.isSpeaking,
    micMuted: isLocal ? !p.isMicrophoneEnabled || serverMicBlocked : !mic || mic.isMuted,
    deafened: isLocal ? deafened : p.attributes.deafened === '1',
    streaming: !!p.getTrackPublication(Track.Source.ScreenShare),
  }
}

function participantsOf(r: Room, deafened: boolean): ParticipantState[] {
  const remotes = [...r.remoteParticipants.values()].sort(
    (a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0),
  )
  // Ordem: quem chegou primeiro em cima; você sempre por último, como na pill de exemplo.
  return [
    ...remotes.map((p) => toState(p, false, deafened)),
    toState(r.localParticipant, true, deafened),
  ]
}

/**
 * Nome, foto, "ensurdecido" e endereços passam pelo servidor (o token não deixa o app mudar os
 * próprios atributos: assim ninguém se coloca de "dono" nem anuncia endereço falso).
 */
async function updateMe(fields: {
  name?: string
  avatar?: string
  deafened?: boolean
  addrs?: string[]
}): Promise<string | null> {
  if (!serverUrl || !token) return null
  try {
    const response = await fetch(`${serverUrl}/me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(fields),
    })
    if (response.ok) return null
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? String(response.status)
  } catch (error) {
    return String(error)
  }
}

/** Dados do convite da chamada atual (a chave, nunca a senha). */
async function fetchServer(base: string, accessToken: string): Promise<CallServer> {
  const [info, invite] = await Promise.all([
    fetch(`${base}/info`, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.json() as Promise<{ name?: string; session?: string }>)
      .catch(() => null),
    fetch(`${base}/session/invite`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
    })
      .then((r) => r.json() as Promise<{ locked?: boolean; invite?: string | null }>)
      .catch(() => null),
  ])
  if (info?.session) sessionId = info.session
  return {
    url: base,
    name: info?.name ?? '',
    locked: invite?.locked === true,
    invite: invite?.invite ?? null,
  }
}

async function requestToken(name: string, base: string, avatar: string): Promise<JoinResponse> {
  let response: Response
  try {
    response = await fetch(`${base}/join`, {
      method: 'POST',
      headers: withPassword({ 'content-type': 'application/json' }, password),
      body: JSON.stringify({ name, ...(avatar ? { avatar } : {}) }),
    })
  } catch {
    throw new Error(t('call.err.serverUnreachable', { url: base }))
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (body?.error === 'password-required') throw new Error(t('call.err.passwordRequired'))
    if (body?.error === 'wrong-password') {
      throw new Error(
        password?.startsWith('invite:') ? t('call.err.inviteExpired') : t('call.err.wrongPassword'),
      )
    }
    if (body?.error === 'too-many-attempts') throw new Error(t('call.err.tooManyAttempts'))
    if (body?.error === 'name-taken') throw new Error(t('call.err.nameTaken', { name }))
    if (body?.error === 'banned') throw new Error(t('call.err.banned'))
    throw new Error(t('call.err.joinRefused', { status: response.status }))
  }
  return (await response.json()) as JoinResponse
}

export const useCallStore = create<CallStore>((set, get) => {
  const refresh = () => {
    if (!room) return
    applyPushToTalk()
    applyVoiceVolumes(get().audio.deafened)
    set({ participants: participantsOf(room, get().audio.deafened) })
    updateSuccession(room)
  }

  /**
   * Fila de migração e cópia da sessão: quem não é o host guarda uma cópia (senha, chat);
   * os dois primeiros da fila guardam também os anexos.
   */
  const updateSuccession = (r: Room) => {
    succession = successionOf(r)
    amHost = r.localParticipant.attributes.role === 'owner'
    const successor = succession.find((p) => p.identity !== r.localParticipant.identity)
    if ((successor?.name ?? null) !== get().successor) set({ successor: successor?.name ?? null })
    const position = succession.findIndex((s) => s.identity === r.localParticipant.identity)
    const request =
      amHost || position < 0 || !token ? null : { serverUrl, token, password, files: position < 2 }
    const key = JSON.stringify(request)
    if (key !== lastMirror) {
      lastMirror = key
      window.platform.session.mirror(request)
    }
  }

  /** Larga a sala atual (sem mexer no chat). */
  const dropRoom = () => {
    stopMonitor()
    void activeShare?.stop()
    activeShare = null
    audioHost().replaceChildren()
    room = null
    token = ''
  }

  const stopMonitor = () => {
    shareMonitor?.stop()
    shareMonitor = null
    if (get().shareStats || get().shareAdvice) set({ shareStats: null, shareAdvice: null })
  }

  const sound = (name: SoundName) => {
    if (get().audio.sounds) playSound(name)
  }

  const setAudio = (patch: Partial<AudioState>) => {
    const audio = { ...get().audio, ...patch }
    saveAudio(audio)
    set({ audio })
  }

  const reset = (error: string | null) => {
    dropRoom()
    migrating = false
    handoffPending = false
    if (reconnectCheck) clearTimeout(reconnectCheck)
    reconnectCheck = null
    endChat()
    lastMirror = ''
    window.platform.session.mirror(null)
    saveResume(null)
    if (error) log(`saiu do canal: ${error}`)
    set({
      status: 'idle',
      sharing: null,
      channelName: null,
      participants: [],
      error,
      server: null,
      successor: null,
      speedTest: null,
    })
  }

  const wire = (r: Room) => {
    const onReconnecting = (media: boolean) => {
      log(media ? 'reconectando' : 'reconectando ao servidor')
      if (media) set({ status: 'reconnecting' })
      // O host avisou que ia sair: nem tenta reconectar, já vai para o próximo.
      if (handoffPending) return void r.disconnect()
      // O LiveKit tenta reconectar por quase um minuto. Se a API do host também sumiu, não
      // adianta esperar: larga a sala e parte para a migração (ou para o aviso de que caiu).
      if (reconnectCheck) return
      const base = serverUrl
      reconnectCheck = setTimeout(() => {
        reconnectCheck = null
        if (room !== r || r.state === ConnectionState.Connected) return
        void serverAlive(base).then((alive) => {
          if (!alive && room === r && r.state !== ConnectionState.Connected) {
            log('o host não responde: desistindo de reconectar')
            void r.disconnect()
          }
        })
      }, 4000)
    }

    r.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      subscribeVoices(participant)
      sound('user-join')
      refresh()
    })
      .on(RoomEvent.ParticipantDisconnected, () => {
        sound('user-leave')
        refresh()
      })
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(
        RoomEvent.TrackPublished,
        (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          subscribeIfVoice(publication, participant)
          refresh()
        },
      )
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
        if (publication.source === Track.Source.Microphone) {
          void applyNoise(get().audio.noiseSuppression)
        }
        refresh()
      })
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(
        RoomEvent.ParticipantAttributesChanged,
        (changed: Record<string, string>, participant: Participant) => {
          // O dono silenciou (ou liberou) você para todos.
          if (participant === r.localParticipant && 'serverMic' in changed) {
            const blocked = changed.serverMic === 'blocked'
            sound(blocked ? 'mic-off' : 'mic-on')
            if (blocked) setAudio({ micMuted: true })
            set({
              error: blocked ? t('call.notice.micBlocked') : t('call.notice.micReleased'),
            })
          }
          if (participant === r.localParticipant && changed.serverAudio === 'blocked') {
            set({ error: t('call.notice.audioBlocked') })
          }
          if (participant === r.localParticipant && 'role' in changed) {
            const role = toRole(changed.role)
            set({
              error: role === 'admin' ? t('call.notice.nowAdmin') : t('call.notice.noLongerAdmin'),
            })
          }
          refresh()
        },
      )
      .on(RoomEvent.ParticipantNameChanged, (_name: string, participant: Participant) => {
        // O "mutar para mim" é pelo nome: trocou de nome, confere de novo.
        const remote = room?.remoteParticipants.get(participant.identity)
        if (remote) subscribeVoices(remote)
        refresh()
      })
      .on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return
          // Uma faixa = um <audio>, mesmo se a assinatura for refeita.
          if (track.sid && audioHost().querySelector(`[data-sid="${track.sid}"]`)) return
          const el = track.attach()
          el.dataset.sid = track.sid ?? ''
          el.dataset.identity = participant.identity
          // O LiveKit deixa o <audio> mudo e toca pelo WebAudio (webAudioMix).
          audioHost().append(el)
          refresh()
        },
      )
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove())
        refresh()
      })
      // SignalReconnecting: a conexão com o servidor caiu (antes de a mídia cair, o que só vem
      // como Reconnecting uns 15 s depois). Os dois começam o mesmo tratamento.
      .on(RoomEvent.SignalReconnecting, () => onReconnecting(false))
      .on(RoomEvent.Reconnecting, () => onReconnecting(true))
      .on(RoomEvent.Reconnected, () => {
        if (reconnectCheck) clearTimeout(reconnectCheck)
        reconnectCheck = null
        log('reconectado')
        void refreshHistory()
        set({ status: 'connected', error: null })
        refresh()
      })
      .on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
          // Só vale o que veio do servidor (sem participante): ninguém forja aviso de sessão.
          if (participant) return
          if (topic === SESSION_TOPIC) return handleSessionEvent(payload)
          if (topic === POINTER_TOPIC) return handlePointer(payload)
          if (topic === STREAM_REPORT_TOPIC) return handleStreamReport(payload)
          handleChatData(payload, false, topic)
        },
      )
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (leavingOnPurpose || room !== r) return reset(null)
        if (reason === DisconnectReason.ROOM_DELETED && !handoffPending) {
          // O host clicou em "Encerrar para todos".
          sound('leave')
          return reset(t('call.err.hostEnded'))
        }
        if (
          reason === DisconnectReason.DUPLICATE_IDENTITY ||
          reason === DisconnectReason.PARTICIPANT_REMOVED
        ) {
          sound('leave')
          return reset(
            reason === DisconnectReason.DUPLICATE_IDENTITY
              ? t('call.err.duplicate')
              : t('call.err.kicked'),
          )
        }
        void migrate()
      })
  }

  const handleSessionEvent = (payload: Uint8Array) => {
    let event: SessionEvent
    try {
      event = JSON.parse(new TextDecoder().decode(payload)) as SessionEvent
    } catch {
      return
    }
    if (event.type === 'handoff') {
      log('o host vai sair e passar a sessão')
      handoffPending = true
      // Quem vai assumir puxa a cópia mais nova antes de o servidor fechar.
      void window.platform.session.saveMessages(chatMessages())
      void window.platform.session.mirrorNow()
      set({ error: t('call.migrating.handoff') })
    }
    if (event.type === 'invite-rotated' && room) {
      const base = serverUrl
      void fetchServer(base, token).then((server) => {
        if (serverUrl === base) set({ server })
      })
    }
  }

  const handlePointer = (payload: Uint8Array) => {
    let ping: PointerPing
    try {
      ping = JSON.parse(new TextDecoder().decode(payload)) as PointerPing
    } catch {
      return
    }
    if (ping.type !== 'ping' || !room || ping.target !== room.localParticipant.identity) return
    if (!get().sharing || !pointerAllowed()) return
    window.platform.pointer.show(ping)
  }

  const handleStreamReport = (payload: Uint8Array) => {
    let report: StreamReport
    try {
      report = JSON.parse(new TextDecoder().decode(payload)) as StreamReport
    } catch {
      return
    }
    if (report.type !== 'report' || !room || report.target !== room.localParticipant.identity) {
      return
    }
    shareMonitor?.report(report)
  }

  // Mensagem nova de outra pessoa: um "tic" baixinho (só o histórico ao entrar não toca).
  let heard = 0
  onChatChange(() => {
    const list = chatMessages()
    const fresh = list.slice(heard)
    heard = list.length
    const me = room?.localParticipant.identity
    if (fresh.length > 0 && fresh.length <= 3 && fresh.some((m) => m.identity !== me)) {
      if (get().audio.sounds) playSound('message', 0.09)
    }
  })

  /** Entra num servidor (usado ao entrar e ao seguir o host novo na migração). */
  const connect = async (
    name: string,
    joinUrl: string,
    joinPassword: string | null,
    resume = false,
  ) => {
    const base = joinUrl.replace(/\/$/, '')
    password = joinPassword?.trim() || null
    myName = name
    log(`entrando em ${base}${resume ? ' (voltando depois de travar)' : ''}`)
    const saved = resume ? readResume(base, name) : null
    if (saved) {
      try {
        return await connectWith(name, base, saved)
      } catch (error) {
        // Token vencido ou servidor reiniciado: entra do jeito normal.
        log(`não deu para voltar com a mesma identidade: ${error}`)
      }
    }
    const profile = await window.platform.profile.get().catch(() => null)
    const avatar = await uploadAvatar(profile?.avatar ?? null, base)
    const access = await requestToken(name, base, avatar)
    return connectWith(name, base, access)
  }

  const connectWith = async (name: string, base: string, access: JoinResponse) => {
    const audio = get().audio
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        deviceId: audio.inputDeviceId || undefined,
        echoCancellation: true,
        // Com RNNoise ligado, o filtro do Chromium fica desligado (um supressor só).
        noiseSuppression: audio.noiseSuppression === 'standard',
        autoGainControl: true,
      },
      audioOutput: audio.outputDeviceId ? { deviceId: audio.outputDeviceId } : undefined,
      // Vozes pelo WebAudio: permite volume por pessoa acima de 100%.
      webAudioMix: true,
    })
    wire(r)
    try {
      await r.connect(access.livekitUrl, access.token, { autoSubscribe: false })
    } catch {
      throw new Error(t('call.err.voiceUnreachable', { url: access.livekitUrl }))
    }
    room = r
    serverUrl = base
    token = access.token
    leavingOnPurpose = false
    saveResume({ base, name, access })
    r.remoteParticipants.forEach(subscribeVoices)
    if (audio.outputDeviceId) {
      await r.switchActiveDevice('audiooutput', audio.outputDeviceId).catch(() => undefined)
    }
    const server = await fetchServer(base, access.token)
    set({ status: 'connected', channelName: access.channelName, error: null, server })
    sound('join')
    log(`conectado em ${access.livekitUrl} como ${access.role}`)

    // Endereços deste PC: se o host cair e for a minha vez, os outros me acham por eles.
    const host = await window.platform.host.getState().catch(() => null)
    await updateMe({ addrs: host?.addresses.map((a) => a.address) ?? [] })
    await startChat(base, access.token, password, access.identity, access.channelName)
    refresh()

    // Entra respeitando o que a pessoa escolheu antes: mudo e/ou ensurdecido.
    if (audio.deafened) {
      micBeforeDeafen = !audio.micMuted
      await updateMe({ deafened: true })
    }
    try {
      if (!audio.micMuted && !audio.deafened) {
        await r.localParticipant.setMicrophoneEnabled(true)
      }
    } catch {
      set({ error: t('call.err.micOnJoin') })
    }
    refresh()
  }

  /**
   * A conexão caiu sem a pessoa pedir. Se o host ainda responde, só reconecta. Se não,
   * a sessão passa para o primeiro da fila (quem entrou antes): se for eu, abro o meu
   * servidor com a cópia da sessão; senão, espero o servidor dele aparecer e entro lá.
   */
  const migrate = async () => {
    const handoff = handoffPending
    handoffPending = false
    if (reconnectCheck) clearTimeout(reconnectCheck)
    reconnectCheck = null
    const previous = {
      session: sessionId,
      base: serverUrl,
      name: myName,
      password,
      plan: succession,
      me: room?.localParticipant.identity ?? '',
      wasHost: amHost,
    }
    dropRoom()
    suspendChat()
    migrating = true
    set({
      status: 'reconnecting',
      participants: [],
      sharing: null,
      error: t('call.migrating.check'),
    })
    log('a conexão caiu; conferindo se o host ainda está lá')
    const cancelled = () => !migrating
    try {
      // Passagem combinada: nem confere o host antigo (ele está fechando de propósito).
      if (!handoff && (previous.wasHost || (await serverAlive(previous.base)))) {
        await connect(previous.name, previous.base, previous.password)
        return
      }
      log(`host sumiu; fila: ${previous.plan.map((s) => s.name).join(', ') || '(vazia)'}`)
      for (const [index, next] of previous.plan.entries()) {
        if (cancelled()) return
        try {
          if (next.identity === previous.me) {
            set({ error: t('call.migrating.you') })
            await window.platform.session.saveMessages(chatMessages())
            const state = await window.platform.host.start({
              password: previous.password,
              restore: true,
            })
            if (state.status !== 'running' && state.status !== 'external') continue
            log('agora este PC hospeda a sessão')
            await connect(previous.name, normalizeServerUrl(state.url), previous.password)
            return
          }
          if (next.addresses.length === 0) continue
          set({ error: t('call.migrating.to', { name: next.name }) })
          const url = await waitForServer(
            next.addresses,
            previous.base,
            index === 0 ? 30_000 : 25_000,
            cancelled,
            previous.session,
          )
          if (!url || cancelled()) continue
          log(`seguindo o host novo em ${url}`)
          await connect(previous.name, url, previous.password)
          return
        } catch (error) {
          log(`migração para ${next.name} falhou: ${error}`)
        }
      }
      throw new Error(t('call.err.hostGone'))
    } catch (error) {
      if (cancelled()) return
      sound('leave')
      reset(error instanceof Error ? error.message : t('call.err.dropped'))
    } finally {
      migrating = false
    }
  }

  return {
    status: 'idle',
    audio: loadAudio(),
    sharing: null,
    channelName: null,
    participants: [],
    error: null,
    server: null,
    successor: null,
    pushToTalk: null,
    shareStats: null,
    shareAdvice: null,
    speedTest: null,
    shareAutoQuality: readAutoQuality(),

    async join(name, joinUrl, joinPassword, resume) {
      if (get().status !== 'idle') return
      set({ status: 'connecting', error: null })
      try {
        await connect(name, joinUrl, joinPassword ?? null, resume === true)
      } catch (error) {
        reset(error instanceof Error ? error.message : t('call.err.joinFailed'))
      }
    },

    async leave() {
      if (migrating) {
        migrating = false
        return reset(null)
      }
      if (!room) return
      leavingOnPurpose = true
      sound('leave')
      await get().stopShare()
      await room.disconnect()
      reset(null)
    },

    async toggleMic() {
      const { audio } = get()
      // Ligar o microfone estando ensurdecido também volta a ouvir (como no Discord).
      if (audio.micMuted && audio.deafened) {
        micBeforeDeafen = true
        await get().toggleDeafen()
        return
      }
      if (!room) {
        setAudio({ micMuted: !audio.micMuted })
        sound(audio.micMuted ? 'mic-on' : 'mic-off')
        return
      }
      const enabled = room.localParticipant.isMicrophoneEnabled
      if (!enabled && room.localParticipant.attributes.serverMic === 'blocked') {
        set({ error: t('call.err.micBlockedTry') })
        return
      }
      try {
        await room.localParticipant.setMicrophoneEnabled(!enabled)
        setAudio({ micMuted: enabled })
        sound(enabled ? 'mic-off' : 'mic-on')
      } catch {
        set({ error: t('call.err.mic') })
      }
      refresh()
    },

    async toggleDeafen() {
      const { audio } = get()
      const deafened = !audio.deafened
      if (deafened) micBeforeDeafen = !audio.micMuted
      const micMuted = deafened ? true : !micBeforeDeafen
      setAudio({ deafened, micMuted })
      sound(deafened ? 'deafen' : 'undeafen')
      applyVoiceVolumes(deafened)
      if (room) {
        const blocked = room.localParticipant.attributes.serverMic === 'blocked'
        await room.localParticipant
          .setMicrophoneEnabled(!micMuted && !blocked)
          .catch(() => undefined)
        // Os outros veem o selo "ensurdecido" pelo atributo do participante.
        await updateMe({ deafened })
      }
      refresh()
    },

    async setInputDevice(deviceId) {
      setAudio({ inputDeviceId: deviceId })
      if (room) {
        await room.switchActiveDevice('audioinput', deviceId || 'default').catch((error) => {
          log(`falha ao trocar microfone: ${error}`)
          set({ error: t('call.err.micDevice') })
        })
      }
    },

    async setOutputDevice(deviceId) {
      setAudio({ outputDeviceId: deviceId })
      setSoundsOutput(deviceId)
      if (room) {
        await room.switchActiveDevice('audiooutput', deviceId || 'default').catch(() => undefined)
      }
    },

    async startShare(request) {
      if (!room || activeShare) {
        log(`compartilhar ignorado: ${!room ? 'sem chamada' : 'já transmitindo'}`)
        return
      }
      const r = room
      if (request.audio && r.localParticipant.attributes.serverAudio === 'blocked') {
        request = { ...request, audio: false }
        set({ error: t('call.notice.shareNoAudioBlocked') })
      }
      log(
        `compartilhando ${request.kind} "${request.sourceName}" (${request.preset}, som: ${request.audio})`,
      )
      try {
        activeShare = await startScreenShare(
          r.localParticipant,
          request,
          () => {
            // A fonte acabou sozinha (ex.: a janela compartilhada fechou).
            stopMonitor()
            activeShare = null
            sound('share-stop')
            set({ sharing: null })
            refresh()
          },
          (status) => {
            // O main avisa quando o som do app para de chegar, volta, ou não volta mais.
            const sharing = get().sharing
            if (!sharing || sharing.audio === 'off') return
            log(`som da transmissão: ${status.state}${status.reason ? ` (${status.reason})` : ''}`)
            if (status.state === 'failed') {
              set({
                sharing: { ...sharing, audio: 'failed' },
                error: t('call.notice.noAudio', { reason: status.reason ?? t('call.err.unknown') }),
              })
              return
            }
            set({ sharing: { ...sharing, audio: status.state === 'quiet' ? 'quiet' : 'on' } })
          },
        )
        sound('share-start')
        const share = activeShare
        const audio = share.audio
        log(
          `transmitindo (${share.codec}); som: ${audio.state}${audio.state === 'failed' ? ` (${audio.reason})` : ''}`,
        )
        shareMonitor = startShareMonitor(share, {
          auto: () => get().shareAutoQuality,
          onUpdate: (shareStats, shareAdvice) => {
            if (activeShare !== share) return
            set({ shareStats, shareAdvice })
          },
          onRetune: (preset) => {
            log(`qualidade automática: baixando para ${preset}`)
            void get().retuneShare(preset)
          },
        })
        set({
          sharing: {
            sourceName: request.sourceName,
            kind: request.kind,
            preset: request.preset,
            codec: share.codec,
            audio: audio.state,
          },
          error:
            audio.state === 'failed'
              ? t('call.notice.noAudio', { reason: audio.reason })
              : get().error,
        })
      } catch (error) {
        activeShare = null
        console.error('[call] falha ao compartilhar', error)
        const denied = error instanceof DOMException && error.name === 'NotAllowedError'
        set({
          sharing: null,
          error: denied
            ? t('call.err.shareDenied')
            : t('call.err.shareFailed', {
                reason: error instanceof Error ? error.message : t('call.err.unknown'),
              }),
        })
      }
      refresh()
    },

    async stopShare() {
      stopMonitor()
      const share = activeShare
      activeShare = null
      if (share) sound('share-stop')
      await share?.stop()
      set({ sharing: null })
      refresh()
    },

    async retuneShare(preset) {
      const share = activeShare
      const sharing = get().sharing
      if (!share || !sharing || sharing.preset === preset) return
      await share.retune(preset)
      if (activeShare !== share) return
      set({ sharing: { ...sharing, preset }, shareAdvice: null })
    },

    setShareAutoQuality(enabled) {
      try {
        localStorage.setItem(AUTO_QUALITY_KEY, enabled ? '1' : '0')
      } catch {
        /* ignora */
      }
      shareMonitor?.setAuto(enabled)
      set({ shareAutoQuality: enabled })
    },

    async runSpeedTest() {
      if (!room || !serverUrl || !token || get().speedTest?.state === 'running') return
      const base = serverUrl
      const auth = { authorization: `Bearer ${token}` }
      const before = get().speedTest
      set({ speedTest: { state: 'running' } })
      try {
        // Ida e volta curta (o /health não pesa nada).
        const pingStart = performance.now()
        await fetch(`${base}/health`, { cache: 'no-store' })
        const rttMs = Math.round(performance.now() - pingStart)
        // Host → você.
        const downStart = performance.now()
        const down = await fetch(`${base}/speedtest?bytes=${8 * 1024 * 1024}`, {
          headers: auth,
          cache: 'no-store',
        })
        if (!down.ok) throw new Error(String(down.status))
        const downBytes = (await down.arrayBuffer()).byteLength
        const downMbps = (downBytes * 8) / ((performance.now() - downStart) / 1000) / 1e6
        // Você → host.
        const body = new Uint8Array(4 * 1024 * 1024)
        for (let i = 0; i < body.length; i += 65536) {
          crypto.getRandomValues(body.subarray(i, i + 65536))
        }
        const upStart = performance.now()
        const up = await fetch(`${base}/speedtest`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/octet-stream' },
          body,
        })
        if (!up.ok) throw new Error(String(up.status))
        const upResult = (await up.json()) as { bytes: number }
        const upMbps = (upResult.bytes * 8) / ((performance.now() - upStart) / 1000) / 1e6
        if (serverUrl !== base) return
        log(
          `teste de rede: ↓ ${downMbps.toFixed(1)} Mbps, ↑ ${upMbps.toFixed(1)} Mbps, ${rttMs} ms`,
        )
        set({ speedTest: { state: 'done', downMbps, upMbps, rttMs } })
      } catch (error) {
        log(`teste de rede falhou: ${error}`)
        // Falhou (ou pediu de novo cedo demais): mantém a medição anterior, se houver.
        if (serverUrl === base) {
          set({ speedTest: before?.state === 'done' ? before : { state: 'failed' } })
        }
      }
    },

    watch(participant) {
      if (!serverUrl || participant.isLocal || !participant.streaming) return
      window.platform.viewer.open({
        identity: participant.userId,
        name: participant.displayName,
        serverUrl,
        token,
      })
    },

    async setNoiseSuppression(mode) {
      setAudio({ noiseSuppression: mode })
      if (room) {
        // Também vale quando o microfone for reaberto (troca de dispositivo).
        room.options.audioCaptureDefaults = {
          ...room.options.audioCaptureDefaults,
          noiseSuppression: mode === 'standard',
        }
        await applyNoise(mode)
      }
    },

    setSounds(enabled) {
      setAudio({ sounds: enabled })
      if (enabled) playSound('mic-on')
    },

    setVolume(name, volume) {
      volumes = saveVolume(name, volume)
      refresh()
    },

    localMute(name, kind, muted) {
      mutes = setLocalMute(kind, name, muted)
      room?.remoteParticipants.forEach(subscribeVoices)
      log(
        `${muted ? 'mutou' : 'desmutou'} ${kind === 'mic' ? 'a voz' : 'a transmissão'} de ${name} para si`,
      )
      refresh()
    },

    async moderate(action, target) {
      if (!room || !token) return
      log(`moderação: ${action} → ${target}`)
      try {
        const response = await fetch(`${serverUrl}/moderate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ action, target }),
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          set({ error: moderationMessage(body?.error, response.status) })
        }
      } catch {
        set({ error: t('call.err.serverNoReply') })
      }
    },

    async applyProfile(profile) {
      if (!room) return
      const r = room
      const name = profile.name.trim()
      if (name && name !== r.localParticipant.name) {
        const error = await updateMe({ name })
        if (error === 'name-taken') set({ error: t('call.err.nameTaken', { name }) })
        else if (error) log(`falha ao trocar nome: ${error}`)
        else myName = name
      }
      const avatar = await uploadAvatar(profile.avatar, serverUrl)
      if ((r.localParticipant.attributes.avatar ?? '') !== avatar) {
        const error = await updateMe({ avatar })
        if (error) log(`falha ao trocar foto: ${error}`)
      }
      refresh()
    },
  }
})

/** Publica o retrato da chamada para o main (que repassa ao painel). */

const POINTER_KEY = 'sharescreen.pointer.allow'

/** Deixar quem assiste apontar na minha tela (Overlay › Marcadores). Ligado por padrão. */
export function pointerAllowed(): boolean {
  try {
    return localStorage.getItem(POINTER_KEY) !== '0'
  } catch {
    return true
  }
}

/** Atalho de aperte-para-falar (vem do main, que lê o teclado e o mouse). */
function pushToTalk(down: boolean): void {
  if (voiceMode !== 'ptt') return
  if (pttTimer) clearTimeout(pttTimer)
  pttTimer = null
  const apply = (held: boolean) => {
    pttHeld = held
    applyPushToTalk()
    useCallStore.setState({ pushToTalk: { held } })
  }
  // Solta com um pequeno atraso para não cortar o fim da frase.
  if (down) apply(true)
  else pttTimer = setTimeout(() => apply(false), pttReleaseMs)
}

/** Modo de voz escolhido no painel (Overlay › Atalhos). */
export function startVoiceMode(): () => void {
  const apply = (hotkeys: VoiceHotkeys) => {
    voiceMode = hotkeys.voiceMode
    pttReleaseMs = hotkeys.pttReleaseMs
    pttHeld = false
    applyPushToTalk()
    useCallStore.setState({ pushToTalk: voiceMode === 'ptt' ? { held: false } : null })
  }
  window.platform.hotkeys
    .voice()
    .then(apply)
    .catch(() => undefined)
  return window.platform.hotkeys.onVoiceChange(apply)
}

export function startReportingCallState(): () => void {
  const toSnapshot = (s: CallStore): CallSnapshot => ({
    status: s.status,
    audio: s.audio,
    sharing: s.sharing,
    channelName: s.channelName,
    participants: s.participants,
    error: s.error,
    server: s.server,
    successor: s.successor,
    pushToTalk: s.pushToTalk,
    shareStats: s.shareStats,
    shareAdvice: s.shareAdvice,
    speedTest: s.speedTest,
    shareAutoQuality: s.shareAutoQuality,
  })
  window.platform.call.report(toSnapshot(useCallStore.getState()))
  const unsubscribeStore = useCallStore.subscribe((s) => window.platform.call.report(toSnapshot(s)))

  // Pedidos vindos do painel.
  const unsubscribeCommands = window.platform.call.onCommand((command) => {
    const store = useCallStore.getState()
    switch (command.type) {
      case 'join':
        return void store.join(command.name, command.serverUrl, command.password, command.resume)
      case 'leave':
        return void store.leave()
      case 'toggle-mic':
        return void store.toggleMic()
      case 'toggle-deafen':
        return void store.toggleDeafen()
      case 'ptt':
        return pushToTalk(command.down)
      case 'set-input':
        return void store.setInputDevice(command.deviceId)
      case 'set-output':
        return void store.setOutputDevice(command.deviceId)
      case 'set-noise':
        return void store.setNoiseSuppression(command.mode)
      case 'set-sounds':
        return store.setSounds(command.enabled)
      case 'set-volume':
        return store.setVolume(command.name, command.volume)
      case 'local-mute':
        return store.localMute(command.name, command.kind, command.muted)
      case 'moderate':
        return void store.moderate(command.action, command.target)
      case 'retune-share':
        return void store.retuneShare(command.preset)
      case 'auto-quality':
        return store.setShareAutoQuality(command.enabled)
      case 'speed-test':
        return void store.runSpeedTest()
      case 'watch': {
        const person = store.participants.find((p) => p.userId === command.identity)
        return person ? store.watch(person) : undefined
      }
    }
  })

  // Nome/foto trocados na aba Você.
  const unsubscribeProfile = window.platform.profile.onChange((profile) => {
    void useCallStore.getState().applyProfile(profile)
  })

  setSoundsOutput(useCallStore.getState().audio.outputDeviceId)

  // Fonte escolhida no seletor de tela.
  const unsubscribeShare = window.platform.share.onStart((request) => {
    void useCallStore.getState().startShare(request)
  })

  return () => {
    unsubscribeStore()
    unsubscribeCommands()
    unsubscribeShare()
    unsubscribeProfile()
  }
}
