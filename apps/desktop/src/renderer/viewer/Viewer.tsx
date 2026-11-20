import type { JoinResponse, MiniViewerState, PointerPing, ViewerTarget } from '@sharescreen/shared'
import { POINTER_TOPIC } from '@sharescreen/shared'
import {
  Lock,
  Maximize,
  PanelBottomClose,
  PanelBottomOpen,
  RotateCw,
  Maximize2,
  Minimize,
  PictureInPicture2,
  Scaling,
  Unlock,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { Room, RoomEvent, Track } from 'livekit-client'
import type {
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteVideoTrack,
  TrackPublication,
} from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Pings } from '../pointer/Pings'
import { isLocallyMuted, onLocalMutesChange, readLocalMutes } from '../shared/localMutes'
import { t as translate, useT } from '../shared/i18n'
import type { LocalMutes } from '../shared/localMutes'
import { useCallSnapshot } from '../shared/useCallSnapshot'
import { PeopleStrip, StreamerCard, readStripOpen, saveStripOpen } from './PeopleStrip'
import { QualityBadge, QualityPanel } from './QualityPanel'
import {
  applyQualityChoice,
  readQualityChoice,
  saveQualityChoice,
  useStreamQuality,
} from './quality'
import type { QualityChoice } from './quality'

/**
 * paused = a pessoa parou de transmitir (a janela fica aberta e volta sozinha) ·
 * left = a pessoa saiu da call (volta se ela entrar de novo com o mesmo nome).
 */
type Phase = 'connecting' | 'waiting' | 'live' | 'paused' | 'left' | 'error'

const VOLUME_KEY = 'sharescreen.viewer.volume'

function readVolume(): number {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(value) &&
      value >= 0 &&
      value <= 1 &&
      localStorage.getItem(VOLUME_KEY) !== null
      ? value
      : 1
  } catch {
    return 1
  }
}

const isScreenSource = (source: Track.Source) =>
  source === Track.Source.ScreenShare || source === Track.Source.ScreenShareAudio

/** A janela mostra a transmissão de tela (padrão) ou a câmera da pessoa (0.6.0). */
const videoSourceOf = (target: ViewerTarget) =>
  target.source === 'camera' ? Track.Source.Camera : Track.Source.ScreenShare
const wantedBy = (target: ViewerTarget) => (source: Track.Source) =>
  target.source === 'camera' ? source === Track.Source.Camera : isScreenSource(source)

/**
 * Viewer: conexão própria e invisível (token de espectador), que recebe SÓ a tela e o
 * som da transmissão de uma pessoa — o pill continua recebendo só as vozes.
 */
