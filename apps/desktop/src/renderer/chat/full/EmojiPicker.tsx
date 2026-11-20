import type { CustomEmoji } from '@sharescreen/shared'
import { CUSTOM_EMOJI_MAX_BYTES, CUSTOM_EMOJI_NAME } from '@sharescreen/shared'
import {
  Apple,
  Car,
  Clock,
  Flag,
  Heart,
  Lightbulb,
  PartyPopper,
  PawPrint,
  Plus,
  Server,
  Smile,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useLanguage, useT } from '../../shared/i18n'
import { api, ApiError } from './api'
import type { Access } from './api'
import { loadEmojis, recentEmojis, rememberEmoji, searchEmojis } from './emojiData'
import type { EmojiData } from './emojiData'

const groupIcons: Record<number, LucideIcon> = {
  0: Smile,
  1: Users,
  3: PawPrint,
  4: Apple,
  5: Car,
  6: PartyPopper,
  7: Lightbulb,
  8: Heart,
  9: Flag,
}

interface Props {
  access: Access
  emojis: CustomEmoji[]
  /** Seu nome e se você é dono/admin (para apagar emojis do servidor). */
  me: { name: string; privileged: boolean }
  /** `text`: o emoji (Unicode) ou `:nome:` (do servidor). */
  onPick(text: string): void
  onClose(): void
}

/** Seletor de emojis: recentes, do servidor (com envio de novos) e todos os do Unicode. */
export function EmojiPicker({ access, emojis, me, onPick, onClose }: Props) {
  const t = useT()
  const { locale } = useLanguage()
  const [data, setData] = useState<EmojiData | null>(null)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState(recentEmojis)
  const [uploading, setUploading] = useState<File | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    loadEmojis(locale)
      .then((loaded) => alive && setData(loaded))
      .catch(console.error)
    return () => {
      alive = false
    }
  }, [locale])

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = (text: string) => {
    rememberEmoji(text)
    setRecent(recentEmojis())
    onPick(text)
  }

  const customByName = useMemo(() => new Map(emojis.map((e) => [e.name, e])), [emojis])
  const results = useMemo(() => (data && query ? searchEmojis(data, query) : []), [data, query])
  const customResults = useMemo(() => {
    const q = query.trim().replace(/^:|:$/g, '').toLowerCase()
    return q ? emojis.filter((e) => e.name.includes(q)) : []
  }, [emojis, query])

  const jump = (id: string) => {
    listRef.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: 'start' })
  }

  const renderRecent = (text: string) => {
    const custom = /^:([a-z0-9_]+):$/.exec(text)
    if (custom) {
      const found = customByName.get(custom[1]!)
      return found ? <CustomButton key={text} emoji={found} access={access} onPick={pick} /> : null
    }
    return <UnicodeButton key={text} emoji={text} label={text} onPick={pick} />
  }

  return (
    <div className="picker emoji-picker" role="dialog" aria-label={t('chat.emoji.title')}>
      <div className="picker__search">
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder={t('chat.emoji.search')}
          aria-label={t('chat.emoji.search')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="emoji-picker__body">
        {!query && (
          <nav className="emoji-picker__rail" aria-label={t('chat.emoji.categories')}>
            {recent.length > 0 && (
              <RailButton
                icon={Clock}
                label={t('chat.emoji.recent')}
                onClick={() => jump('recent')}
              />
            )}
            <RailButton
              icon={Server}
              label={t('chat.emoji.server')}
              onClick={() => jump('server')}
            />
            {data?.groups.map((g) => (
              <RailButton
                key={g.id}
                icon={groupIcons[g.id] ?? Smile}
                label={g.label}
                onClick={() => jump(`g${g.id}`)}
              />
            ))}
          </nav>
        )}
        <div ref={listRef} className="emoji-picker__list">
          {query ? (
            <>
              {customResults.length + results.length === 0 && (
                <p className="picker__empty">{t('chat.emoji.none')}</p>
              )}
              <div className="emoji-grid">
                {customResults.map((e) => (
                  <CustomButton key={e.name} emoji={e} access={access} onPick={pick} />
                ))}
                {results.map((e) => (
                  <UnicodeButton key={e.unicode} emoji={e.unicode} label={e.label} onPick={pick} />
                ))}
              </div>
            </>
          ) : (
            <>
              {recent.length > 0 && (
                <section data-section="recent">
                  <h3>{t('chat.emoji.recent')}</h3>
                  <div className="emoji-grid">{recent.map(renderRecent)}</div>
                </section>
              )}
              <section data-section="server">
                <h3>
                  {t('chat.emoji.server')}
                  <span className="emoji-picker__count">{emojis.length}</span>
                </h3>
                <div className="emoji-grid">
                  {emojis.map((e) => (
                    <CustomButton
                      key={e.name}
                      emoji={e}
                      access={access}
                      onPick={pick}
                      canDelete={me.privileged || e.by.toLowerCase() === me.name.toLowerCase()}
                    />
                  ))}
                  <button
                    type="button"
                    className="emoji-grid__add"
                    title={t('chat.emoji.add')}
                    aria-label={t('chat.emoji.add')}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {emojis.length === 0 && (
                  <p className="picker__hint">{t('chat.emoji.serverHint')}</p>
                )}
              </section>
              {data ? (
                data.groups.map((g) => (
                  <section key={g.id} data-section={`g${g.id}`}>
                    <h3>{g.label}</h3>
                    <div className="emoji-grid">
                      {data.list
                        .filter((e) => e.group === g.id)
                        .map((e) => (
                          <UnicodeButton
                            key={e.unicode}
                            emoji={e.unicode}
                            label={e.label}
                            onPick={pick}
                          />
                        ))}
                    </div>
                  </section>
                ))
              ) : (
                <p className="picker__empty">{t('chat.emoji.loading')}</p>
              )}
            </>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) setUploading(file)
        }}
      />
      {uploading && (
        <UploadEmoji
          access={access}
          file={uploading}
          taken={(name) => customByName.has(name)}
          onDone={() => setUploading(null)}
        />
      )}
    </div>
  )
}

function RailButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick(): void
}) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}>
      <Icon size={17} />
    </button>
  )
}

function UnicodeButton({
  emoji,
  label,
  onPick,
}: {
  emoji: string
  label: string
  onPick(text: string): void
}) {
  return (
    <button type="button" className="emoji-grid__item" title={label} onClick={() => onPick(emoji)}>
      {emoji}
    </button>
  )
}

function CustomButton({
  emoji,
  access,
  onPick,
  canDelete,
}: {
  emoji: CustomEmoji
  access: Access
  onPick(text: string): void
  canDelete?: boolean
}) {
  const t = useT()
  return (
    <span className="emoji-grid__custom">
      <button
        type="button"
        className="emoji-grid__item"
        title={`:${emoji.name}: · ${t('chat.emoji.by', { name: emoji.by })}`}
        onClick={() => onPick(`:${emoji.name}:`)}
      >
        <img src={`${access.serverUrl}${emoji.path}`} alt={`:${emoji.name}:`} loading="lazy" />
      </button>
      {canDelete && (
        <button
          type="button"
          className="emoji-grid__delete"
          title={t('chat.emoji.delete', { name: emoji.name })}
          aria-label={t('chat.emoji.delete', { name: emoji.name })}
          onClick={() =>
            void api(access, `/emojis/${encodeURIComponent(emoji.name)}`, {
              method: 'DELETE',
            }).catch(() => undefined)
          }
        >
          <Trash2 size={11} />
        </button>
      )}
    </span>
  )
}

/** Nome do emoji novo: o do arquivo, limpo (só a-z, 0-9 e _). */
function nameFromFile(file: File): string {
  return (
    file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'emoji'
  )
}

function UploadEmoji({
  access,
  file,
  taken,
  onDone,
}: {
  access: Access
  file: File
  taken(name: string): boolean
  onDone(): void
}) {
  const t = useT()
  const [name, setName] = useState(() => nameFromFile(file))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(preview), [preview])

  const tooBig = file.size > CUSTOM_EMOJI_MAX_BYTES
  const valid = CUSTOM_EMOJI_NAME.test(name) && !taken(name)

  const send = async () => {
    if (!valid || tooBig || busy) return
    setBusy(true)
    setError(null)
    try {
      await api(access, '/emojis', {
        body: file,
        headers: { 'content-type': file.type || 'application/octet-stream', 'x-emoji-name': name },
      })
      onDone()
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      setError(
        code === 'name-taken'
          ? t('chat.emoji.err.taken')
          : code === 'too-large'
            ? t('chat.emoji.err.tooLarge')
            : code === 'session-full'
              ? t('chat.emoji.err.full')
              : code === 'blocked-file'
                ? t('chat.emoji.err.type')
                : t('chat.err.send'),
      )
      setBusy(false)
    }
  }

  return (
    <form
      className="emoji-upload"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <img src={preview} alt="" className="emoji-upload__preview" />
      <label className="emoji-upload__field">
        <span>{t('chat.emoji.name')}</span>
        <span className="emoji-upload__input">
          :
          <input
            autoFocus
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
          />
          :
        </span>
      </label>
      {(error || tooBig || taken(name)) && (
        <p className="emoji-upload__error">
          {error ?? (tooBig ? t('chat.emoji.err.tooLarge') : t('chat.emoji.err.taken'))}
        </p>
      )}
      <div className="emoji-upload__actions">
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={!valid || tooBig || busy}>
          {t('chat.emoji.upload')}
        </button>
      </div>
    </form>
  )
}
