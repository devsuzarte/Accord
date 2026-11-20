import { CHAT_TOPIC, PASSWORD_HEADER } from '@sharescreen/shared'
import type { ChatEvent, ChatMessage, ChatState, CustomEmoji, GifStatus } from '@sharescreen/shared'

/**
 * Chat temporário do canal, do lado do pill (que é dono da conexão). As mensagens chegam
 * do servidor pelos dados do LiveKit (tópico CHAT_TOPIC) e o histórico vem de GET /chat/messages.
 * A janela de chat recebe tudo isto pelo main e envia mensagens direto ao servidor.
 */
const empty: ChatState = {
  messages: [],
  access: null,
  channelName: null,
  identity: null,
  emojis: [],
  gifs: { provider: null },
}
let state: ChatState = empty
const listeners = new Set<() => void>()
/** Alguém reagiu a uma mensagem sua (o pill toca um som). */
let onReactionToMe: (() => void) | null = null

export function setReactionListener(listener: (() => void) | null): void {
  onReactionToMe = listener
}

function publish(): void {
  window.platform.chat.report(state)
  for (const listener of listeners) listener()
}

export function chatMessages(): ChatMessage[] {
  return state.messages
}

/** Avisa quando chega mensagem (o pill usa para os sons e a migração para a cópia). */
export function onChatChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function headersFor(token: string, password: string | null): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (password) headers[PASSWORD_HEADER] = password
  return headers
}

/** Entrou num canal: guarda o acesso e baixa o histórico. Mantém as mensagens se for o mesmo chat continuando (migração). */
export async function startChat(
  serverUrl: string,
  token: string,
  password: string | null,
  identity: string,
  channelName: string | null,
): Promise<void> {
  state = { ...state, access: { serverUrl, token, password }, identity, channelName }
  publish()
  await Promise.all([refreshHistory(), refreshExtras()])
}

/** Emojis do servidor e se a busca de GIFs está ligada. */
async function refreshExtras(): Promise<void> {
  const access = state.access
  if (!access) return
  const headers = headersFor(access.token, access.password)
  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const response = await fetch(`${access.serverUrl}${path}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      })
      return response.ok ? ((await response.json()) as T) : null
    } catch {
      return null
    }
  }
  const [emojis, gifs] = await Promise.all([
    get<CustomEmoji[]>('/emojis'),
    get<GifStatus>('/gifs/status'),
  ])
  if (state.access !== access) return
  state = {
    ...state,
    emojis: Array.isArray(emojis) ? emojis : state.emojis,
    gifs: gifs && 'provider' in gifs ? gifs : { provider: null },
  }
  publish()
}

export async function refreshHistory(): Promise<void> {
  void refreshExtras()
  const access = state.access
  if (!access) return
  try {
    const response = await fetch(`${access.serverUrl}/chat/messages`, {
      headers: headersFor(access.token, access.password),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok || state.access !== access) return
    const history = (await response.json()) as ChatMessage[]
    merge(history)
  } catch {
    /* tenta de novo na próxima reconexão */
  }
}

function merge(incoming: ChatMessage[]): void {
  const byId = new Map(state.messages.map((m) => [m.id, m]))
  let changed = false
  for (const message of incoming) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message)
      changed = true
    }
  }
  if (!changed) return
  state = { ...state, messages: [...byId.values()].sort((a, b) => a.at - b.at) }
  publish()
}

/** Dados recebidos do LiveKit. Só vale o que veio do servidor (sem participante). */
export function handleChatData(
  payload: Uint8Array,
  fromParticipant: boolean,
  topic?: string,
): void {
  if (topic !== CHAT_TOPIC || fromParticipant) return
  try {
    const event = JSON.parse(new TextDecoder().decode(payload)) as ChatEvent
    if (event.type === 'message' && event.message?.id) merge([event.message])
    if (event.type === 'reactions' && typeof event.id === 'string') {
      applyReactions(event.id, event.reactions ?? {})
    }
    if (event.type === 'emojis' && Array.isArray(event.emojis)) {
      state = { ...state, emojis: event.emojis }
      publish()
    }
  } catch {
    /* ignora */
  }
}

function applyReactions(id: string, reactions: Record<string, string[]>): void {
  const target = state.messages.find((m) => m.id === id)
  if (!target) return
  const me = state.identity
  if (me && target.identity === me) {
    const before = new Set(Object.values(target.reactions ?? {}).flat())
    const added = Object.values(reactions)
      .flat()
      .some((who) => who !== me && !before.has(who))
    if (added) onReactionToMe?.()
  }
  state = {
    ...state,
    messages: state.messages.map((m) => (m.id === id ? { ...m, reactions } : m)),
  }
  publish()
}

/** Saiu de vez: o chat some (é temporário). */
export function endChat(): void {
  state = empty
  publish()
}

/** Migrando de host: o acesso antigo não vale mais, mas as mensagens ficam. */
export function suspendChat(): void {
  state = { ...state, access: null }
  publish()
}
