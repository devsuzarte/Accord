import type { ChatEvent, SessionError, SessionEvent } from '@sharescreen/shared'
import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_FILE_BYTES,
  CHAT_MAX_TEXT,
  CHAT_TOPIC,
  CUSTOM_EMOJI_MAX_BYTES,
  SESSION_TOPIC,
} from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { DataPacket_Kind } from 'livekit-server-sdk'
import { callerOf } from '../services/auth'
import { ROOM, roomService } from '../services/livekit'
import { addEmoji, listEmojis, readEmoji, removeEmoji } from '../services/emojis'
import { gifStatus, knownGif, searchGifs, setGifConfig } from '../services/gifs'
import { roleOf } from '../services/roles'
import { isHostRequest, overLimit } from '../services/security'
import {
  addFile,
  addMessage,
  currentInvite,
  hasPassword,
  history,
  readAttachment,
  rotateInvite,
  setPassword,
  snapshot,
  toggleReaction,
} from '../services/session'

const caller = (headers: Record<string, string | undefined>) => callerOf(headers)

/** Avisa todos na sala (fim da sessão, troca de host, convite novo). */
export async function announce(event: SessionEvent): Promise<void> {
  await roomService()
    .sendData(ROOM, new TextEncoder().encode(JSON.stringify(event)), DataPacket_Kind.RELIABLE, {
      topic: SESSION_TOPIC,
    })
    .catch((error) => console.error('[sessão] não consegui avisar a sala', error))
}

async function avatarOf(identity: string): Promise<string | null> {
  try {
    const p = await roomService().getParticipant(ROOM, identity)
    return p.attributes?.avatar || null
  } catch {
    return null
  }
}

