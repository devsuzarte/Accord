import { INVITE_PAGE, PASSWORD_HEADER } from '@sharescreen/shared'
import type { MusicState, MusicView } from '@sharescreen/shared'
import {
  ListMusic,
  Loader,
  Pause,
  Play,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../shared/i18n'

/**
 * Player da sala de música. Usa só a IFrame Player API oficial do YouTube: o vídeo fica
 * visível (nada de áudio separado, cache ou player escondido) e os anúncios do YouTube tocam
 * normalmente. Cada pessoa toca no próprio player; o servidor da call só manda a fila e o
 * relógio, e este player se acerta pelo relógio (diferença de mais de 1,5 s → pula para lá).
 */

interface YTPlayer {
  loadVideoById(options: { videoId: string; startSeconds?: number }): void
  cueVideoById(options: { videoId: string; startSeconds?: number }): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  setVolume(volume: number): void
  mute(): void
  unMute(): void
  destroy(): void
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string
      height: string
      playerVars: Record<string, string | number>
      events: {
        onReady(): void
        onStateChange(event: { data: number }): void
        onError(event: { data: number }): void
      }
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const ENDED = 0
const PLAYING = 1
const BUFFERING = 3
/** Vídeo removido, privado ou que não deixa incorporar: pula para a próxima. */
const UNPLAYABLE = new Set([100, 101, 150])
const DRIFT = 1.5
const VOLUME_KEY = 'sharescreen.music.volume'

let apiReady: Promise<YTNamespace> | null = null

function loadYouTubeApi(): Promise<YTNamespace> {
  apiReady ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT)
    window.onYouTubeIframeAPIReady = () => (window.YT ? resolve(window.YT) : reject())
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => {
      apiReady = null
      reject(new Error('youtube'))
    }
    document.head.append(script)
  })
  return apiReady
}

function readVolume(): number {
  const value = Number(localStorage.getItem(VOLUME_KEY))
  return Number.isFinite(value) && value >= 0 && value <= 100 && localStorage.getItem(VOLUME_KEY)
    ? value
    : 70
}

type Status = 'loading' | 'ready' | 'blocked' | 'offline'

