import type {
  AudioState,
  CallSnapshot,
  JoinResponse,
  ModerationAction,
  ParticipantState,
  Profile,
  Role,
  ShareRequest,
} from '@sharescreen/shared'
import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client'
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
import type { LocalMutes } from '../../shared/localMutes'
import { t } from '../../shared/i18n'
import { noiseContext, RnnoiseProcessor } from './noise'
import { startScreenShare } from './screenShare'
import type { ActiveShare } from './screenShare'
import { playSound, setSoundsOutput } from './sounds'
import type { SoundName } from './sounds'

/**
 * Sessão da chamada. Vive no PILL porque ele fica aberto o tempo todo
 * (backgroundThrottling desligado) — docs/02-arquitetura.md › Renderer.
 */
interface CallActions {
  join(name: string, serverUrl: string): Promise<void>
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
  /** Ações do dono/admin (o servidor confere a permissão). */
  moderate(action: ModerationAction, target: string): Promise<void>
  /** Nome ou foto mudaram na aba Você: atualiza para os outros na hora. */
  applyProfile(profile: Profile): Promise<void>
}

export type CallStore = CallSnapshot & CallActions

let room: Room | null = null
let leavingOnPurpose = false
/** Microfone estava ligado antes de ensurdecer (para restaurar ao voltar a ouvir). */
let micBeforeDeafen = true
let serverUrl = ''
let activeShare: ActiveShare | null = null
/** Token da chamada: também identifica você nos pedidos de moderação. */
let token = ''
let mutes: LocalMutes = readLocalMutes()
/** Última foto enviada ao servidor (evita reenviar a mesma). */
let uploaded: { data: string; path: string } | null = null

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

