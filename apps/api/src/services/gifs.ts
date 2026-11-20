import { createHash, randomBytes } from 'node:crypto'
import type { ChatGif, GifProvider, GifResult, GifSettings, GifStatus } from '@sharescreen/shared'

/**
 * Busca de GIFs pelo servidor. A chave do provedor fica só aqui (nunca vai para os
 * clientes) e o servidor guarda por um tempo o que devolveu: na hora de enviar, o app manda
 * só `{ provider, id }` e o servidor monta o GIF. Assim ninguém manda um "GIF" com um link
 * qualquer (rastreador, imagem de outro site) para todo mundo.
 *
 * O Tenor (Google) fechou a API em 30/06/2026. Provedores aceitos: KLIPY (grátis) e GIPHY.
 * Ver docs/17-chat-music-sounds.md.
 */
let config: GifSettings | null = fromEnv()

function fromEnv(): GifSettings | null {
  const provider = process.env.ACCORD_GIF_PROVIDER
  const key = process.env.ACCORD_GIF_KEY?.trim()
  if (!key || (provider !== 'klipy' && provider !== 'giphy')) return null
  return { provider, key }
}

export function gifStatus(): GifStatus {
  return { provider: config?.provider ?? null }
}

export function setGifConfig(next: GifSettings | null): void {
  config = next && next.key.trim() ? { provider: next.provider, key: next.key.trim() } : null
  cache.clear()
}

// ───────────────────────── O que já foi devolvido ─────────────────────────

const CACHE_MAX = 3000
const CACHE_TTL = 6 * 60 * 60 * 1000
const cache = new Map<string, { gif: ChatGif; at: number }>()

function remember(gif: ChatGif): void {
  cache.set(`${gif.provider}:${gif.id}`, { gif, at: Date.now() })
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

/** GIF que esta busca devolveu há pouco (é o único jeito de mandar GIF no chat). */
export function knownGif(provider: GifProvider, id: string): ChatGif | null {
  const hit = cache.get(`${provider}:${id}`)
  if (!hit || Date.now() - hit.at > CACHE_TTL) return null
  return hit.gif
}

// ───────────────────────── Provedores ─────────────────────────

/** Id anônimo deste servidor (o KLIPY pede um id de cliente; não mandamos nada da pessoa). */
const customerId = createHash('sha256').update(randomBytes(16)).digest('hex').slice(0, 24)

const https = (value: unknown): string | null =>
  typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value) ? value : null

const num = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

type Json = Record<string, unknown>
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null ? (value as Json) : {}

/**
 * KLIPY: `GET https://api.klipy.com/api/v1/{key}/gifs/search` (a chave vai no caminho).
 * Resposta `{ result, data: { data: [...], has_next } }`; cada item tem
 * `file.{hd,md,sm,xs}.{gif,webp,mp4}.{url,width,height}`. Itens `type: "ad"` são pulados.
 * [Hypothesis] formato conferido em integrações abertas, não na documentação oficial
 * (que só abre com JavaScript): validar com uma chave real.
 */
function parseKlipy(body: unknown): { results: GifResult[]; next: boolean } {
  const data = obj(obj(body).data)
  const list = Array.isArray(data.data) ? data.data : []
  const results: GifResult[] = []
  for (const raw of list) {
    const item = obj(raw)
    if (item.type === 'ad') continue
    const file = obj(item.file)
    const pick = (size: string, format: string) => obj(obj(file[size])[format])
    const main = [pick('md', 'gif'), pick('md', 'webp'), pick('hd', 'gif'), pick('sm', 'gif')].find(
      (f) => https(f.url),
    )
    const small = [pick('sm', 'gif'), pick('sm', 'webp'), pick('xs', 'gif'), main ?? {}].find((f) =>
      https(f.url),
    )
    const id = String(item.slug ?? item.id ?? '')
    if (!main || !small || !/^[\w-]{1,80}$/.test(id)) continue
    results.push({
      provider: 'klipy',
      id,
      url: https(main.url)!,
      preview: https(small.url)!,
      width: num(main.width) || 320,
      height: num(main.height) || 240,
      title: String(item.title ?? '').slice(0, 120),
    })
  }
  return { results, next: data.has_next === true }
}

/** GIPHY: `GET https://api.giphy.com/v1/gifs/search?api_key=…` (`data[].images`). */
function parseGiphy(
  body: unknown,
  offset: number,
  limit: number,
): { results: GifResult[]; next: boolean } {
  const root = obj(body)
  const list = Array.isArray(root.data) ? root.data : []
  const results: GifResult[] = []
  for (const raw of list) {
    const item = obj(raw)
    const images = obj(item.images)
    const main = [obj(images.fixed_width), obj(images.downsized), obj(images.original)].find((f) =>
      https(f.url),
    )
    const small = [
      obj(images.fixed_width_small),
      obj(images.fixed_width_downsampled),
      main ?? {},
    ].find((f) => https(f.url))
    const id = String(item.id ?? '')
    if (!main || !small || !/^[\w-]{1,80}$/.test(id)) continue
    results.push({
      provider: 'giphy',
      id,
      url: https(main.url)!,
      preview: https(small.url)!,
      width: num(main.width) || 320,
      height: num(main.height) || 240,
      title: String(item.title ?? '').slice(0, 120),
    })
  }
  const total = num(obj(root.pagination).total_count)
  return { results, next: offset + limit < total }
}

export type GifSearch =
  | { ok: true; results: GifResult[]; next: boolean; provider: GifProvider }
  | { ok: false; error: 'not-configured' | 'upstream' }

const PER_PAGE = 24

/** `query` vazio = em alta. `page` começa em 1. */
export async function searchGifs(query: string, page: number, locale: string): Promise<GifSearch> {
  const current = config
  if (!current) return { ok: false, error: 'not-configured' }
  const q = query.trim().slice(0, 80)
  const pt = locale.toLowerCase().startsWith('pt')
  try {
    let url: string
    if (current.provider === 'klipy') {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(PER_PAGE),
        customer_id: customerId,
        locale: pt ? 'br' : 'us',
        content_filter: 'medium',
      })
      if (q) params.set('q', q)
      url = `https://api.klipy.com/api/v1/${encodeURIComponent(current.key)}/gifs/${q ? 'search' : 'trending'}?${params}`
    } else {
      const params = new URLSearchParams({
        api_key: current.key,
        limit: String(PER_PAGE),
        offset: String((page - 1) * PER_PAGE),
        rating: 'pg-13',
        bundle: 'messaging_non_clips',
      })
      if (q) {
        params.set('q', q)
        params.set('lang', pt ? 'pt' : 'en')
      }
      url = `https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?${params}`
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) {
      console.warn(`[gifs] ${current.provider} respondeu ${response.status}`)
      return { ok: false, error: 'upstream' }
    }
    const body = (await response.json()) as unknown
    const parsed =
      current.provider === 'klipy'
        ? parseKlipy(body)
        : parseGiphy(body, (page - 1) * PER_PAGE, PER_PAGE)
    for (const gif of parsed.results) remember(gif)
    return { ok: true, ...parsed, provider: current.provider }
  } catch (error) {
    console.warn('[gifs] a busca falhou', error)
    return { ok: false, error: 'upstream' }
  }
}
