import type { GifProvider, GifResult } from '@sharescreen/shared'
import { Loader } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage, useT } from '../../shared/i18n'
import { api, ApiError } from './api'
import type { Access } from './api'

interface Props {
  access: Access
  provider: GifProvider | null
  onSend(gif: GifResult): void
  onClose(): void
}

interface Page {
  results: GifResult[]
  next: boolean
}

const providerName: Record<GifProvider, string> = { klipy: 'KLIPY', giphy: 'GIPHY' }

/**
 * Busca de GIFs pelo servidor da call (a chave do provedor fica com quem hospeda). Vazio =
 * os GIFs em alta. Clicar envia na hora, como no Discord.
 */
export function GifPicker({ access, provider, onSend, onClose }: Props) {
  const t = useT()
  const { locale } = useLanguage()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<GifResult[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const request = useRef(0)

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const load = useCallback(
    async (q: string, p: number) => {
      const id = ++request.current
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ q, page: String(p), locale })
        const result = await api<Page>(access, `/gifs/search?${params}`)
        if (id !== request.current) return
        setItems((current) => (p === 1 ? result.results : [...current, ...result.results]))
        setHasMore(result.next)
        setPage(p)
      } catch (e) {
        if (id !== request.current) return
        const code = e instanceof ApiError ? e.code : ''
        setError(
          code === 'not-configured'
            ? t('chat.gif.notConfigured')
            : code === 'slow-down'
              ? t('chat.err.slowDown')
              : t('chat.gif.failed'),
        )
        if (p === 1) setItems([])
      } finally {
        if (id === request.current) setLoading(false)
      }
    },
    [access, locale, t],
  )

  // Espera a pessoa parar de digitar.
  useEffect(() => {
    if (!provider) return
    const timer = setTimeout(() => void load(query, 1), query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [query, provider, load])

  if (!provider) {
    return (
      <div className="picker gif-picker" role="dialog" aria-label={t('chat.gif.title')}>
        <div className="picker__notice">
          <p className="picker__notice-title">{t('chat.gif.offTitle')}</p>
          <p>{t('chat.gif.offText')}</p>
        </div>
      </div>
    )
  }

  // Duas colunas equilibradas pela altura (masonry simples).
  const columns: GifResult[][] = [[], []]
  const heights = [0, 0]
  for (const gif of items) {
    const col = heights[0]! <= heights[1]! ? 0 : 1
    columns[col]!.push(gif)
    heights[col]! += gif.height / Math.max(1, gif.width)
  }

  return (
    <div className="picker gif-picker" role="dialog" aria-label={t('chat.gif.title')}>
      <div className="picker__search">
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder={t('chat.gif.search', { provider: providerName[provider] })}
          aria-label={t('chat.gif.title')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div
        className="gif-picker__list"
        onScroll={(e) => {
          const el = e.currentTarget
          if (hasMore && !loading && el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
            void load(query, page + 1)
          }
        }}
      >
        {!query && items.length > 0 && <h3>{t('chat.gif.trending')}</h3>}
        {error && <p className="picker__empty">{error}</p>}
        {!error && !loading && items.length === 0 && (
          <p className="picker__empty">{t('chat.gif.none')}</p>
        )}
        <div className="gif-grid">
          {columns.map((column, i) => (
            <div key={i} className="gif-grid__col">
              {column.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  className="gif-grid__item"
                  title={gif.title || t('chat.gif.send')}
                  style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                  onClick={() => onSend(gif)}
                >
                  <img src={gif.preview} alt={gif.title} loading="lazy" draggable={false} />
                </button>
              ))}
            </div>
          ))}
        </div>
        {loading && (
          <p className="picker__empty">
            <Loader size={16} className="spin" aria-label={t('chat.gif.loading')} />
          </p>
        )}
      </div>
      <p className="gif-picker__credit">
        {t('chat.gif.poweredBy', { provider: providerName[provider] })}
      </p>
    </div>
  )
}