/** Ensurdecido silencia todas as vozes; "mutar para mim" silencia só a daquela pessoa. */
function applyVoiceMutes(deafened: boolean): void {
  audioHost()
    .querySelectorAll('audio')
    .forEach((el) => {
      const who = el.dataset.identity
        ? room?.remoteParticipants.get(el.dataset.identity)
        : undefined
      el.muted = deafened || (!!who && isLocallyMuted(mutes, 'mic', who.name || who.identity))
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
      headers: { 'content-type': 'application/json' },
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

/** Saída de som escolhida também nos <audio> que já existem. */
function applySink(el: HTMLMediaElement, deviceId: string): void {
  const media = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }
  void media.setSinkId?.(deviceId || 'default').catch(() => undefined)
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

async function requestToken(name: string, base: string, avatar: string): Promise<JoinResponse> {
  let response: Response
  try {
    response = await fetch(`${base}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, ...(avatar ? { avatar } : {}) }),
    })
  } catch {
    throw new Error(t('call.err.serverUnreachable', { url: base }))
  }
  if (!response.ok) {
    throw new Error(t('call.err.joinRefused', { status: response.status }))
  }
  return (await response.json()) as JoinResponse
}

export const useCallStore = create<CallStore>((set, get) => {
  const refresh = () => {
    if (!room) return
    applyVoiceMutes(get().audio.deafened)
    set({ participants: participantsOf(room, get().audio.deafened) })
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
    void activeShare?.stop()
    activeShare = null
    audioHost().replaceChildren()
    room = null
    token = ''
    if (error) log(`saiu do canal: ${error}`)
    set({ status: 'idle', sharing: null, channelName: null, participants: [], error })
  }

  const wire = (r: Room) => {
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
          el.muted = get().audio.deafened
          if (get().audio.outputDeviceId) applySink(el, get().audio.outputDeviceId)
          audioHost().append(el)
          refresh()
        },
      )
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove())
        refresh()
      })
      .on(RoomEvent.Reconnecting, () => {
        log('reconectando')
        set({ status: 'reconnecting' })
      })
      .on(RoomEvent.Reconnected, () => {
        log('reconectado')
        set({ status: 'connected', error: null })
        refresh()
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (leavingOnPurpose) return reset(null)
        sound('leave')
        const message =
          reason === DisconnectReason.DUPLICATE_IDENTITY
            ? t('call.err.duplicate')
            : reason === DisconnectReason.PARTICIPANT_REMOVED
              ? t('call.err.kicked')
              : t('call.err.dropped')
        reset(message)
      })
  }

  return {
    status: 'idle',
    audio: loadAudio(),
    sharing: null,
    channelName: null,
    participants: [],
    error: null,

    async join(name, joinUrl) {
      if (get().status !== 'idle') return
      set({ status: 'connecting', error: null })
      try {
        const base = joinUrl.replace(/\/$/, '')
        log(`entrando em ${base}`)
        const profile = await window.platform.profile.get().catch(() => null)
        const avatar = await uploadAvatar(profile?.avatar ?? null, base)
        const access = await requestToken(name, base, avatar)
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
        r.remoteParticipants.forEach(subscribeVoices)
        set({ status: 'connected', channelName: access.channelName })
        sound('join')
        log(`conectado em ${access.livekitUrl} como ${access.role}`)
        refresh()

        // Entra respeitando o que a pessoa escolheu antes: mudo e/ou ensurdecido.
        if (audio.deafened) {
          micBeforeDeafen = !audio.micMuted
          await r.localParticipant.setAttributes({ deafened: '1' }).catch(() => undefined)
        }
        try {
          if (!audio.micMuted && !audio.deafened) {
            await r.localParticipant.setMicrophoneEnabled(true)
          }
        } catch {
          set({
            error: t('call.err.micOnJoin'),
          })
        }
        refresh()
      } catch (error) {
        reset(error instanceof Error ? error.message : t('call.err.joinFailed'))
      }
    },

    async leave() {
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
      applyVoiceMutes(deafened)
      if (room) {
        const blocked = room.localParticipant.attributes.serverMic === 'blocked'
        await room.localParticipant
          .setMicrophoneEnabled(!micMuted && !blocked)
          .catch(() => undefined)
        // Os outros veem o selo "ensurdecido" pelo atributo do participante.
        await room.localParticipant
          .setAttributes({ deafened: deafened ? '1' : '0' })
          .catch(() => undefined)
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
      audioHost()
        .querySelectorAll('audio')
        .forEach((el) => applySink(el, deviceId))
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
        activeShare = await startScreenShare(r.localParticipant, request, () => {
          // A fonte acabou sozinha (ex.: a janela compartilhada fechou).
          activeShare = null
          sound('share-stop')
          set({ sharing: null })
          refresh()
        })
        sound('share-start')
        const audio = activeShare.audio
        log(
          `transmitindo; som: ${audio.state}${audio.state === 'failed' ? ` (${audio.reason})` : ''}`,
        )
        set({
          sharing: { sourceName: request.sourceName, kind: request.kind, audio: audio.state },
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
      const share = activeShare
      activeShare = null
      if (share) sound('share-stop')
      await share?.stop()
      set({ sharing: null })
      refresh()
    },

    watch(participant) {
      if (!serverUrl || participant.isLocal || !participant.streaming) return
      window.platform.viewer.open({
        identity: participant.userId,
        name: participant.displayName,
        serverUrl,
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
        await r.localParticipant
          .setName(name)
          .catch((error) => log(`falha ao trocar nome: ${error}`))
      }
      const avatar = await uploadAvatar(profile.avatar, serverUrl)
      if ((r.localParticipant.attributes.avatar ?? '') !== avatar) {
        await r.localParticipant
          .setAttributes({ avatar })
          .catch((error) => log(`falha ao trocar foto: ${error}`))
      }
      refresh()
    },
  }
})

/** Publica o retrato da chamada para o main (que repassa ao painel). */
export function startReportingCallState(): () => void {
  const toSnapshot = (s: CallStore): CallSnapshot => ({
    status: s.status,
    audio: s.audio,
    sharing: s.sharing,
    channelName: s.channelName,
    participants: s.participants,
    error: s.error,
  })
  window.platform.call.report(toSnapshot(useCallStore.getState()))
  const unsubscribeStore = useCallStore.subscribe((s) => window.platform.call.report(toSnapshot(s)))

  // Pedidos vindos do painel.
  const unsubscribeCommands = window.platform.call.onCommand((command) => {
    const store = useCallStore.getState()
    switch (command.type) {
      case 'join':
        return void store.join(command.name, command.serverUrl)
      case 'leave':
        return void store.leave()
      case 'toggle-mic':
        return void store.toggleMic()
      case 'toggle-deafen':
        return void store.toggleDeafen()
      case 'set-input':
        return void store.setInputDevice(command.deviceId)
      case 'set-output':
        return void store.setOutputDevice(command.deviceId)
      case 'set-noise':
        return void store.setNoiseSuppression(command.mode)
      case 'set-sounds':
        return store.setSounds(command.enabled)
      case 'local-mute':
        return store.localMute(command.name, command.kind, command.muted)
      case 'moderate':
        return void store.moderate(command.action, command.target)
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
