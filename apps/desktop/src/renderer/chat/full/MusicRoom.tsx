import type { MusicItem, MusicState, MusicView, ParticipantState } from '@sharescreen/shared'
import {
  AudioLines,
  ChevronUp,
  ExternalLink,
  Headphones,
  History,
  Link2,
  ListMusic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../shared/i18n'
import { api, ApiError } from './api'
import type { Access } from './api'

interface Props {
  view: LocalMusic
  access: Access
  me: ParticipantState | null
  playerOpen: boolean
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

/** Estado da sala + quando chegou aqui (para estimar o relógio do servidor). */
export type LocalMusic = MusicView & { receivedAt: number }

/** Posição atual (s), estimada pelo relógio do servidor no momento em que o estado chegou. */
export function usePosition(state: MusicState | null, receivedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  const current = state?.current
  if (!state || !current) return 0
  const serverNow = state.serverNow + (Math.max(now, receivedAt) - receivedAt)
  return ((current.pausedAt ?? serverNow) - current.startedAt) / 1000
}

/**
 * Sala de música da call: o que está tocando, a fila com votos (a mais votada toca em seguida),
 * as que tocaram e o link da Jam do Spotify. A música em si toca no player (janela própria).
 */
export function MusicRoom({ view, access, me, playerOpen }: Props) {
  const t = useT()
  const state = view.state
  const [link, setLink] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const position = usePosition(state, view.receivedAt)
  const myId = view.identity
  const privileged = me?.role === 'owner' || me?.role === 'admin'
  const current = state?.current ?? null
  const canControl =
    !!current && (state?.mode === 'open' || privileged || current.addedById === myId)

  const errorText = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : ''
    return code === 'bad-link'
      ? t('music.err.badLink')
      : code === 'not-embeddable'
        ? t('music.err.notEmbeddable')
        : code === 'not-found'
          ? t('music.err.notFound')
          : code === 'queue-full'
            ? t('music.err.full')
            : code === 'forbidden'
              ? t('music.err.forbidden')
              : code === 'slow-down'
                ? t('chat.err.slowDown')
                : t('music.err.failed')
  }

  const call = async (path: string, json: unknown) => {
    setError(null)
    try {
      await api(access, path, { json })
    } catch (e) {
      setError(errorText(e))
    }
  }

  const add = async (url: string) => {
    if (!url.trim() || adding) return
    setAdding(true)
    setError(null)
    try {
      await api(access, '/music/queue', { json: { url: url.trim() } })
      setLink('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setAdding(false)
    }
  }

  // A fila na ordem em que vai tocar: mais votos primeiro, empate por ordem de chegada.
  const queue = useMemo(
    () =>
      [...(state?.queue ?? [])].sort(
        (a, b) => b.votes.length - a.votes.length || a.addedAt - b.addedAt,
      ),
    [state?.queue],
  )

  if (!state) {
    return (
      <div className="music">
        <p className="music__loading">{t('music.loading')}</p>
      </div>
    )
  }

  const duration = current?.duration ?? null
  const progress = duration ? Math.min(1, Math.max(0, position / duration)) : 0
  const skipVoted = !!myId && state.skipVotes.includes(myId)
  const skipsDirect = privileged || current?.addedById === myId

  return (
    <div className="music">
      <div className="music__column">
        <section className="now" aria-label={t('music.nowPlaying')}>
          {current ? (
            <>
              <div className="now__art" style={{ backgroundImage: `url("${current.thumbnail}")` }}>
                <img src={current.thumbnail} alt="" />
              </div>
              <div className="now__info">
                <p className="now__label">
                  {current.pausedAt !== null
                    ? t('music.paused')
                    : position < 0
                      ? t('music.starting')
                      : t('music.nowPlaying')}
                </p>
                <h2 className="now__title" title={current.title}>
                  {current.title}
                </h2>
                <p className="now__meta">
                  {current.author && <span>{current.author}</span>}
                  <span>{t('music.addedBy', { name: current.addedBy })}</span>
                </p>
                <div
                  className="now__bar"
                  role="slider"
                  aria-label={t('music.seek')}
                  aria-valuemin={0}
                  aria-valuemax={duration ?? 0}
                  aria-valuenow={Math.round(position)}
                  tabIndex={canControl && duration ? 0 : -1}
                  data-disabled={!canControl || !duration || undefined}
                  onClick={(e) => {
                    if (!canControl || !duration) return
                    const box = e.currentTarget.getBoundingClientRect()
                    const ratio = (e.clientX - box.left) / box.width
                    void call('/music/control', { action: 'seek', position: ratio * duration })
                  }}
                >
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
                <p className="now__time">
                  <span>{formatTime(Math.max(0, position))}</span>
                  <span>{duration ? formatTime(duration) : '--:--'}</span>
                </p>
                <div className="now__controls">
                  <button
                    type="button"
                    className="round-button round-button--primary"
                    disabled={!canControl}
                    title={
                      !canControl
                        ? t('music.djOnly')
                        : current.pausedAt !== null
                          ? t('music.play')
                          : t('music.pause')
                    }
                    aria-label={current.pausedAt !== null ? t('music.play') : t('music.pause')}
                    onClick={() =>
                      void call('/music/control', {
                        action: current.pausedAt !== null ? 'play' : 'pause',
                      })
                    }
                  >
                    {current.pausedAt !== null ? <Play size={18} /> : <Pause size={18} />}
                  </button>
                  <button
                    type="button"
                    className="round-button"
                    data-active={skipVoted || undefined}
                    disabled={state.mode === 'dj' && !skipsDirect}
                    title={skipsDirect ? t('music.skip') : t('music.voteSkip')}
                    onClick={() => void call('/music/control', { action: 'skip' })}
                  >
                    <SkipForward size={17} />
                    {!skipsDirect && state.mode === 'open' && (
                      <span className="round-button__count">
                        {state.skipVotes.length}/{state.skipNeeded}
                      </span>
                    )}
                  </button>
                  <span className="now__spacer" />
                  <button
                    type="button"
                    className="btn"
                    data-variant={playerOpen ? 'ghost' : 'primary'}
                    onClick={() =>
                      playerOpen
                        ? window.platform.music.closePlayer()
                        : window.platform.music.openPlayer()
                    }
                  >
                    <Headphones size={16} aria-hidden />
                    {playerOpen ? t('music.closePlayer') : t('music.listen')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="now__empty">
              <ListMusic size={28} aria-hidden />
              <h2>{t('music.emptyTitle')}</h2>
              <p>{t('music.emptyText')}</p>
            </div>
          )}
        </section>

        <form
          className="music__add"
          onSubmit={(e) => {
            e.preventDefault()
            void add(link)
          }}
        >
          <Link2 size={17} aria-hidden />
          <input
            value={link}
            placeholder={t('music.addPlaceholder')}
            aria-label={t('music.addPlaceholder')}
            onChange={(e) => setLink(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (
                /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(pasted.trim())
              ) {
                e.preventDefault()
                void add(pasted)
              }
            }}
          />
          <button
            type="submit"
            className="btn"
            data-variant="primary"
            disabled={adding || !link.trim()}
          >
            <Plus size={16} aria-hidden />
            {adding ? t('music.adding') : t('music.add')}
          </button>
        </form>
        {error && <p className="music__error">{error}</p>}
        {!playerOpen && current && <p className="music__note">{t('music.playerNote')}</p>}

        <section className="queue" aria-label={t('music.queue')}>
          <header className="section-head">
            <h3>
              {t('music.queue')} <span className="section-head__count">{queue.length}</span>
            </h3>
            {privileged ? (
              <div className="segmented" role="radiogroup" aria-label={t('music.mode')}>
                {(['open', 'dj'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={state.mode === mode}
                    onClick={() => void call('/music/mode', { mode })}
                  >
                    {t(mode === 'open' ? 'music.modeOpen' : 'music.modeDj')}
                  </button>
                ))}
              </div>
            ) : (
              <span className="section-head__hint">
                {t(state.mode === 'open' ? 'music.modeOpenHint' : 'music.modeDjHint')}
              </span>
            )}
          </header>
          {queue.length === 0 ? (
            <p className="queue__empty">{t('music.queueEmpty')}</p>
          ) : (
            <ol className="queue__list">
              {queue.map((item, index) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  index={index}
                  voted={!!myId && item.votes.includes(myId)}
                  canRemove={privileged || item.addedById === myId}
                  onVote={() => void call('/music/vote', { id: item.id })}
                  onRemove={() => void call('/music/remove', { id: item.id })}
                />
              ))}
            </ol>
          )}
          <p className="queue__hint">{t('music.voteHint')}</p>
        </section>

        <JamCard access={access} state={state} me={me} privileged={privileged} />

        {state.history.length > 0 && (
          <section className="queue queue--history" aria-label={t('music.history')}>
            <header className="section-head">
              <h3>
                <History size={15} aria-hidden /> {t('music.history')}
              </h3>
            </header>
            <ol className="queue__list">
              {state.history.slice(0, 8).map((item) => (
                <li key={`${item.id}-h`} className="track track--history">
                  <img className="track__thumb" src={item.thumbnail} alt="" loading="lazy" />
                  <span className="track__info">
                    <span className="track__title">{item.title}</span>
                    <span className="track__meta">{item.author}</span>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    title={t('music.again')}
                    aria-label={t('music.again')}
                    onClick={() => void add(`https://youtu.be/${item.videoId}`)}
                  >
                    <RotateCcw size={15} />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
        <p className="music__legal">{t('music.legal')}</p>
      </div>
    </div>
  )
}

function QueueRow({
  item,
  index,
  voted,
  canRemove,
  onVote,
  onRemove,
}: {
  item: MusicItem
  index: number
  voted: boolean
  canRemove: boolean
  onVote(): void
  onRemove(): void
}) {
  const t = useT()
  return (
    <li className="track" data-next={index === 0 || undefined}>
      <span className="track__index">{index === 0 ? t('music.next') : index + 1}</span>
      <img className="track__thumb" src={item.thumbnail} alt="" loading="lazy" />
      <span className="track__info">
        <span className="track__title" title={item.title}>
          {item.title}
        </span>
        <span className="track__meta">
          {item.author ? `${item.author} · ` : ''}
          {t('music.addedBy', { name: item.addedBy })}
        </span>
      </span>
      <button
        type="button"
        className="vote"
        aria-pressed={voted}
        title={voted ? t('music.unvote') : t('music.vote')}
        onClick={onVote}
      >
        <ChevronUp size={16} aria-hidden />
        <span>{item.votes.length}</span>
      </button>
      {canRemove && (
        <button
          type="button"
          className="icon-button"
          title={t('music.remove')}
          aria-label={t('music.remove')}
          onClick={onRemove}
        >
          <Trash2 size={15} />
        </button>
      )}
    </li>
  )
}

/**
 * Jam do Spotify: o Accord só compartilha o convite. A Jam (fila, quem escolhe, sincronia)
 * acontece no app do Spotify de cada um — não existe API pública para controlar uma Jam.
 */
function JamCard({
  access,
  state,
  me,
  privileged,
}: {
  access: Access
  state: MusicState
  me: ParticipantState | null
  privileged: boolean
}) {
  const t = useT()
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const jam = state.jam

  const save = async (url: string | null) => {
    setError(null)
    try {
      await api(access, '/music/jam', { json: { url } })
      setLink('')
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'bad-link'
          ? t('music.jam.badLink')
          : t('music.err.failed'),
      )
    }
  }

  return (
    <section className="jam" aria-label={t('music.jam.title')}>
      <span className="jam__mark" aria-hidden>
        <AudioLines size={20} />
      </span>
      <div className="jam__body">
        <h3>{t('music.jam.title')}</h3>
        {jam ? (
          <>
            <p>{t('music.jam.shared', { name: jam.by })}</p>
            <div className="jam__actions">
              <a
                className="btn"
                data-variant="primary"
                href={jam.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} aria-hidden />
                {t('music.jam.join')}
              </a>
              {(privileged || jam.by === me?.displayName) && (
                <button
                  type="button"
                  className="btn"
                  data-variant="ghost"
                  onClick={() => void save(null)}
                >
                  <X size={15} aria-hidden />
                  {t('music.jam.remove')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p>{t('music.jam.how')}</p>
            <form
              className="jam__form"
              onSubmit={(e) => {
                e.preventDefault()
                if (link.trim()) void save(link.trim())
              }}
            >
              <input
                ref={inputRef}
                value={link}
                placeholder={t('music.jam.placeholder')}
                aria-label={t('music.jam.placeholder')}
                onChange={(e) => setLink(e.target.value)}
              />
              <button type="submit" className="btn" data-variant="primary" disabled={!link.trim()}>
                {t('music.jam.share')}
              </button>
            </form>
          </>
        )}
        {error && <p className="music__error">{error}</p>}
        <p className="jam__note">{t('music.jam.note')}</p>
      </div>
    </section>
  )
}
