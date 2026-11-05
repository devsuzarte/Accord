import { isPrivateIPv4 } from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { callerOf } from '../services/auth'
import { ROOM, roomService } from '../services/livekit'
import { ipOfIdentity, overLimit } from '../services/security'
import { nameTaken } from './join'

/**
 * O próprio participante muda nome, foto, "ensurdecido" e os endereços da fila de migração.
 * Passa pelo servidor (o token não deixa o cliente mexer nos próprios atributos): assim
 * ninguém se dá o papel de dono, nem anuncia um endereço de fora para a migração.
 */
export const meRoutes = new Elysia().post(
  '/me',
  async ({ body, headers, set }) => {
    const who = await callerOf(headers)
    if ('error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    if (overLimit(`me:${who.identity}`, 20, 60_000)) {
      set.status = 429
      return { error: 'slow-down' }
    }
    const attributes: Record<string, string> = {}
    if (body.avatar !== undefined) {
      if (
        body.avatar !== '' &&
        !/^\/avatars\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(body.avatar)
      ) {
        set.status = 400
        return { error: 'bad-message' }
      }
      attributes.avatar = body.avatar
    }
    if (body.deafened !== undefined) attributes.deafened = body.deafened ? '1' : '0'
    if (body.addrs !== undefined) {
      attributes.addrs = body.addrs.filter(isPrivateIPv4).slice(0, 8).join(',')
    }
    let name: string | undefined
    if (body.name !== undefined) {
      name = body.name.trim()
      const ip = ipOfIdentity(who.identity) ?? ''
      if (!name || (await nameTaken(name, ip, who.identity))) {
        set.status = 409
        return { error: 'name-taken' }
      }
    }
    try {
      await roomService().updateParticipant(ROOM, who.identity, {
        ...(name ? { name } : {}),
        ...(Object.keys(attributes).length ? { attributes } : {}),
      })
      return { ok: true }
    } catch {
      set.status = 502
      return { error: 'not-found' }
    }
  },
  {
    body: t.Object({
      name: t.Optional(t.String({ maxLength: 32 })),
      avatar: t.Optional(t.String({ maxLength: 64 })),
      deafened: t.Optional(t.Boolean()),
      addrs: t.Optional(t.Array(t.String({ maxLength: 15 }), { maxItems: 16 })),
    }),
  },
)