/** Manda a mensagem nova (ou reação, ou lista de emojis) para todos, pelos dados do LiveKit. */
export async function broadcast(event: ChatEvent): Promise<void> {
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
      if (overLimit(`chat:${who.identity}`, 8, 10_000)) {
        set.status = 429
        return { error: 'slow-down' }
      }
      // GIF: só um que a busca deste servidor devolveu (o app manda o id, não o link).
      const gif = body.gif ? knownGif(body.gif.provider, body.gif.id) : null
      if (body.gif && !gif) {
        set.status = 400
        return { error: 'bad-message' satisfies SessionError }
      }
      const result = addMessage(
        { identity: who.identity, name: who.name, avatar: await avatarOf(who.identity) },
        body.text,
        body.attachments ?? [],
        { replyTo: body.replyTo ?? null, gif },
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
        replyTo: t.Optional(t.Union([t.String({ maxLength: 32 }), t.Null()])),
        gif: t.Optional(
          t.Union([
            t.Object({
              provider: t.Union([t.Literal('klipy'), t.Literal('giphy')]),
              id: t.String({ maxLength: 80 }),
            }),
            t.Null(),
          ]),
        ),
      }),
    },
  )
  // Reagir (ou tirar a reação) numa mensagem.
  .post(
    '/chat/react',
    async ({ headers, body, set }) => {
      const who = await caller(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`react:${who.identity}`, 20, 10_000)) {
        set.status = 429
        return { error: 'slow-down' satisfies SessionError }
      }
      const result = toggleReaction(body.id, body.emoji, who.identity)
      if (typeof result === 'string') {
        set.status = result === 'not-found' ? 404 : 400
        return { error: result }
      }
      await broadcast({ type: 'reactions', id: body.id, reactions: result })
      return { reactions: result }
    },
    { body: t.Object({ id: t.String({ maxLength: 32 }), emoji: t.String({ maxLength: 40 }) }) },
  )
  // Emojis personalizados do servidor (ficam guardados no PC de quem hospeda).
  .get('/emojis', async ({ headers, set }) => {
    const who = await caller(headers)
    if ('error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    return listEmojis()
  })
  .get('/emojis/:file', ({ params, set }) => {
    const found = readEmoji(params.file)
    if (!found) {
      set.status = 404
      return { error: 'not-found' satisfies SessionError }
    }
    return new Response(found.bytes, {
      headers: {
        'content-type': found.type,
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  })
  .post(
    '/emojis',
    async ({ headers, request, set }) => {
      const who = await caller(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`emoji:${who.identity}`, 10, 60_000)) {
        set.status = 429
        return { error: 'slow-down' satisfies SessionError }
      }
      if (Number(headers['content-length'] ?? 0) > CUSTOM_EMOJI_MAX_BYTES) {
        set.status = 413
        return { error: 'too-large' satisfies SessionError }
      }
      const bytes = new Uint8Array(await request.arrayBuffer())
      const result = addEmoji(headers['x-emoji-name'] ?? '', bytes, who.name)
      if (typeof result === 'string') {
        set.status = result === 'too-large' ? 413 : result === 'name-taken' ? 409 : 400
        return { error: result }
      }
      await broadcast({ type: 'emojis', emojis: listEmojis() })
      return result
    },
    { parse: 'none' },
  )
  .delete('/emojis/:name', async ({ headers, params, set }) => {
    const who = await caller(headers)
    if ('error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    const role = roleOf(who.identity)
    const result = removeEmoji(params.name, who.name, role === 'owner' || role === 'admin')
    if (result !== true) {
      set.status = result === 'not-found' ? 404 : 403
      return { error: result }
    }
    await broadcast({ type: 'emojis', emojis: listEmojis() })
    return { ok: true }
  })
  // Busca de GIFs (a chave do provedor fica só no servidor).
  .get('/gifs/status', async ({ headers, set }) => {
    const who = await caller(headers)
    if ('error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    return gifStatus()
  })
  .get(
    '/gifs/search',
    async ({ headers, query, set }) => {
      const who = await caller(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`gifs:${who.identity}`, 40, 60_000)) {
        set.status = 429
        return { error: 'slow-down' satisfies SessionError }
      }
      const page = Math.min(20, Math.max(1, Number(query.page) || 1))
      const result = await searchGifs(query.q ?? '', page, query.locale ?? 'pt-BR')
      if (!result.ok) {
        set.status = result.error === 'not-configured' ? 404 : 502
        return { error: result.error }
      }
      return result
    },
    {
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 80 })),
        page: t.Optional(t.String({ maxLength: 3 })),
        locale: t.Optional(t.String({ maxLength: 10 })),
      }),
    },
  )
  // Chave dos GIFs: só o app de quem hospeda (mesmo PC + chave do app).
  .post(
    '/gifs/config',
    ({ body, headers, request, server, set }) => {
      if (!isHostRequest(server?.requestIP(request)?.address, headers)) {
        set.status = 403
        return { error: 'forbidden' satisfies SessionError }
      }
      setGifConfig(body.config)
      return gifStatus()
    },
    {
      body: t.Object({
        config: t.Union([
          t.Object({
            provider: t.Union([t.Literal('klipy'), t.Literal('giphy')]),
            key: t.String({ maxLength: 200 }),
          }),
          t.Null(),
        ]),
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
      if (overLimit(`file:${who.identity}`, 12, 60_000)) {
        set.status = 429
        return { error: 'slow-down' }
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
        set.status = result === 'too-large' ? 413 : result === 'blocked-file' ? 415 : 507
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
  // Chave do link de convite (quem está na call pode convidar, sem precisar saber a senha).
  .get('/session/invite', async ({ headers, request, server, set }) => {
    const host = isHostRequest(server?.requestIP(request)?.address, headers)
    const who = host ? null : await caller(headers)
    if (who && 'error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    return { locked: hasPassword(), invite: currentInvite() }
  })
  // Daqui para baixo, só o app de quem hospeda (mesmo PC + chave do app).
  .post(
    '/session/password',
    async ({ body, headers, request, server, set }) => {
      if (!isHostRequest(server?.requestIP(request)?.address, headers)) {
        set.status = 403
        return { error: 'forbidden' satisfies SessionError }
      }
      setPassword(body.password)
      await announce({ type: 'invite-rotated' })
      return { ok: true, invite: currentInvite() }
    },
    { body: t.Object({ password: t.Union([t.String({ maxLength: 64 }), t.Null()]) }) },
  )
  .post('/session/invite/rotate', async ({ headers, request, server, set }) => {
    if (!isHostRequest(server?.requestIP(request)?.address, headers)) {
      set.status = 403
      return { error: 'forbidden' satisfies SessionError }
    }
    const invite = rotateInvite()
    await announce({ type: 'invite-rotated' })
    return { invite }
  })
  /**
   * Parar de hospedar. `end`: todos saem na hora (a sala é apagada). `handoff`: avisa que o host
   * vai sair, para o primeiro da fila assumir sem esperar a conexão cair; o app de quem hospeda
   * fecha o servidor logo depois.
   */
  .post(
    '/session/end',
    async ({ body, headers, request, server, set }) => {
      if (!isHostRequest(server?.requestIP(request)?.address, headers)) {
        set.status = 403
        return { error: 'forbidden' satisfies SessionError }
      }
      if (body.mode === 'handoff') {
        await announce({ type: 'handoff' })
        return { ok: true }
      }
      await announce({ type: 'ended' })
      await roomService()
        .deleteRoom(ROOM)
        .catch(() => undefined)
      return { ok: true }
    },
    { body: t.Object({ mode: t.Union([t.Literal('end'), t.Literal('handoff')]) }) },
  )
