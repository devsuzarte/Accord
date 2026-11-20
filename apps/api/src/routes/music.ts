import type { MusicError } from '@sharescreen/shared'
import { MUSIC_TOPIC } from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { DataPacket_Kind } from 'livekit-server-sdk'
import { callerOf } from '../services/auth'
import { ROOM, roomService } from '../services/livekit'
import {
  control,
  enqueue,
  finished,
  jamOwner,
  musicState,
  remove,
  setJam,
  setMode,
  setDuration,
  setPeopleCount,
  vote,
} from '../services/music'
import { roleOf } from '../services/roles'
import { overLimit } from '../services/security'

/** Atualiza quantas pessoas estão na call (para a votação de pular) e avisa todo mundo. */
async function publish(): Promise<void> {
  try {
    const list = await roomService().listParticipants(ROOM)
    setPeopleCount(list.filter((p) => !p.permission?.hidden).length)
  } catch {
    /* mantém a contagem anterior */
  }
  const data = new TextEncoder().encode(JSON.stringify(musicState()))
  await roomService()
    .sendData(ROOM, data, DataPacket_Kind.RELIABLE, { topic: MUSIC_TOPIC })
    .catch((error) => console.error('[música] não consegui avisar a sala', error))
}

const statusOf = (error: MusicError) =>
  error === 'forbidden'
    ? 403
    : error === 'not-found'
      ? 404
      : error === 'slow-down'
        ? 429
        : error === 'invalid-session'
          ? 401
          : 400

const privileged = (identity: string) => {
  const role = roleOf(identity)
  return role === 'owner' || role === 'admin'
}

/**
 * Sala de música: fila com votos, controles e o link da Jam do Spotify. O estado vai para
 * todos pelo tópico MUSIC_TOPIC; cada player acerta a posição pelo `serverNow`.
 */
export const musicRoutes = new Elysia()
  .get('/music', async ({ headers, set }) => {
    const who = await callerOf(headers)
    if ('error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    return musicState()
  })
  .post(
    '/music/queue',
    async ({ headers, body, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`music-add:${who.identity}`, 10, 60_000)) {
        set.status = 429
        return { error: 'slow-down' satisfies MusicError }
      }
      const result = await enqueue(body.url, who)
      if (typeof result === 'string') {
        set.status = statusOf(result)
        return { error: result }
      }
      await publish()
      return result
    },
    { body: t.Object({ url: t.String({ maxLength: 300 }) }) },
  )
  .post(
    '/music/vote',
    async ({ headers, body, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`music-vote:${who.identity}`, 30, 60_000)) {
        set.status = 429
        return { error: 'slow-down' satisfies MusicError }
      }
      const result = vote(body.id, who.identity)
      if (result !== true) {
        set.status = statusOf(result)
        return { error: result }
      }
      await publish()
      return { ok: true }
    },
    { body: t.Object({ id: t.String({ maxLength: 16 }) }) },
  )
  .post(
    '/music/remove',
    async ({ headers, body, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      const result = remove(body.id, who.identity, privileged(who.identity))
      if (result !== true) {
        set.status = statusOf(result)
        return { error: result }
      }
      await publish()
      return { ok: true }
    },
    { body: t.Object({ id: t.String({ maxLength: 16 }) }) },
  )
  .post(
    '/music/control',
    async ({ headers, body, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`music-control:${who.identity}`, 20, 10_000)) {
        set.status = 429
        return { error: 'slow-down' satisfies MusicError }
      }
      const command =
        body.action === 'seek'
          ? { action: 'seek' as const, position: body.position ?? 0 }
          : { action: body.action }
      const result = control(command, who.identity, privileged(who.identity))
      if (typeof result === 'string') {
        set.status = statusOf(result)
        return { error: result }
      }
      await publish()
      return result
    },
    {
      body: t.Object({
        action: t.Union([
          t.Literal('play'),
          t.Literal('pause'),
          t.Literal('seek'),
          t.Literal('skip'),
        ]),
        position: t.Optional(t.Number({ minimum: 0, maximum: 86_400 })),
      }),
    },
  )
  // Um player avisou que a música acabou (ou que o vídeo não toca).
  .post(
    '/music/ended',
    async ({ headers, body, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`music-ended:${who.identity}`, 6, 10_000)) {
        set.status = 429
        return { error: 'slow-down' satisfies MusicError }
      }
      if (finished(body.id, body.failed === true)) await publish()
      return { ok: true }
    },
    { body: t.Object({ id: t.String({ maxLength: 16 }), failed: t.Optional(t.Boolean()) }) },
  )
  .post(
    '/music/duration',
    async ({ headers, body, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (setDuration(body.id, body.seconds)) await publish()
      return { ok: true }
    },
    {
      body: t.Object({
        id: t.String({ maxLength: 16 }),
        seconds: t.Number({ minimum: 1, maximum: 86_400 }),
      }),
    },
  )
  .post(
    '/music/mode',
    async ({ headers, body, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (!privileged(who.identity)) {
        set.status = 403
        return { error: 'forbidden' satisfies MusicError }
      }
      setMode(body.mode)
      await publish()
      return { ok: true }
    },
    { body: t.Object({ mode: t.Union([t.Literal('open'), t.Literal('dj')]) }) },
  )
  .post(
    '/music/jam',
    async ({ headers, body, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`music-jam:${who.identity}`, 6, 60_000)) {
        set.status = 429
        return { error: 'slow-down' satisfies MusicError }
      }
      // Tirar o link: quem pôs, o dono ou um admin.
      const owner = jamOwner()
      if (body.url === null && owner && owner !== who.name && !privileged(who.identity)) {
        set.status = 403
        return { error: 'forbidden' satisfies MusicError }
      }
      const result = setJam(body.url, who)
      if (result !== true) {
        set.status = statusOf(result)
        return { error: result }
      }
      await publish()
      return { ok: true }
    },
    { body: t.Object({ url: t.Union([t.String({ maxLength: 300 }), t.Null()]) }) },
  )
