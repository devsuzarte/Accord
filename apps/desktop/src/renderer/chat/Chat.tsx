import type { ChatAttachment, ChatMessage, ChatMode, ChatState } from '@sharescreen/shared'
import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_FILE_BYTES,
  CHAT_MAX_TEXT,
  PASSWORD_HEADER,
  isBlockedFile,
} from '@sharescreen/shared'
import { Avatar, colorFor, useReportSize } from '@sharescreen/ui'
import { FileText, Image as ImageIcon, Minimize2, Paperclip, SendHorizontal, X } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from 'react'
import { channelLabel, useLanguage, useT } from '../shared/i18n'

const empty: ChatState = { messages: [], access: null, channelName: null, identity: null }

/** Mensagens do mesmo autor com menos de 5 min de intervalo ficam juntas (sem repetir o nome). */
const GROUP_MS = 5 * 60 * 1000
/** Modo mínimo: até 6 mensagens, cada uma some 2 min depois de chegar. */
const MINI_COUNT = 6
const MINI_TTL = 2 * 60 * 1000

function useChat(): { state: ChatState; mode: ChatMode } {
  const [state, setState] = useState<ChatState>(empty)
  const [mode, setMode] = useState<ChatMode>('mini')
  useEffect(() => {
    window.platform.chat.getState().then(setState).catch(console.error)
    const offState = window.platform.chat.onState(setState)
    const offMode = window.platform.chat.onMode(setMode)
    return () => {
      offState()
      offMode()
    }
  }, [])
  return { state, mode }
}

export function Chat() {
  const { state, mode } = useChat()
  return mode === 'expanded' ? <ExpandedChat state={state} /> : <MiniChat state={state} />
}

function avatarUrl(state: ChatState, message: ChatMessage): string | null {
  return message.avatar && state.access ? `${state.access.serverUrl}${message.avatar}` : null
}