export function Viewer() {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [target, setTarget] = useState<ViewerTarget | null>(null)
  const cameraMode = target?.source === 'camera'
  const [phase, setPhase] = useState<Phase>('connecting')
  const [message, setMessage] = useState('')
  const [hasAudio, setHasAudio] = useState(false)
  const [volume, setVolume] = useState(readVolume)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [screen, setScreen] = useState<{
    track: RemoteVideoTrack
    pub: RemoteTrackPublication
    participant: RemoteParticipant
  } | null>(null)
  const [choice, setChoice] = useState<QualityChoice>(readQualityChoice)
  // Apontar na tela: o token desta conexão de assistir e quem escuta os marcadores.
  const access = useRef<{
    token: string
    serverUrl: string
    target: string
    camera: boolean
  } | null>(null)
  const pingListeners = useRef(new Set<(ping: PointerPing) => void>())
  const pingSource = useCallback((listener: (ping: PointerPing) => void) => {
    pingListeners.current.add(listener)
    return () => void pingListeners.current.delete(listener)
  }, [])
  const [mini, setMini] = useState<MiniViewerState | null>(null)
  const [unlockKey, setUnlockKey] = useState<string | null>(null)
  /** Onde o quadro do vídeo fica na janela (os marcadores usam a mesma área). */
  const [frame, setFrame] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  /** Identidade de quem esta janela assiste (muda se a pessoa sair e voltar). */
  const [watching, setWatching] = useState<string | null>(null)
  const [stripOpen, setStripOpen] = useState(readStripOpen)
  const call = useCallSnapshot()
  const stats = useStreamQuality(
    screen?.track ?? null,
    screen?.pub ?? null,
    screen?.participant ?? null,
    choice,
  )

  // Conta a quem transmite como está chegando (a cada 4 s, só o resumo, pelo servidor).
  const lastReport = useRef(0)
  useEffect(() => {
    const a = access.current
    // Câmera: não há "transmissão" para avisar quem transmite.
    if (!stats || !a || a.camera || stats.diagnosis === 'warming') return
    const now = Date.now()
    if (now - lastReport.current < 4000) return
    lastReport.current = now
    void fetch(`${a.serverUrl}/stream-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
      body: JSON.stringify({
        target: a.target,
        level: stats.level,
        diagnosis: stats.diagnosis,
        fps: stats.fps,
        height: stats.height,
      }),
    }).catch(() => undefined)
  }, [stats])

  useEffect(() => {
    let room: Room | null = null
    let cancelled = false

    const run = async () => {
      const who = await window.platform.viewer.getTarget()
      if (!who) {
        setPhase('error')
        setMessage(translate('viewer.noTarget'))
        return
      }
      setTarget(who)
      setWatching(who.identity)
      if (who.mini) setMini({ locked: false, opacity: 1 })

      let joined: JoinResponse
      try {
        const response = await fetch(`${who.serverUrl}/join`, {
          method: 'POST',
          // O servidor só dá a conexão de assistir a quem está na call (token de quem assiste).
          headers: { 'content-type': 'application/json', authorization: `Bearer ${who.token}` },
          body: JSON.stringify({ name: translate('viewer.spectator'), viewer: true }),
        })
        if (!response.ok) throw new Error(String(response.status))
        joined = (await response.json()) as JoinResponse
      } catch {
        setPhase('error')
        setMessage(translate('viewer.serverUnreachable', { url: who.serverUrl }))
        return
      }
      if (cancelled) return
      access.current = {
        token: joined.token,
        serverUrl: who.serverUrl,
        target: who.identity,
        camera: who.source === 'camera',
      }
      const videoSource = videoSourceOf(who)
      const wanted = wantedBy(who)

      const r = new Room({ adaptiveStream: true, dynacast: true })
      room = r

      // Quem transmite pode sair e voltar (identidade nova, mesmo nome): a janela segue.
      let targetId = who.identity
      const follow = (participant: RemoteParticipant) => {
        if (participant.identity === targetId || participant.name !== who.name) return
        targetId = participant.identity
        if (access.current) access.current.target = targetId
        setWatching(targetId)
      }
      const subscribeTo = (participant: RemoteParticipant) => {
        follow(participant)
        if (participant.identity !== targetId) return
        participant.trackPublications.forEach((pub) => {
          if (wanted(pub.source)) pub.setSubscribed(true)
        })
      }
      // Câmera desligada fica publicada mas "mutada": conta como não estar no ar.
      const isStreaming = () => {
        const pub = r.remoteParticipants.get(targetId)?.getTrackPublication(videoSource)
        return !!pub && !(who.source === 'camera' && pub.isMuted)
      }

      r.on(RoomEvent.ParticipantConnected, subscribeTo)
        .on(
          RoomEvent.TrackPublished,
          (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            follow(participant)
            if (participant.identity === targetId && wanted(pub.source)) {
              pub.setSubscribed(true)
              if (pub.source === videoSource) setPhase('connecting')
            }
          },
        )
        .on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (participant.identity !== targetId) return
            if (track.source === videoSource && videoRef.current) {
              track.attach(videoRef.current)
              applyQualityChoice(pub, readQualityChoice())
              setScreen({ track: track as RemoteVideoTrack, pub, participant })
              setPhase(pub.isMuted ? 'waiting' : 'live')
            }
            if (track.source === Track.Source.ScreenShareAudio && audioRef.current) {
              track.attach(audioRef.current)
              setHasAudio(true)
            }
          },
        )
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach()
          if (track.source === videoSource) setScreen(null)
          if (track.source === Track.Source.ScreenShareAudio) setHasAudio(false)
        })
        .on(
          RoomEvent.TrackUnpublished,
          (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (participant.identity === targetId && pub.source === videoSource) {
              // Parou de transmitir: a janela fica esperando (não fecha).
              setScreen(null)
              setPhase('paused')
            }
          },
        )
        // Câmera: desligar = "mutar" a publicação; religar volta na mesma janela.
        .on(RoomEvent.TrackMuted, (pub: TrackPublication, participant: Participant) => {
          if (participant.identity === targetId && pub.source === videoSource) {
            setPhase('paused')
          }
        })
        .on(RoomEvent.TrackUnmuted, (pub: TrackPublication, participant: Participant) => {
          if (participant.identity === targetId && pub.source === videoSource) {
            setPhase('live')
          }
        })
        .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          if (participant.identity === targetId) {
            setScreen(null)
            setPhase('left')
          }
        })
        // Marcadores de quem assiste a mesma transmissão (só os que vêm do servidor).
        .on(
          RoomEvent.DataReceived,
          (payload: Uint8Array, participant?: RemoteParticipant, _k?: unknown, topic?: string) => {
            if (participant || topic !== POINTER_TOPIC) return
            try {
              const ping = JSON.parse(new TextDecoder().decode(payload)) as PointerPing
              if (ping.type === 'ping' && ping.target === targetId) {
                for (const listener of pingListeners.current) listener(ping)
              }
            } catch {
              /* ignora */
            }
          },
        )
        .on(RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setScreen(null)
            setPhase('error')
            setMessage(translate('viewer.dropped'))
          }
        })

      try {
        await r.connect(joined.livekitUrl, joined.token, { autoSubscribe: false })
      } catch {
        setPhase('error')
        setMessage(translate('viewer.voiceUnreachable', { url: joined.livekitUrl }))
        return
      }
      if (cancelled) {
        void r.disconnect()
        return
      }
      r.remoteParticipants.forEach(subscribeTo)
      const participant = r.remoteParticipants.get(targetId)
      if (!participant) {
        setPhase('left')
        return
      }
      setPhase(isStreaming() ? 'connecting' : 'waiting')
    }

    void run()
    return () => {
      cancelled = true
      void room?.disconnect()
    }
  }, [])

  // "Mutar áudio (para mim)" na lista de pessoas vale para esta janela também.
  useEffect(() => {
    if (!target) return
    const sync = (mutes: LocalMutes) => setMuted(isLocallyMuted(mutes, 'audio', target.name))
    sync(readLocalMutes())
    return onLocalMutesChange(sync)
  }, [target])

  // Volume só desta janela (não muda o volume das vozes no pill).
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
      audioRef.current.muted = muted
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
    } catch {
      /* ignora */
    }
  }, [volume, muted, hasAudio])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Controles somem quando o mouse fica parado (não cobrem a transmissão).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const wake = () => {
      setChromeVisible(true)
      clearTimeout(timer)
      timer = setTimeout(() => setChromeVisible(false), 2500)
    }
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  const chooseQuality = (next: QualityChoice) => {
    setChoice(next)
    saveQualityChoice(next)
    if (screen) applyQualityChoice(screen.pub, next)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const measure = () => {
      const box = video.getBoundingClientRect()
      if (!video.videoWidth || !box.width || !box.height) return setFrame(null)
      const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight)
      const width = video.videoWidth * scale
      const height = video.videoHeight * scale
      setFrame({
        left: box.left + (box.width - width) / 2,
        top: box.top + (box.height - height) / 2,
        width,
        height,
      })
    }
    measure()
    // O <video> aparece (sai do `hidden`) depois do primeiro quadro: mede de novo quando o
    // tamanho dele muda.
    const observer = new ResizeObserver(measure)
    observer.observe(video)
    video.addEventListener('resize', measure)
    video.addEventListener('loadedmetadata', measure)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      video.removeEventListener('resize', measure)
      video.removeEventListener('loadedmetadata', measure)
      window.removeEventListener('resize', measure)
    }
  }, [phase])

  // Miniatura: o main avisa quando destrava pelo atalho.
  useEffect(() => {
    if (!target?.mini) return
    window.platform.hotkeys
      .voice()
      .then((h) => setUnlockKey(h.bindings.unlockMini?.label ?? null))
      .catch(() => undefined)
    return window.platform.viewer.onMiniState(setMini)
  }, [target])

  /** Clique na transmissão → marcador na tela de quem transmite (e de quem mais assiste). */
  const pointTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const point = (event: ReactMouseEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    const a = access.current
    if (!a || a.camera || !video.videoWidth || mini?.locked) return
    // Onde o quadro está de fato dentro do <video> (object-fit: contain deixa faixas).
    const box = video.getBoundingClientRect()
    const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight)
    const w = video.videoWidth * scale
    const h = video.videoHeight * scale
    const x = (event.clientX - box.left - (box.width - w) / 2) / w
    const y = (event.clientY - box.top - (box.height - h) / 2) / h
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    // Espera para ver se não é um duplo clique (tela cheia).
    if (pointTimer.current) {
      clearTimeout(pointTimer.current)
      pointTimer.current = null
      return
    }
    pointTimer.current = setTimeout(() => {
      pointTimer.current = null
      void fetch(`${a.serverUrl}/pointer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
        body: JSON.stringify({ target: a.target, x, y }),
      }).catch(() => undefined)
    }, 230)
  }

  const dragging = useRef(false)
  const dragHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest('button, input')) return
      dragging.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      window.platform.viewer.drag('start')
    },
    onPointerMove: () => {
      if (dragging.current) window.platform.viewer.drag('move')
    },
    onPointerUp: () => {
      if (!dragging.current) return
      dragging.current = false
      window.platform.viewer.drag('end')
    },
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  return (
    <div
      className="viewer"
      data-mini={mini ? true : undefined}
      data-locked={mini?.locked || undefined}
      data-chrome={chromeVisible || statsOpen || phase !== 'live' || undefined}
    >
      <div className="viewer__stage">
        <video
          ref={videoRef}
          className="viewer__video"
          autoPlay
          playsInline
          muted
          title={
            phase === 'live' && !mini?.locked && !cameraMode ? t('viewer.pointHint') : undefined
          }
          onClick={point}
          onDoubleClick={mini ? undefined : toggleFullscreen}
          hidden={phase !== 'live'}
        />
        <audio ref={audioRef} autoPlay />
        {phase === 'live' && frame && !cameraMode && (
          <div className="viewer__pings" style={frame}>
            <Pings source={pingSource} />
          </div>
        )}

        {mini && (
          <MiniBar
            state={mini}
            name={target?.name ?? ''}
            unlockKey={unlockKey}
            dragHandlers={dragHandlers}
          />
        )}

        {phase !== 'live' &&
          (phase === 'paused' || phase === 'left' || phase === 'waiting' ? (
            <StreamerCard
              person={call.participants.find((p) => p.userId === watching) ?? null}
              name={target?.name ?? t('viewer.thisPerson')}
              phase={phase}
              compact={!!mini}
              camera={cameraMode}
            />
          ) : (
            <div className="viewer__state" role="status">
              {phase === 'connecting' && <p>{t('viewer.connecting')}</p>}
              {phase === 'error' && (
                <>
                  <p>{message}</p>
                  <span className="viewer__state-actions">
                    <button
                      type="button"
                      className="viewer__pill"
                      onClick={() => location.reload()}
                    >
                      <RotateCw size={15} aria-hidden />
                      {t('viewer.retry')}
                    </button>
                    <button type="button" className="viewer__pill" onClick={() => window.close()}>
                      {t('viewer.close')}
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
      </div>

      {!mini && stripOpen && call.participants.length > 0 && (
        <PeopleStrip people={call.participants} watching={watching} />
      )}

      <header className="viewer__bar" hidden={!!mini}>
        <span className="viewer__who">
          {phase === 'live' && <span className="viewer__live">{t('common.live')}</span>}
          {cameraMode && target
            ? t('viewer.cameraWindowTitle', { name: target.name })
            : (target?.name ?? t('viewer.stream'))}
        </span>

        <span className="viewer__tools">
          {phase === 'live' && (
            <QualityBadge stats={stats} open={statsOpen} onToggle={() => setStatsOpen((o) => !o)} />
          )}
          {hasAudio ? (
            <span className="viewer__volume">
              <button
                type="button"
                className="viewer__button"
                aria-label={muted ? t('viewer.unmute') : t('viewer.mute')}
                title={muted ? t('viewer.unmuteShort') : t('viewer.muteShort')}
                onClick={() => setMuted((m) => !m)}
              >
                {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                aria-label={t('viewer.volume')}
                onChange={(e) => {
                  setMuted(false)
                  setVolume(Number(e.target.value))
                }}
              />
            </span>
          ) : (
            phase === 'live' &&
            !cameraMode && <span className="viewer__note">{t('viewer.noAudio')}</span>
          )}
          <button
            type="button"
            className="viewer__button"
            aria-pressed={stripOpen}
            aria-label={stripOpen ? t('viewer.strip.hide') : t('viewer.strip.show')}
            title={stripOpen ? t('viewer.strip.hide') : t('viewer.strip.show')}
            onClick={() => {
              setStripOpen((open) => {
                saveStripOpen(!open)
                return !open
              })
            }}
          >
            {stripOpen ? <PanelBottomClose size={18} /> : <PanelBottomOpen size={18} />}
          </button>
          <button
            type="button"
            className="viewer__button"
            aria-label={t('viewer.mini')}
            title={t('viewer.miniTitle')}
            onClick={() => window.platform.viewer.toggleMini()}
          >
            <PictureInPicture2 size={18} />
          </button>
          <button
            type="button"
            className="viewer__button"
            aria-label={fullscreen ? t('viewer.exitFullscreen') : t('viewer.fullscreen')}
            title={fullscreen ? t('viewer.exitFullscreenTitle') : t('viewer.fullscreenTitle')}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </span>
      </header>

      {statsOpen && phase === 'live' && stats && (
        <QualityPanel
          stats={stats}
          streamerName={target?.name ?? t('viewer.thisPerson')}
          choice={choice}
          onChoice={chooseQuality}
        />
      )}
    </div>
  )
}

/** Controles da miniatura: aparecem com o mouse em cima; arrastar pela barra move a janela. */
function MiniBar({
  state,
  name,
  unlockKey,
  dragHandlers,
}: {
  state: MiniViewerState
  name: string
  unlockKey: string | null
  dragHandlers: Record<string, (event: ReactPointerEvent<HTMLElement>) => void>
}) {
  const t = useT()
  if (state.locked) {
    return (
      <span className="mini__lock" title={t('viewer.lockedHint', { key: unlockKey ?? '—' })}>
        <Lock size={12} aria-hidden />
      </span>
    )
  }
  return (
    <div className="mini__bar" {...dragHandlers}>
      <span className="mini__name">{name}</span>
      <input
        type="range"
        min={0.3}
        max={1}
        step={0.05}
        value={state.opacity}
        className="mini__opacity"
        aria-label={t('viewer.opacity')}
        title={t('viewer.opacity')}
        onChange={(e) => window.platform.viewer.setMini({ opacity: Number(e.target.value) })}
      />
      <button
        type="button"
        className="mini__button"
        aria-label={t('viewer.miniSize')}
        title={t('viewer.miniSize')}
        onClick={() => window.platform.viewer.cycleMiniSize()}
      >
        <Scaling size={14} />
      </button>
      <button
        type="button"
        className="mini__button"
        aria-label={t('viewer.lock')}
        title={t('viewer.lockTitle', { key: unlockKey ?? '—' })}
        onClick={() => window.platform.viewer.setMini({ locked: true })}
      >
        <Unlock size={14} />
      </button>
      <button
        type="button"
        className="mini__button"
        aria-label={t('viewer.backToWindow')}
        title={t('viewer.backToWindow')}
        onClick={() => window.platform.viewer.toggleMini()}
      >
        <Maximize2 size={14} />
      </button>
      <button
        type="button"
        className="mini__button"
        aria-label={t('viewer.close')}
        title={t('viewer.close')}
        onClick={() => window.close()}
      >
        <X size={14} />
      </button>
    </div>
  )
}
