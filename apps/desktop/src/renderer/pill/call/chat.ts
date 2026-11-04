import { CHAT_TOPIC, PASSWORD_HEADER } from '@sharescreen/shared'
import type { ChatEvent, ChatMessage, ChatState } from '@sharescreen/shared'

/**
 * Chat temporário do canal, do lado do pill (que é dono da conexão). As mensagens chegam
 * do servidor pelos dados do LiveKit (tópico CHAT_TOPIC) e o histórico vem de GET /chat/messages.
 * A janela de chat recebe tudo isto pelo main e envia mensagens direto ao servidor.
 */
let state: ChatState = { messages: [], access: null, channelName: null, identity: null }
const listeners = new Set<() => void>()

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
  await refreshHistory()
}

export async function refreshHistory(): Promise<void> {
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
  } catch {
    /* ignora */
  }
}

/** Saiu de vez: o chat some (é temporário). */
export function endChat(): void {
  state = { messages: [], access: null, channelName: null, identity: null }
  publish()
}

/** Migrando de host: o acesso antigo não vale mais, mas as mensagens ficam. */
export function suspendChat(): void {
  state = { ...state, access: null }
  publish()
}
