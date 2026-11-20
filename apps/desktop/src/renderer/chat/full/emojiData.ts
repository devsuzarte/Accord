import type { Locale } from '@sharescreen/shared'

/**
 * Emojis do Unicode com nomes e palavras-chave em português ou inglês (emojibase-data, MIT).
 * O arquivo é grande (~800 KB): só carrega quando a pessoa abre o seletor ou digita `:`.
 */
export interface EmojiEntry {
  unicode: string
  label: string
  tags: string[]
  group: number
  order: number
  /** Atalhos no estilo `:smile:` (do GitHub, em inglês: são os que as pessoas conhecem). */
  shortcodes: string[]
}

export interface EmojiGroup {
  id: number
  label: string
}

export interface EmojiData {
  list: EmojiEntry[]
  groups: EmojiGroup[]
}

interface Raw {
  emoji: string
  label: string
  hexcode: string
  tags?: string[]
  group?: number
  order?: number
  version?: number
}

/**
 * Emojis mais novos que isso aparecem como quadradinhos na fonte do Windows (Segoe UI
 * Emoji): ficam de fora até a fonte do sistema acompanhar.
 */
const MAX_VERSION = 15

const cache = new Map<Locale, Promise<EmojiData>>()

export function loadEmojis(locale: Locale): Promise<EmojiData> {
  let pending = cache.get(locale)
  if (!pending) {
    pending = (async () => {
      const [data, messages, shortcodes] = await Promise.all([
        locale === 'pt-BR'
          ? import('emojibase-data/pt/data.json')
          : import('emojibase-data/en/data.json'),
        locale === 'pt-BR'
          ? import('emojibase-data/pt/messages.json')
          : import('emojibase-data/en/messages.json'),
        import('emojibase-data/en/shortcodes/github.json'),
      ])
      const codes = shortcodes.default as Record<string, string | string[]>
      const list = (data.default as unknown as Raw[])
        // Grupo 2 = peças (tons de pele, cabelos): não são emojis para escolher sozinhos.
        .filter(
          (e) => typeof e.group === 'number' && e.group !== 2 && (e.version ?? 0) <= MAX_VERSION,
        )
        .map((e) => {
          const code = codes[e.hexcode]
          return {
            unicode: e.emoji,
            label: e.label,
            tags: e.tags ?? [],
            group: e.group!,
            order: e.order ?? 0,
            shortcodes: code ? (Array.isArray(code) ? code : [code]) : [],
          }
        })
        .sort((a, b) => a.order - b.order)
      const groups = (
        messages.default as { groups: { key: string; message: string; order: number }[] }
      ).groups
        .filter((g) => g.order !== 2)
        .map((g) => ({ id: g.order, label: g.message }))
      return { list, groups }
    })()
    cache.set(locale, pending)
  }
  return pending
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Busca por nome, palavra-chave ou atalho (sem diferenciar acento). */
export function searchEmojis(data: EmojiData, query: string, limit = 120): EmojiEntry[] {
  const q = normalize(query.trim().replace(/^:|:$/g, ''))
  if (!q) return []
  const starts: EmojiEntry[] = []
  const contains: EmojiEntry[] = []
  for (const emoji of data.list) {
    const words = [emoji.label, ...emoji.tags, ...emoji.shortcodes].map(normalize)
    if (words.some((w) => w.startsWith(q))) starts.push(emoji)
    else if (words.some((w) => w.includes(q))) contains.push(emoji)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}

// ───────────────────────── Recentes ─────────────────────────

const RECENT_KEY = 'sharescreen.chat.recentEmojis'

export function recentEmojis(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((e): e is string => typeof e === 'string') : []
  } catch {
    return []
  }
}

export function rememberEmoji(emoji: string): void {
  try {
    const next = [emoji, ...recentEmojis().filter((e) => e !== emoji)].slice(0, 32)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignora */
  }
}

/** Reações rápidas (aparecem ao passar o mouse na mensagem). */
export const QUICK_REACTIONS = ['👍', '😂', '❤️', '🔥', '😮', '😢']
