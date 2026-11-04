import type { ChatEvent, SessionError } from '@sharescreen/shared'
import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_FILE_BYTES,
  CHAT_MAX_TEXT,
  CHAT_TOPIC,
  PASSWORD_HEADER,
} from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { DataPacket_Kind } from 'livekit-server-sdk'
import { ROOM, roomService, verifyToken } from '../services/livekit'
import { isLoopback } from '../services/roles'
import {
  addFile,
  addMessage,
  checkPassword,
  history,
  readAttachment,
  setPassword,
  snapshot,
} from '../services/session'

type Headers = Record<string, string | undefined>

/** Quem pede: token da chamada (Bearer) + senha do canal, se houver. */
async function caller(
  headers: Headers,
): Promise<{ identity: string; name: string } | { error: SessionError; status: number }> {
  const passwordError = checkPassword(headers[PASSWORD_HEADER])
  if (passwordError) return { error: passwordError, status: 401 }
  try {
    const token = headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
    const who = await verifyToken(token)
    if (who.viewer) return { error: 'invalid-session', status: 401 }
    return { identity: who.identity, name: who.name }
  } catch {
    return { error: 'invalid-session', status: 401 }
  }
}

async function avatarOf(identity: string): Promise<string | null> {
  try {
    const p = await roomService().getParticipant(ROOM, identity)
    return p.attributes?.avatar || null
  } catch {
    return null
  }
}

/** Manda a mensagem nova para todos na sala, pelos dados do LiveKit. */
async function broadcast(event: ChatEvent): Promise<void> {
  const data = new TextEncoder().encode(JSON.stringify(event))
  await roomService()
    .sendData(ROOM, data, DataPacket_Kind.RELIABLE, { topic: CHAT_TOPIC })
    .catch((error) => console.error('[chat] não consegui avisar a sala', error))
}

/**
 * Chat temporário + cópia da sessão para a migração de host.
 * Os anexos ficam em `/chat/files/<id>` (id aleatório e longo: só quem viu a mensagem sabe).
 */
export const sessionRoutes = new Elysia()
  .get('/chat/messages', async ({ headers, set }) => {
    const who = await caller(headers)
    if ('error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    return history()
  })
  .post(
    '/chat/messages',
    async ({ headers, body, set }) => {
      const who = await caller(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      const result = addMessage(
        { identity: who.identity, name: who.name, avatar: await avatarOf(who.identity) },
        body.text,
        body.attachments ?? [],
      )
      if (typeof result === 'string') {
        set.status = 400
        return { error: result }
      }
      await broadcast({ type: 'message', message: result })
      return result
    },
    {
      body: t.Object({
        text: t.String({ maxLength: CHAT_MAX_TEXT }),
        attachments: t.Optional(
          t.Array(t.String({ maxLength: 64 }), { maxItems: CHAT_MAX_ATTACHMENTS }),
        ),
      }),
    },
  )
  .post(
    '/chat/files',
    async ({ headers, request, set }) => {
      const who = await caller(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      const length = Number(headers['content-length'] ?? 0)
      if (length > CHAT_MAX_FILE_BYTES) {
        set.status = 413
        return { error: 'too-large' satisfies SessionError }
      }
      const bytes = new Uint8Array(await request.arrayBuffer())
      let name = 'arquivo'
      try {
        name = decodeURIComponent(headers['x-file-name'] ?? 'arquivo')
      } catch {
        /* nome padrão */
      }
      const result = addFile(name, headers['content-type'] ?? '', bytes)
      if (typeof result === 'string') {
        set.status = result === 'too-large' ? 413 : 507
        return { error: result }
      }
      return result
    },
    { parse: 'none' },
  )
  .get('/chat/files/:id', ({ params, set }) => {
    const found = readAttachment(params.id)
    if (!found) {
      set.status = 404
      return { error: 'not-found' satisfies SessionError }
    }
    const { attachment, bytes } = found
    return new Response(bytes, {
      headers: {
        'content-type': attachment.type,
        'content-disposition': `${attachment.image ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        'cache-control': 'private, max-age=86400',
        'x-content-type-options': 'nosniff',
      },
    })
  })
  // Cópia da sessão, para quem vem a seguir na fila continuar se o host cair.
  .get('/session/snapshot', async ({ headers, set }) => {
    const who = await caller(headers)
    if ('error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    return snapshot()
  })
  // Só o próprio PC do servidor troca a senha (o app de quem hospeda).
  .post(
    '/session/password',
    ({ body, request, server, set }) => {
      if (!isLoopback(server?.requestIP(request)?.address)) {
        set.status = 403
        return { error: 'invalid-session' satisfies SessionError }
      }
      setPassword(body.password)
      return { ok: true }
    },
    { body: t.Object({ password: t.Union([t.String({ maxLength: 64 }), t.Null()]) }) },
  )
