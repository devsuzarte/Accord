import type { PointerPing } from '@sharescreen/shared'
import { POINTER_TOPIC } from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { DataPacket_Kind } from 'livekit-server-sdk'
import { callerOf } from '../services/auth'
import { ROOM, roomService } from '../services/livekit'
import { overLimit } from '../services/security'

/**
 * "Olha ali": quem assiste aponta um lugar na tela de quem transmite. Passa pelo servidor
 * para o nome de quem apontou ser o verdadeiro (do token) e para limitar a frequência:
 * ninguém consegue encher a tela do outro de marcadores.
 */
export const pointerRoutes = new Elysia().post(
  '/pointer',
  async ({ body, headers, set }) => {
    const who = await callerOf(headers, { allowViewer: true })
    if ('error' in who) {
      set.status = who.status
      return { error: who.error }
    }
    // Conexões de assistir são da mesma pessoa: o limite vale para ela toda.
    const person = who.viewer ? who.identity.replace(/^viewer-(.+)-[^-]+$/, '$1') : who.identity
    if (person === body.target) {
      set.status = 400
      return { error: 'bad-message' }
    }
    if (overLimit(`pointer:${person}`, 3, 1000) || overLimit(`pointer-min:${person}`, 40, 60_000)) {
      set.status = 429
      return { error: 'slow-down' }
    }
    const ping: PointerPing = {
      type: 'ping',
      id: crypto.randomUUID().slice(0, 8),
      target: body.target,
      x: Math.min(1, Math.max(0, body.x)),
      y: Math.min(1, Math.max(0, body.y)),
      from: who.name.slice(0, 32),
    }
    await roomService()
      .sendData(ROOM, new TextEncoder().encode(JSON.stringify(ping)), DataPacket_Kind.RELIABLE, {
        topic: POINTER_TOPIC,
      })
      .catch(() => undefined)
    return { ok: true }
  },
  {
    body: t.Object({
      target: t.String({ maxLength: 128 }),
      x: t.Number(),
      y: t.Number(),
    }),
  },
)