export function Player() {
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YTPlayer | null>(null)
  const [view, setView] = useState<MusicView>({ state: null, access: null, identity: null })
  const [status, setStatus] = useState<Status>('loading')
  const [volume, setVolume] = useState(readVolume)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Diferença entre o relógio do servidor e o deste PC (ms). */
  const offset = useRef(0)
  const latest = useRef<MusicState | null>(null)
  const loaded = useRef<string | null>(null)
  const reported = useRef<{ ended: string | null; duration: string | null }>({
    ended: null,
    duration: null,
  })

  useEffect(() => {
    window.platform.music.getState().then(setView).catch(console.error)
    return window.platform.music.onState(setView)
  }, [])

  useEffect(() => {
    latest.current = view.state
  }, [view.state])

  const access = view.access

  const post = useCallback(
    (path: string, json: unknown) => {
      if (!access) return Promise.resolve(false)
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        authorization: `Bearer ${access.token}`,
      }
      if (access.password) headers[PASSWORD_HEADER] = access.password
      return fetch(`${access.serverUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(json),
      })
        .then((r) => r.ok)
        .catch(() => false)
    },
    [access],
  )

  // Acerta o relógio com o servidor (ida e volta / 2), de tempos em tempos.
  useEffect(() => {
    if (!access) return
    let alive = true
    const measure = async () => {
      const headers: Record<string, string> = { authorization: `Bearer ${access.token}` }
      if (access.password) headers[PASSWORD_HEADER] = access.password
      try {
        const t0 = Date.now()
        const response = await fetch(`${access.serverUrl}/music`, { headers })
        const t1 = Date.now()
        if (!response.ok || !alive) return
        const state = (await response.json()) as MusicState
        offset.current = state.serverNow - (t0 + t1) / 2
      } catch {
        /* mantém o anterior */
      }
    }
    void measure()
    const timer = setInterval(() => void measure(), 120_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [access])

  // Cria o player do YouTube uma vez.
  useEffect(() => {
    let cancelled = false
    let created: YTPlayer | null = null
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !host.current) return
        const target = document.createElement('div')
        host.current.replaceChildren(target)
        const vars: Record<string, string | number> = {
          autoplay: 0,
          // Os controles são os do Accord (o player segue o relógio da sala).
          controls: 0,
          disablekb: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          widget_referrer: new URL('..', INVITE_PAGE).href,
        }
        if (location.origin.startsWith('http')) vars.origin = location.origin
        created = new YT.Player(target, {
          width: '100%',
          height: '100%',
          playerVars: vars,
          events: {
            onReady: () => {
              if (cancelled) return
              player.current = created
              created?.setVolume(readVolume())
              setStatus('ready')
            },
            onStateChange: (event) => {
              const current = latest.current?.current
              if (!current || loaded.current !== current.id) return
              if (event.data === PLAYING && reported.current.duration !== current.id) {
                const seconds = created?.getDuration() ?? 0
                if (seconds > 0 && current.duration === null) {
                  reported.current.duration = current.id
                  void post('/music/duration', { id: current.id, seconds })
                }
              }
              if (event.data === ENDED && reported.current.ended !== current.id) {
                reported.current.ended = current.id
                void post('/music/ended', { id: current.id })
              }
            },
            onError: (event) => {
              const current = latest.current?.current
              if (event.data === 153) {
                // O YouTube não aceitou a identificação do app (Referer).
                setStatus('blocked')
                return
              }
              if (current && UNPLAYABLE.has(event.data) && reported.current.ended !== current.id) {
                reported.current.ended = current.id
                setError(t('music.player.unplayable'))
                void post('/music/ended', { id: current.id, failed: true })
              }
            },
          },
        })
      })
      .catch(() => !cancelled && setStatus('offline'))
    return () => {
      cancelled = true
      player.current = null
      try {
        created?.destroy()
      } catch {
        /* já destruído */
      }
    }
  }, [post, t])

  // Segue a sala: carrega a música atual, pausa/toca e corrige a posição.
  useEffect(() => {
    if (status !== 'ready') return
    const tick = () => {
      const p = player.current
      const state = latest.current
      if (!p || !state) return
      const current = state.current
      if (!current) {
        if (loaded.current) {
          p.stopVideo()
          loaded.current = null
        }
        return
      }
      const now = Date.now() + offset.current
      const expected = ((current.pausedAt ?? now) - current.startedAt) / 1000
      if (loaded.current !== current.id) {
        loaded.current = current.id
        setError(null)
        const start = Math.max(0, expected)
        if (current.pausedAt !== null || expected < 0)
          p.cueVideoById({ videoId: current.videoId, startSeconds: start })
        else p.loadVideoById({ videoId: current.videoId, startSeconds: start })
        return
      }
      const playing = p.getPlayerState() === PLAYING || p.getPlayerState() === BUFFERING
      if (current.pausedAt !== null || expected < 0) {
        if (playing) p.pauseVideo()
        if (expected >= 0 && Math.abs(p.getCurrentTime() - expected) > DRIFT)
          p.seekTo(expected, true)
        return
      }
      const duration = current.duration ?? p.getDuration()
      if (duration > 0 && expected > duration + 2) return // acabou: espera a próxima
      if (!playing) p.playVideo()
      if (Math.abs(p.getCurrentTime() - expected) > DRIFT) p.seekTo(expected, true)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [status, view.state])

  useEffect(() => {
    const p = player.current
    if (!p) return
    p.setVolume(volume)
    if (muted || volume === 0) p.mute()
    else p.unMute()
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
    } catch {
      /* ignora */
    }
  }, [volume, muted, status])

  const current = view.state?.current ?? null
  const paused = current?.pausedAt !== null
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  return (
    <div className="player">
      <header className="player__bar">
        <span className="player__brand">
          <ListMusic size={14} aria-hidden />
          {t('music.title')}
        </span>
        <button
          type="button"
          className="player__icon"
          title={t('music.player.close')}
          aria-label={t('music.player.close')}
          onClick={() => window.platform.music.closePlayer()}
        >
          <X size={15} />
        </button>
      </header>

      <div className="player__video">
        <div ref={host} className="player__frame" />
        {(status !== 'ready' || !current) && (
          <div className="player__state" role="status">
            {status === 'loading' && (
              <Loader size={20} className="spin" aria-label={t('music.loading')} />
            )}
            {status === 'offline' && <p>{t('music.player.offline')}</p>}
            {status === 'blocked' && <p>{t('music.player.blocked')}</p>}
            {status === 'ready' && !current && <p>{t('music.player.idle')}</p>}
          </div>
        )}
      </div>

      <footer className="player__controls">
        <div className="player__now">
          <span className="player__title" title={current?.title}>
            {current?.title ?? t('music.player.nothing')}
          </span>
          <span className="player__meta">
            {error ??
              (current ? t('music.addedBy', { name: current.addedBy }) : t('music.player.hint'))}
          </span>
        </div>
        <button
          type="button"
          className="player__icon"
          disabled={!current}
          title={paused ? t('music.play') : t('music.pause')}
          aria-label={paused ? t('music.play') : t('music.pause')}
          onClick={() => void post('/music/control', { action: paused ? 'play' : 'pause' })}
        >
          {paused ? <Play size={17} /> : <Pause size={17} />}
        </button>
        <button
          type="button"
          className="player__icon"
          disabled={!current}
          title={t('music.voteSkip')}
          aria-label={t('music.voteSkip')}
          onClick={() => void post('/music/control', { action: 'skip' })}
        >
          <SkipForward size={17} />
        </button>
        <span className="player__volume">
          <button
            type="button"
            className="player__icon"
            title={muted ? t('music.player.unmute') : t('music.player.mute')}
            aria-label={muted ? t('music.player.unmute') : t('music.player.mute')}
            onClick={() => setMuted((m) => !m)}
          >
            <VolumeIcon size={17} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : volume}
            aria-label={t('music.player.volume')}
            onChange={(e) => {
              setMuted(false)
              setVolume(Number(e.target.value))
            }}
          />
        </span>
        <button
          type="button"
          className="player__icon"
          title={t('music.player.queue')}
          aria-label={t('music.player.queue')}
          onClick={() => window.platform.chat.open('music')}
        >
          <ListMusic size={17} />
        </button>
      </footer>
    </div>
  )
}
