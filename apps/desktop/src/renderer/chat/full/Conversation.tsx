import type {
  ChatAttachment,
  ChatMessage,
  ChatState,
  CustomEmoji,
  GifResult,
  ParticipantState,
} from '@sharescreen/shared'
import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_FILE_BYTES,
  CHAT_MAX_TEXT,
  isBlockedFile,
} from '@sharescreen/shared'
import { Avatar } from '@sharescreen/ui'
import {
  ArrowDown,
  Copy,
  CornerUpLeft,
  FileText,
  Image as ImageIcon,
  Paperclip,
  SendHorizontal,
  Smile,
  SmilePlus,
  X,
} from 'lucide-react'
import {
  Fragment,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ClipboardEvent, DragEvent, KeyboardEvent, Ref } from 'react'
import { useLanguage, useT } from '../../shared/i18n'
import { api, ApiError, authHeaders, serverFile } from './api'
import type { Access } from './api'
import { EmojiPicker } from './EmojiPicker'
import { loadEmojis, QUICK_REACTIONS, rememberEmoji, searchEmojis } from './emojiData'
import type { EmojiData } from './emojiData'
import { GifPicker } from './GifPicker'
import { Markdown, mentions, onlyEmojis } from './markdown'
import type { MarkdownContext } from './markdown'

/** Mensagens do mesmo autor com menos de 5 min de intervalo ficam juntas. */
const GROUP_MS = 5 * 60 * 1000

interface Props {
  state: ChatState
  access: Access
  people: ParticipantState[]
  me: ParticipantState | null
}

type Popover = { kind: 'emoji' } | { kind: 'gif' } | { kind: 'react'; id: string } | null

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

