import { randomBytes } from 'node:crypto'
import type {
  MusicControl,
  MusicError,
  MusicItem,
  MusicMode,
  MusicNow,
  MusicState,
  SpotifyJam,
} from '@sharescreen/shared'
import { MUSIC_MAX_QUEUE } from '@sharescreen/shared'

/**
 * Sala de música da call. O servidor só guarda a fila e o relógio: cada pessoa toca o vídeo
 * no próprio player oficial do YouTube (IFrame Player API) e acerta a posição pelo relógio
 * daqui. Nenhum áudio passa pela call (ver docs/17-chat-music-sounds.md).
 */

const HISTORY = 15
/** Folga para todo mundo carregar o vídeo antes do segundo 0. */
const LEAD_MS = 1500

let queue: MusicItem[] = []
let current: MusicNow | null = null
let history: MusicItem[] = []
let mode: MusicMode = 'open'
let skipVotes: string[] = []
let jam: SpotifyJam | null = null
let people = 1

export function setPeopleCount(count: number): void {
  people = Math.max(1, count)
}

export function musicState(): MusicState {
  return {
    queue,
    current,
    history,
    mode,
    skipVotes,
    skipNeeded: Math.max(1, Math.ceil(people / 2)),
    jam,
    serverNow: Date.now(),
  }
}

// ───────────────────────── Links ─────────────────────────

const VIDEO_ID = /^[\w-]{11}$/

/** Id do vídeo de um link do YouTube (watch, youtu.be, shorts, music, embed, live). */
export function videoIdOf(link: string): string | null {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return VIDEO_ID.test(link.trim()) ? link.trim() : null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const match = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname)
      id = match?.[1] ?? null
    }
  }
  return id && VIDEO_ID.test(id) ? id : null
}

/**
 * Título, canal e capa pelo oEmbed público do YouTube (sem chave). Vídeo que não deixa
 * incorporar volta 401/403: não entra na fila, porque não tocaria no player de ninguém.
 */