function fileUrl(state: ChatState, attachment: ChatAttachment): string {
  return `${state.access?.serverUrl ?? ''}${attachment.path}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Texto com links clicáveis (abrem no navegador). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

// ───────────────────────── Aberto ─────────────────────────

function ExpandedChat({ state }: { state: ChatState }) {
  const t = useT()
  const { locale } = useLanguage()
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [lightbox, setLightbox] = useState<ChatAttachment | null>(null)

  const time = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale],
  )

  // Fica no fim da conversa, a não ser que a pessoa tenha rolado para cima.
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.messages.length])

  useEffect(() => {
    textRef.current?.focus()
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (lightbox) setLightbox(null)
      else window.platform.chat.setMode('mini')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const addFiles = (files: FileList | File[]) => {
    const list = [...files]
    if (list.some((f) => f.size > CHAT_MAX_FILE_BYTES)) {
      setError(t('chat.err.tooLarge'))
      return
    }
    // Programas e scripts não vão pelo chat (é o jeito mais comum de passar vírus).
    const blocked = list.find((f) => isBlockedFile(f.name))
    if (blocked) {
      setError(t('chat.err.blocked', { name: blocked.name }))
      return
    }
    setError(null)
    setPending((current) => {
      const next = [...current, ...list]
      if (next.length > CHAT_MAX_ATTACHMENTS) {
        setError(t('chat.err.tooMany', { n: CHAT_MAX_ATTACHMENTS }))
        return next.slice(0, CHAT_MAX_ATTACHMENTS)
      }
      return next
    })
  }

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    const access = state.access
    if (!access || sending || (!text.trim() && pending.length === 0)) return
    setSending(true)
    setError(null)
    const auth: Record<string, string> = { authorization: `Bearer ${access.token}` }
    if (access.password) auth[PASSWORD_HEADER] = access.password
    try {
      const ids: string[] = []
      for (const file of pending) {
        const response = await fetch(`${access.serverUrl}/chat/files`, {
          method: 'POST',
          headers: {
            ...auth,
            'content-type': file.type || 'application/octet-stream',
            'x-file-name': encodeURIComponent(file.name),
          },
          body: file,
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(
            body?.error === 'too-large'
              ? t('chat.err.tooLarge')
              : body?.error === 'session-full'
                ? t('chat.err.full')
                : body?.error === 'blocked-file'
                  ? t('chat.err.blocked', { name: file.name })
                  : body?.error === 'slow-down'
                    ? t('chat.err.slowDown')
                    : t('chat.err.send'),
          )
        }
        ids.push(((await response.json()) as ChatAttachment).id)
      }
      const response = await fetch(`${access.serverUrl}/chat/messages`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, CHAT_MAX_TEXT), attachments: ids }),
      })
      if (!response.ok) {
        throw new Error(response.status === 429 ? t('chat.err.slowDown') : t('chat.err.send'))
      }
      setText('')
      setPending([])
      stick.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.err.send'))
    } finally {
      setSending(false)
      textRef.current?.focus()
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (event.clipboardData.files.length) {
      event.preventDefault()
      addFiles(event.clipboardData.files)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files)
  }

  return (
    <div
      className="surface-frame chat-frame"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <section className="chat material" aria-label={t('chat.title')}>
        <header className="chat__head">
          <div className="chat__titles">
            <p className="chat__title">
              {t('chat.title')}
              {state.channelName && (
                <span className="chat__channel">{channelLabel('geral', state.channelName)}</span>
              )}
            </p>
            <p className="chat__note">{t('chat.temporary')}</p>
          </div>
          <button
            type="button"
            className="chat__icon"
            aria-label={t('chat.minimize')}
            title={t('chat.minimize')}
            onClick={() => window.platform.chat.setMode('mini')}
          >
            <Minimize2 size={16} />
          </button>
        </header>

        <div
          ref={listRef}
          className="chat__list"
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
        >
          {state.messages.length === 0 ? (
            <p className="chat__empty">{t('chat.empty')}</p>
          ) : (
            state.messages.map((message, index) => {
              const previous = state.messages[index - 1]
              const grouped =
                previous?.identity === message.identity && message.at - previous.at < GROUP_MS
              const mine = message.identity === state.identity
              return (
                <article
                  key={message.id}
                  className="msg"
                  data-grouped={grouped || undefined}
                  data-mine={mine || undefined}
                >
                  {grouped ? (
                    <span className="msg__gutter" aria-hidden>
                      {time.format(message.at)}
                    </span>
                  ) : (
                    <Avatar
                      id={message.identity}
                      name={message.name}
                      src={avatarUrl(state, message)}
                      size={34}
                    />
                  )}
                  <div className="msg__body">
                    {!grouped && (
                      <p className="msg__head">
                        <span className="msg__name">{message.name}</span>
                        <time className="msg__time" dateTime={new Date(message.at).toISOString()}>
                          {time.format(message.at)}
                        </time>
                      </p>
                    )}
                    {message.text && (
                      <p className="msg__text">
                        <Linkified text={message.text} />
                      </p>
                    )}
                    {message.attachments.length > 0 && (
                      <div className="msg__files">
                        {message.attachments.map((a) =>
                          a.image ? (
                            <button
                              key={a.id}
                              type="button"
                              className="msg__image"
                              title={a.name}
                              onClick={() => setLightbox(a)}
                            >
                              <img src={fileUrl(state, a)} alt={a.name} loading="lazy" />
                            </button>
                          ) : (
                            <a
                              key={a.id}
                              className="msg__file"
                              href={fileUrl(state, a)}
                              download={a.name}
                              title={t('chat.download', { name: a.name })}
                            >
                              <FileText size={18} aria-hidden />
                              <span className="msg__file-name">{a.name}</span>
                              <span className="msg__file-size">{formatSize(a.size)}</span>
                            </a>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>

        <form className="composer" onSubmit={(e) => void send(e)}>
          {pending.length > 0 && (
            <ul className="composer__files">
              {pending.map((file, i) => (
                <li key={`${file.name}-${i}`} className="chip">
                  {file.type.startsWith('image/') ? (
                    <ImageIcon size={14} aria-hidden />
                  ) : (
                    <FileText size={14} aria-hidden />
                  )}
                  <span className="chip__name">{file.name}</span>
                  <button
                    type="button"
                    className="chip__remove"
                    aria-label={t('common.remove')}
                    onClick={() => setPending((list) => list.filter((_, j) => j !== i))}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="composer__error">{error}</p>}
          <div className="composer__box">
            <button
              type="button"
              className="chat__icon"
              aria-label={t('chat.attach')}
              title={t('chat.attach')}
              disabled={sending}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={18} />
            </button>
            <textarea
              ref={textRef}
              className="composer__input"
              rows={1}
              value={text}
              maxLength={CHAT_MAX_TEXT}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.placeholder')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              disabled={!state.access}
            />
            <button
              type="submit"
              className="composer__send"
              aria-label={sending ? t('chat.sending') : t('chat.send')}
              title={t('chat.send')}
              disabled={sending || !state.access || (!text.trim() && pending.length === 0)}
            >
              <SendHorizontal size={18} />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </form>

        {dragging && <div className="chat__drop">{t('chat.dropHere')}</div>}
        {lightbox && (
          <button
            type="button"
            className="lightbox"
            aria-label={t('chat.closeImage')}
            onClick={() => setLightbox(null)}
          >
            <img src={fileUrl(state, lightbox)} alt={lightbox.name} />
          </button>
        )}
      </section>
    </div>
  )
}

// ───────────────────────── Mínimo (estilo chat de live) ─────────────────────────

function MiniChat({ state }: { state: ChatState }) {
  const t = useT()
  const frameRef = useReportSize<HTMLDivElement>((size) => window.platform.chat.resize(size))
  const [now, setNow] = useState(() => Date.now())

  // Recalcula de tempos em tempos para as mensagens antigas saírem.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  const visible = state.messages.filter((m) => now - m.at < MINI_TTL).slice(-MINI_COUNT)

  return (
    <div ref={frameRef} className="surface-frame mini-frame">
      {visible.length > 0 && (
        <ol className="mini" aria-live="polite">
          {visible.map((message) => {
            const left = MINI_TTL - (now - message.at)
            const hasImage = message.attachments.some((a) => a.image)
            return (
              <li key={message.id} className="mini__msg" data-leaving={left < 10_000 || undefined}>
                <Avatar
                  id={message.identity}
                  name={message.name}
                  src={avatarUrl(state, message)}
                  size={22}
                />
                <p className="mini__line">
                  <span
                    className="mini__name"
                    style={{ color: `color-mix(in srgb, ${colorFor(message.name)} 65%, white)` }}
                  >
                    {message.name}
                  </span>{' '}
                  {message.text && <span className="mini__text">{message.text}</span>}
                  {message.attachments.length > 0 && (
                    <span className="mini__hint">
                      {' '}
                      {hasImage ? t('chat.imageInMini') : t('chat.fileInMini')}
                    </span>
                  )}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