export function Conversation({ state, access, people, me }: Props) {
  const t = useT()
  const { locale } = useLanguage()
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const [popover, setPopover] = useState<Popover>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const composer = useRef<ComposerHandle | null>(null)

  const myName = me?.displayName ?? ''
  const privileged = me?.role === 'owner' || me?.role === 'admin'
  const emojiMap = useMemo(() => new Map(state.emojis.map((e) => [e.name, e])), [state.emojis])
  const ctx: MarkdownContext = useMemo(
    () => ({ emojis: emojiMap, serverUrl: access.serverUrl, me: myName }),
    [emojiMap, access.serverUrl, myName],
  )
  const time = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale],
  )
  const day = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
    [locale],
  )

  // Fica no fim da conversa, a não ser que a pessoa tenha rolado para cima.
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.messages])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (lightbox) setLightbox(null)
      else if (replyTo) setReplyTo(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, replyTo])

  const toBottom = () => {
    const el = listRef.current
    if (!el) return
    stick.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  const react = (id: string, emoji: string) => {
    rememberEmoji(emoji)
    void api(access, '/chat/react', { json: { id, emoji } }).catch(() => undefined)
  }

  const sendGif = async (gif: GifResult) => {
    setPopover(null)
    try {
      await api(access, '/chat/messages', {
        json: {
          text: '',
          gif: { provider: gif.provider, id: gif.id },
          replyTo: replyTo?.id ?? null,
        },
      })
      setReplyTo(null)
      stick.current = true
    } catch {
      composer.current?.showError(t('chat.err.send'))
    }
  }

  const renderReactions = (message: ChatMessage) => {
    const entries = Object.entries(message.reactions ?? {})
    if (entries.length === 0) return null
    const nameOf = (identity: string) =>
      people.find((p) => p.userId === identity)?.displayName ?? t('chat.someone')
    return (
      <div className="reactions">
        {entries.map(([key, who]) => {
          const custom = /^:([a-z0-9_]+):$/.exec(key)
          const found = custom ? emojiMap.get(custom[1]!) : undefined
          const mine = !!state.identity && who.includes(state.identity)
          return (
            <button
              key={key}
              type="button"
              className="reaction"
              data-mine={mine || undefined}
              title={`${who.map(nameOf).join(', ')} · ${key}`}
              onClick={() => react(message.id, key)}
            >
              {found ? (
                <img src={`${access.serverUrl}${found.path}`} alt={key} />
              ) : custom ? (
                key
              ) : (
                <span>{key}</span>
              )}
              <span className="reaction__count">{who.length}</span>
            </button>
          )
        })}
        <button
          type="button"
          className="reaction reaction--add"
          aria-label={t('chat.react')}
          title={t('chat.react')}
          onClick={() => setPopover({ kind: 'react', id: message.id })}
        >
          <SmilePlus size={15} />
        </button>
      </div>
    )
  }

  const attachmentsOf = (message: ChatMessage) =>
    message.attachments.length > 0 && (
      <div className="msg__files">
        {message.attachments.map((a: ChatAttachment) =>
          a.image ? (
            <button
              key={a.id}
              type="button"
              className="msg__image"
              title={a.name}
              onClick={() => setLightbox(serverFile(access, a.path))}
            >
              <img src={serverFile(access, a.path) ?? ''} alt={a.name} loading="lazy" />
            </button>
          ) : (
            <a
              key={a.id}
              className="msg__file"
              href={serverFile(access, a.path) ?? '#'}
              download={a.name}
              title={t('chat.download', { name: a.name })}
            >
              <FileText size={20} aria-hidden />
              <span className="msg__file-name">{a.name}</span>
              <span className="msg__file-size">{formatSize(a.size)}</span>
            </a>
          ),
        )}
      </div>
    )

  return (
    <div
      className="conversation"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) composer.current?.addFiles(e.dataTransfer.files)
      }}
    >
      <div
        ref={listRef}
        className="conversation__list"
        onScroll={(e) => {
          const el = e.currentTarget
          const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
          stick.current = bottom
          setAtBottom(bottom)
        }}
      >
        <div className="conversation__column">
          <Welcome channel={state.channelName} empty={state.messages.length === 0} />
          {state.messages.map((message, index) => {
            const previous = state.messages[index - 1]
            const newDay = !previous || !sameDay(previous.at, message.at)
            const grouped =
              !newDay &&
              !message.replyTo &&
              previous?.identity === message.identity &&
              message.at - previous.at < GROUP_MS
            const mine = message.identity === state.identity
            const mentioned =
              !mine && (mentions(message.text, myName) || message.replyTo?.name === myName)
            const jumbo =
              !message.gif && message.attachments.length === 0 && onlyEmojis(message.text, emojiMap)
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <div className="day" role="separator">
                    <span>{day.format(message.at)}</span>
                  </div>
                )}
                <article
                  className="msg"
                  data-grouped={grouped || undefined}
                  data-mine={mine || undefined}
                  data-mentioned={mentioned || undefined}
                >
                  {message.replyTo && (
                    <button
                      type="button"
                      className="msg__reply"
                      onClick={() =>
                        listRef.current
                          ?.querySelector(`[data-id="${message.replyTo!.id}"]`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }
                    >
                      <CornerUpLeft size={13} aria-hidden />
                      <span className="msg__reply-name">@{message.replyTo.name}</span>
                      <span className="msg__reply-text">
                        {message.replyTo.text || t('chat.replyMedia')}
                      </span>
                    </button>
                  )}
                  <div className="msg__row" data-id={message.id}>
                    {grouped ? (
                      <span className="msg__gutter" aria-hidden>
                        {time.format(message.at)}
                      </span>
                    ) : (
                      <span className="msg__avatar">
                        <Avatar
                          id={message.identity}
                          name={message.name}
                          src={serverFile(access, message.avatar)}
                          size={40}
                        />
                      </span>
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
                        <div className="msg__text" data-jumbo={jumbo || undefined}>
                          <Markdown text={message.text} ctx={ctx} />
                        </div>
                      )}
                      {message.gif && (
                        <button
                          type="button"
                          className="msg__gif"
                          style={{
                            aspectRatio: `${message.gif.width} / ${message.gif.height}`,
                          }}
                          title={message.gif.title}
                          onClick={() => setLightbox(message.gif!.url)}
                        >
                          <img
                            src={message.gif.url}
                            alt={message.gif.title || 'GIF'}
                            loading="lazy"
                          />
                          <span className="msg__gif-tag">GIF</span>
                        </button>
                      )}
                      {attachmentsOf(message)}
                      {renderReactions(message)}
                    </div>
                    <div className="msg__tools" role="toolbar" aria-label={t('chat.actions')}>
                      {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          title={t('chat.reactWith', { emoji })}
                          onClick={() => react(message.id, emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        title={t('chat.react')}
                        aria-label={t('chat.react')}
                        onClick={() => setPopover({ kind: 'react', id: message.id })}
                      >
                        <SmilePlus size={16} />
                      </button>
                      <button
                        type="button"
                        title={t('chat.reply')}
                        aria-label={t('chat.reply')}
                        onClick={() => {
                          setReplyTo(message)
                          composer.current?.focus()
                        }}
                      >
                        <CornerUpLeft size={16} />
                      </button>
                      {message.text && (
                        <button
                          type="button"
                          title={t('chat.copy')}
                          aria-label={t('chat.copy')}
                          onClick={() => void navigator.clipboard.writeText(message.text)}
                        >
                          <Copy size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              </Fragment>
            )
          })}
        </div>
      </div>

      {!atBottom && (
        <button type="button" className="conversation__jump" onClick={toBottom}>
          <ArrowDown size={15} aria-hidden />
          {t('chat.jumpToPresent')}
        </button>
      )}

      <Composer
        ref={composer}
        access={access}
        enabled={!!state.access}
        channel={state.channelName}
        emojis={state.emojis}
        people={people}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSent={() => {
          setReplyTo(null)
          stick.current = true
        }}
        popover={popover?.kind === 'emoji' || popover?.kind === 'gif' ? popover.kind : null}
        onPopover={(kind) => setPopover(kind ? { kind } : null)}
      />

      {popover?.kind === 'emoji' && (
        <div className="popover-anchor">
          <EmojiPicker
            access={access}
            emojis={state.emojis}
            me={{ name: myName, privileged }}
            onPick={(text) => composer.current?.insert(text)}
            onClose={() => setPopover(null)}
          />
        </div>
      )}
      {popover?.kind === 'react' && (
        <div className="popover-anchor">
          <EmojiPicker
            access={access}
            emojis={state.emojis}
            me={{ name: myName, privileged }}
            onPick={(text) => {
              react(popover.id, text)
              setPopover(null)
            }}
            onClose={() => setPopover(null)}
          />
        </div>
      )}
      {popover?.kind === 'gif' && (
        <div className="popover-anchor">
          <GifPicker
            access={access}
            provider={state.gifs.provider}
            onSend={(gif) => void sendGif(gif)}
            onClose={() => setPopover(null)}
          />
        </div>
      )}
      {popover && <div className="popover-scrim" onClick={() => setPopover(null)} aria-hidden />}

      {dragging && (
        <div className="conversation__drop">
          <Paperclip size={28} aria-hidden />
          {t('chat.dropHere')}
        </div>
      )}
      {lightbox && (
        <button
          type="button"
          className="lightbox"
          aria-label={t('chat.closeImage')}
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" />
        </button>
      )}
    </div>
  )
}

function Welcome({ channel, empty }: { channel: string | null; empty: boolean }) {
  const t = useT()
  return (
    <header className="welcome" data-empty={empty || undefined}>
      <span className="welcome__mark" aria-hidden>
        #
      </span>
      <h1>{t('chat.welcome.title', { channel: channel ?? t('channel.general') })}</h1>
      <p>{t('chat.welcome.text')}</p>
      {empty && (
        <ul className="welcome__tips">
          <li>{t('chat.welcome.tipFormat')}</li>
          <li>{t('chat.welcome.tipEmoji')}</li>
          <li>{t('chat.welcome.tipFiles')}</li>
        </ul>
      )}
    </header>
  )
}

// ───────────────────────── Campo de mensagem ─────────────────────────

interface ComposerHandle {
  insert(text: string): void
  focus(): void
  addFiles(files: FileList | File[]): void
  showError(message: string): void
}

interface Suggestion {
  key: string
  /** O que entra no texto. */
  value: string
  label: string
  /** Atalho em cinza ao lado (ex.: `:smile:`). */
  hint?: string
  preview:
    | { kind: 'unicode'; emoji: string }
    | { kind: 'custom'; src: string }
    | { kind: 'person'; person: ParticipantState }
}

function Composer({
  ref,
  access,
  enabled,
  channel,
  emojis,
  people,
  replyTo,
  onCancelReply,
  onSent,
  popover,
  onPopover,
}: {
  ref: Ref<ComposerHandle | null>
  access: Access
  enabled: boolean
  channel: string | null
  emojis: CustomEmoji[]
  people: ParticipantState[]
  replyTo: ChatMessage | null
  onCancelReply(): void
  onSent(): void
  popover: 'emoji' | 'gif' | null
  onPopover(kind: 'emoji' | 'gif' | null): void
}) {
  const t = useT()
  const { locale } = useLanguage()
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emojiData, setEmojiData] = useState<EmojiData | null>(null)
  /** Sugestão destacada (volta para a primeira quando o que se digita muda). */
  const [pick, setPick] = useState({ key: '', index: 0 })
  const [caret, setCaret] = useState(0)

  const addFiles = (files: FileList | File[]) => {
    const list = [...files]
    if (list.some((f) => f.size > CHAT_MAX_FILE_BYTES)) return setError(t('chat.err.tooLarge'))
    const blocked = list.find((f) => isBlockedFile(f.name))
    if (blocked) return setError(t('chat.err.blocked', { name: blocked.name }))
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

  const insert = (value: string) => {
    const el = textRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const before = text.slice(0, start)
    const spaced = before && !/\s$/.test(before) && value.startsWith(':') ? ` ${value}` : value
    const next = (before + spaced + text.slice(end)).slice(0, CHAT_MAX_TEXT)
    setText(next)
    requestAnimationFrame(() => {
      el?.focus()
      const at = start + spaced.length
      el?.setSelectionRange(at, at)
      setCaret(at)
    })
  }

  // Exposto para a conversa (emoji escolhido, arrastar arquivo, responder).
  useImperativeHandle(ref, () => ({
    insert,
    focus: () => textRef.current?.focus(),
    addFiles,
    showError: setError,
  }))

  useEffect(() => {
    textRef.current?.focus()
  }, [replyTo])

  // O campo cresce com o texto (até 40% da janela).
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`
  }, [text])

  // Sugestões: `:nome` (emojis) e `@nome` (pessoas na call).
  const token = useMemo(() => {
    const before = text.slice(0, caret)
    const match = /(^|\s)([:@])([\p{L}\p{N}_+-]{1,32})$/u.exec(before)
    if (!match) return null
    const query = match[3]!
    if (match[2] === ':' && query.length < 2) return null
    return { kind: match[2] as ':' | '@', query, start: caret - query.length - 1 }
  }, [text, caret])

  useEffect(() => {
    if (token?.kind === ':' && !emojiData) void loadEmojis(locale).then(setEmojiData)
  }, [token, emojiData, locale])

  const suggestions: Suggestion[] = useMemo(() => {
    if (!token) return []
    const q = token.query.toLowerCase()
    if (token.kind === '@') {
      return people
        .filter((p) => !p.isLocal && p.displayName.toLowerCase().startsWith(q))
        .slice(0, 8)
        .map((p) => ({
          key: p.userId,
          value: `@${p.displayName} `,
          label: p.displayName,
          preview: { kind: 'person', person: p },
        }))
    }
    const custom: Suggestion[] = emojis
      .filter((e) => e.name.includes(q))
      .slice(0, 4)
      .map((e) => ({
        key: `c-${e.name}`,
        value: `:${e.name}: `,
        label: `:${e.name}:`,
        preview: { kind: 'custom', src: `${access.serverUrl}${e.path}` },
      }))
    const unicode: Suggestion[] = emojiData
      ? searchEmojis(emojiData, q, 8).map((e) => ({
          key: e.unicode,
          value: e.unicode,
          label: e.label,
          hint: e.shortcodes[0] ? `:${e.shortcodes[0]}:` : undefined,
          preview: { kind: 'unicode', emoji: e.unicode },
        }))
      : []
    return [...custom, ...unicode].slice(0, 8)
  }, [token, people, emojis, emojiData, access.serverUrl])

  const tokenKey = token ? `${token.kind}${token.query}` : ''
  const selected = pick.key === tokenKey ? pick.index : 0
  const setSelected = (update: number | ((index: number) => number)) =>
    setPick({ key: tokenKey, index: typeof update === 'function' ? update(selected) : update })

  const accept = (s: Suggestion) => {
    if (!token) return
    const next = text.slice(0, token.start) + s.value + text.slice(caret)
    setText(next.slice(0, CHAT_MAX_TEXT))
    if (s.preview.kind !== 'person') rememberEmoji(s.value.trim())
    const at = token.start + s.value.length
    requestAnimationFrame(() => {
      textRef.current?.setSelectionRange(at, at)
      setCaret(at)
    })
  }

  const send = async () => {
    if (!enabled || sending || (!text.trim() && pending.length === 0)) return
    setSending(true)
    setError(null)
    try {
      const ids: string[] = []
      for (const file of pending) {
        const response = await fetch(`${access.serverUrl}/chat/files`, {
          method: 'POST',
          headers: authHeaders(access, {
            'content-type': file.type || 'application/octet-stream',
            'x-file-name': encodeURIComponent(file.name),
          }),
          body: file,
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          throw new ApiError(body?.error ?? 'failed', response.status)
        }
        ids.push(((await response.json()) as ChatAttachment).id)
      }
      await api(access, '/chat/messages', {
        json: {
          text: text.slice(0, CHAT_MAX_TEXT),
          attachments: ids,
          replyTo: replyTo?.id ?? null,
        },
      })
      setText('')
      setCaret(0)
      setPending([])
      onSent()
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      setError(
        code === 'too-large'
          ? t('chat.err.tooLarge')
          : code === 'session-full'
            ? t('chat.err.full')
            : code === 'blocked-file'
              ? t('chat.err.blocked', { name: pending[0]?.name ?? '' })
              : code === 'slow-down'
                ? t('chat.err.slowDown')
                : t('chat.err.send'),
      )
    } finally {
      setSending(false)
      textRef.current?.focus()
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setSelected((s) => (s + step + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        accept(suggestions[selected] ?? suggestions[0]!)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setCaret(-1)
        return
      }
    }
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

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <div className="composer__column">
        {suggestions.length > 0 && (
          <ul className="suggest" role="listbox" aria-label={t('chat.suggestions')}>
            {suggestions.map((s, i) => (
              <li key={s.key} role="option" aria-selected={i === selected}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => accept(s)}
                >
                  <span className="suggest__icon">
                    {s.preview.kind === 'unicode' ? (
                      s.preview.emoji
                    ) : s.preview.kind === 'custom' ? (
                      <img src={s.preview.src} alt="" />
                    ) : (
                      <Avatar
                        id={s.preview.person.userId}
                        name={s.preview.person.displayName}
                        src={s.preview.person.avatarUrl}
                        size={22}
                      />
                    )}
                  </span>
                  <span className="suggest__label">{s.label}</span>
                  {s.hint && <span className="suggest__hint">{s.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="composer__box" data-replying={replyTo ? true : undefined}>
          {replyTo && (
            <div className="composer__reply">
              <CornerUpLeft size={14} aria-hidden />
              <span>{t('chat.replyingTo', { name: replyTo.name })}</span>
              <button type="button" aria-label={t('chat.cancelReply')} onClick={onCancelReply}>
                <X size={14} />
              </button>
            </div>
          )}
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
          <textarea
            ref={textRef}
            className="composer__input"
            rows={1}
            value={text}
            maxLength={CHAT_MAX_TEXT}
            placeholder={t('chat.placeholderChannel', { channel: channel ?? t('channel.general') })}
            aria-label={t('chat.placeholder')}
            onChange={(e) => {
              setText(e.target.value)
              setCaret(e.target.selectionStart)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={!enabled}
          />
          <div className="composer__bar">
            <button
              type="button"
              className="composer__tool"
              aria-label={t('chat.attach')}
              title={t('chat.attach')}
              disabled={sending}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={18} />
            </button>
            <button
              type="button"
              className="composer__tool composer__tool--gif"
              aria-pressed={popover === 'gif'}
              title={t('chat.gif.title')}
              onClick={() => onPopover(popover === 'gif' ? null : 'gif')}
            >
              GIF
            </button>
            <button
              type="button"
              className="composer__tool"
              aria-pressed={popover === 'emoji'}
              aria-label={t('chat.emoji.title')}
              title={t('chat.emoji.title')}
              onClick={() => onPopover(popover === 'emoji' ? null : 'emoji')}
            >
              <Smile size={18} />
            </button>
            <span className="composer__hint">{t('chat.enterHint')}</span>
            <button
              type="submit"
              className="composer__send"
              aria-label={sending ? t('chat.sending') : t('chat.send')}
              title={t('chat.send')}
              disabled={sending || !enabled || (!text.trim() && pending.length === 0)}
            >
              <SendHorizontal size={18} />
            </button>
          </div>
        </div>
        {error && <p className="composer__error">{error}</p>}
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
  )
}