async function describe(
  videoId: string,
): Promise<{ title: string; author: string; thumbnail: string } | MusicError> {
  const fallback = {
    title: 'YouTube',
    author: '',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
  try {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)
    const response = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`, {
      signal: AbortSignal.timeout(6000),
    })
    if (response.status === 401 || response.status === 403) return 'not-embeddable'
    if (response.status === 404 || response.status === 400) return 'not-found'
    if (!response.ok) return fallback
    const body = (await response.json()) as {
      title?: unknown
      author_name?: unknown
      thumbnail_url?: unknown
    }
    const thumb =
      typeof body.thumbnail_url === 'string' && body.thumbnail_url.startsWith('https://')
        ? body.thumbnail_url
        : fallback.thumbnail
    return {
      title: typeof body.title === 'string' ? body.title.slice(0, 200) : fallback.title,
      author: typeof body.author_name === 'string' ? body.author_name.slice(0, 100) : '',
      thumbnail: thumb,
    }
  } catch {
    // Sem internet no servidor: entra assim mesmo (quem tem internet consegue tocar).
    return fallback
  }
}

// ───────────────────────── Fila ─────────────────────────

/** A mais votada; empate = a que entrou primeiro. */
function pickNext(): MusicItem | null {
  if (queue.length === 0) return null
  return queue.reduce((best, item) =>
    item.votes.length > best.votes.length ||
    (item.votes.length === best.votes.length && item.addedAt < best.addedAt)
      ? item
      : best,
  )
}

function advance(): void {
  if (current) {
    const done: MusicItem = {
      id: current.id,
      videoId: current.videoId,
      title: current.title,
      author: current.author,
      thumbnail: current.thumbnail,
      addedBy: current.addedBy,
      addedById: current.addedById,
      addedAt: current.addedAt,
      votes: [],
    }
    history = [done, ...history].slice(0, HISTORY)
  }
  const next = pickNext()
  skipVotes = []
  if (!next) {
    current = null
    return
  }
  queue = queue.filter((item) => item !== next)
  current = { ...next, startedAt: Date.now() + LEAD_MS, pausedAt: null, duration: null }
}

export async function enqueue(
  link: string,
  who: { identity: string; name: string },
): Promise<MusicItem | MusicError> {
  const videoId = videoIdOf(link)
  if (!videoId) return 'bad-link'
  if (queue.length >= MUSIC_MAX_QUEUE) return 'queue-full'
  const info = await describe(videoId)
  if (typeof info === 'string') return info
  const item: MusicItem = {
    id: randomBytes(6).toString('base64url'),
    videoId,
    ...info,
    addedBy: who.name.slice(0, 32),
    addedById: who.identity,
    addedAt: Date.now(),
    votes: [],
  }
  queue = [...queue, item]
  if (!current) advance()
  return item
}

export function vote(itemId: string, identity: string): true | MusicError {
  const item = queue.find((i) => i.id === itemId)
  if (!item) return 'not-found'
  const votes = item.votes.includes(identity)
    ? item.votes.filter((v) => v !== identity)
    : [...item.votes, identity]
  queue = queue.map((i) => (i === item ? { ...i, votes } : i))
  return true
}

export function remove(itemId: string, identity: string, privileged: boolean): true | MusicError {
  const item = queue.find((i) => i.id === itemId)
  if (!item) return 'not-found'
  if (!privileged && item.addedById !== identity) return 'forbidden'
  queue = queue.filter((i) => i !== item)
  return true
}

export function setMode(next: MusicMode): void {
  mode = next
}

/** Pode tocar/pausar/arrastar: modo aberto, dono/admin ou quem pôs a música atual. */
function canControl(identity: string, privileged: boolean): boolean {
  return mode === 'open' || privileged || current?.addedById === identity
}

const positionAt = (now: number, c: MusicNow) => ((c.pausedAt ?? now) - c.startedAt) / 1000

export function control(
  command: MusicControl,
  identity: string,
  privileged: boolean,
): { skipped: boolean } | MusicError {
  if (!current) return command.action === 'skip' ? { skipped: false } : 'not-found'
  const now = Date.now()
  if (command.action === 'skip') {
    // Dono/admin e quem pôs a música pulam direto; os outros votam (metade da call).
    if (privileged || current.addedById === identity) {
      advance()
      return { skipped: true }
    }
    if (mode === 'dj') return 'forbidden'
    if (!skipVotes.includes(identity)) skipVotes = [...skipVotes, identity]
    if (skipVotes.length >= Math.max(1, Math.ceil(people / 2))) {
      advance()
      return { skipped: true }
    }
    return { skipped: false }
  }
  if (!canControl(identity, privileged)) return 'forbidden'
  if (command.action === 'pause' && current.pausedAt === null) {
    current = { ...current, pausedAt: now }
  } else if (command.action === 'play' && current.pausedAt !== null) {
    current = {
      ...current,
      startedAt: current.startedAt + (now - current.pausedAt),
      pausedAt: null,
    }
  } else if (command.action === 'seek') {
    const position = Math.max(0, Math.min(command.position, 24 * 3600))
    current = {
      ...current,
      startedAt: now - position * 1000,
      pausedAt: current.pausedAt === null ? null : now,
    }
  }
  return { skipped: false }
}

/**
 * Um player avisou que a música acabou (ou não toca). Só vale para a música atual e depois
 * de alguns segundos tocando: um player atrasado não pula a música seguinte.
 */
export function finished(itemId: string, failed: boolean): boolean {
  if (!current || current.id !== itemId) return false
  if (!failed && positionAt(Date.now(), current) < 5) return false
  advance()
  return true
}

const JAM_HOSTS = new Set(['open.spotify.com', 'spotify.link', 'spotify.app.link'])

/** Link de convite da Jam (o Accord só mostra o link; quem controla a Jam é o Spotify). */
export function setJam(link: string | null, who: { name: string }): true | MusicError {
  if (link === null) {
    jam = null
    return true
  }
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return 'bad-link'
  }
  if (url.protocol !== 'https:' || !JAM_HOSTS.has(url.hostname) || url.href.length > 300) {
    return 'bad-link'
  }
  jam = { url: url.href, by: who.name.slice(0, 32), at: Date.now() }
  return true
}

/** O primeiro player que carregou a música conta quanto ela dura (a barra de progresso usa). */
export function setDuration(itemId: string, seconds: number): boolean {
  if (!current || current.id !== itemId || current.duration !== null) return false
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 3600) return false
  current = { ...current, duration: Math.round(seconds) }
  return true
}

export function currentIsFrom(identity: string): boolean {
  return current?.addedById === identity
}

export function jamOwner(): string | null {
  return jam?.by ?? null
}
