import { MUSIC_TOPIC } from '@sharescreen/shared'
import type { MusicState, MusicView } from '@sharescreen/shared'
import { headersFor } from './chat'

/**
 * Sala de música, do lado do pill (dono da conexão): o estado vem do servidor pelo tópico
 * MUSIC_TOPIC e por GET /music. O main repassa para a janela de chat e para o player.
 */
let view: MusicView = { state: null, access: null, identity: null }
/** Alguém pôs uma música na fila (o pill toca um som baixinho). */
let onQueued: (() => void) | null = null

export function setQueuedListener(listener: (() => void) | null): void {
  onQueued = listener
}

function publish(): void {
  window.platform.music.report(view)
}

function apply(next: MusicState): void {
  const before = view.state
  const me = view.identity
  if (before) {
    const known = new Set(before.queue.map((i) => i.id))
    if (before.current) known.add(before.current.id)
    const fresh = [...next.queue, ...(next.current ? [next.current] : [])].filter(
      (i) => !known.has(i.id) && i.addedById !== me,
    )
    if (fresh.length > 0) onQueued?.()
  }
  view = { ...view, state: next }
  publish()
}

export async function startMusic(
  serverUrl: string,
  token: string,
  password: string | null,
  identity: string,
): Promise<void> {
  view = { state: view.state, access: { serverUrl, token, password }, identity }
  publish()
  await refreshMusic()
}

export async function refreshMusic(): Promise<void> {
  const access = view.access
  if (!access) return
  try {
    const response = await fetch(`${access.serverUrl}/music`, {
      headers: headersFor(access.token, access.password),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok || view.access !== access) return
    // Estado inicial: sem som de "música nova" para o que já estava na fila.
    view = { ...view, state: (await response.json()) as MusicState }
    publish()
  } catch {
    /* tenta de novo na próxima reconexão */
  }
}

/** Dados do LiveKit: só vale o que veio do servidor. */
export function handleMusicData(payload: Uint8Array, topic?: string): boolean {
  if (topic !== MUSIC_TOPIC) return false
  try {
    const next = JSON.parse(new TextDecoder().decode(payload)) as MusicState
    if (Array.isArray(next.queue) && typeof next.serverNow === 'number') apply(next)
  } catch {
    /* ignora */
  }
  return true
}

export function endMusic(): void {
  view = { state: null, access: null, identity: null }
  publish()
}
