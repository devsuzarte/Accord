import type { JoinResponse, ViewerTarget } from '@sharescreen/shared'
import { PASSWORD_HEADER } from '@sharescreen/shared'
import { Maximize, Minimize, Volume2, VolumeX } from 'lucide-react'
import { Room, RoomEvent, Track } from 'livekit-client'
import type { RemoteParticipant, RemoteTrack, RemoteTrackPublication } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { isLocallyMuted, onLocalMutesChange, readLocalMutes } from '../shared/localMutes'
import { t as translate, useT } from '../shared/i18n'
import type { LocalMutes } from '../shared/localMutes'

type Phase = 'connecting' | 'waiting' | 'live' | 'ended' | 'error'

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

/**
 * Viewer: conexão própria e invisível (token de espectador), que recebe SÓ a tela e o
 * som da transmissão de uma pessoa — o pill continua recebendo só as vozes.
 */
export function Viewer() {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [target, setTarget] = useState<ViewerTarget | null>(null)
  const [phase, setPhase] = useState<Phase>('connecting')
  const [message, setMessage] = useState('')
  const [hasAudio, setHasAudio] = useState(false)
  const [volume, setVolume] = useState(readVolume)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)

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

      let access: JoinResponse
      try {
        const response = await fetch(`${who.serverUrl}/join`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(who.password ? { [PASSWORD_HEADER]: who.password } : {}),
          },
          body: JSON.stringify({ name: translate('viewer.spectator'), viewer: true }),
        })
        if (!response.ok) throw new Error(String(response.status))
        access = (await response.json()) as JoinResponse
      } catch {
        setPhase('error')
        setMessage(translate('viewer.serverUnreachable', { url: who.serverUrl }))
        return
      }
      if (cancelled) return

      const r = new Room({ adaptiveStream: true, dynacast: true })
      room = r

      const subscribeTo = (participant: RemoteParticipant) => {
        if (participant.identity !== who.identity) return
        participant.trackPublications.forEach((pub) => {
          if (isScreenSource(pub.source)) pub.setSubscribed(true)
        })
      }
      const isStreaming = () =>
        !!r.remoteParticipants.get(who.identity)?.getTrackPublication(Track.Source.ScreenShare)

      r.on(RoomEvent.ParticipantConnected, subscribeTo)
        .on(
          RoomEvent.TrackPublished,
          (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (participant.identity === who.identity && isScreenSource(pub.source))
              pub.setSubscribed(true)
          },
        )
        .on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            if (participant.identity !== who.identity) return
            if (track.source === Track.Source.ScreenShare && videoRef.current) {
              track.attach(videoRef.current)
              setPhase('live')
            }
            if (track.source === Track.Source.ScreenShareAudio && audioRef.current) {
              track.attach(audioRef.current)
              setHasAudio(true)
            }
          },
        )
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach()
          if (track.source === Track.Source.ScreenShareAudio) setHasAudio(false)
        })
        .on(
          RoomEvent.TrackUnpublished,
          (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (participant.identity === who.identity && pub.source === Track.Source.ScreenShare) {
              setPhase('ended')
            }
          },
        )
        .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          if (participant.identity === who.identity) setPhase('ended')
        })
        .on(RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setPhase('error')
            setMessage(translate('viewer.dropped'))
          }
        })

      try {
        await r.connect(access.livekitUrl, access.token, { autoSubscribe: false })
      } catch {
        setPhase('error')
        setMessage(translate('viewer.voiceUnreachable', { url: access.livekitUrl }))
        return
      }
      if (cancelled) {
        void r.disconnect()
        return
      }
      const participant = r.remoteParticipants.get(who.identity)
      if (participant) subscribeTo(participant)
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

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  return (
    <div className="viewer" data-chrome={chromeVisible || phase !== 'live' || undefined}>
      <video
        ref={videoRef}
        className="viewer__video"
        autoPlay
        playsInline
        muted
        onDoubleClick={toggleFullscreen}
        hidden={phase !== 'live'}
      />
      <audio ref={audioRef} autoPlay />

      {phase !== 'live' && (
        <div className="viewer__state" role="status">
          {phase === 'connecting' && <p>{t('viewer.connecting')}</p>}
          {phase === 'waiting' && (
            <p>{t('viewer.notStreaming', { name: target?.name ?? t('viewer.thisPerson') })}</p>
          )}
          {phase === 'ended' && (
            <p>{t('viewer.ended', { name: target?.name ?? t('viewer.thisPersonLower') })}</p>
          )}
          {phase === 'error' && <p>{message}</p>}
        </div>
      )}

      <header className="viewer__bar">
        <span className="viewer__who">
          {phase === 'live' && <span className="viewer__live">{t('common.live')}</span>}
          {target?.name ?? t('viewer.stream')}
        </span>

        <span className="viewer__tools">
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
            phase === 'live' && <span className="viewer__note">{t('viewer.noAudio')}</span>
          )}
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
    </div>
  )
}
