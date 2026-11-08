import type { StreamReport } from '@sharescreen/shared'
import { STREAM_REPORT_TOPIC } from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { DataPacket_Kind } from 'livekit-server-sdk'
import { callerOf } from '../services/auth'
import { ROOM, roomService } from '../services/livekit'
import { overLimit } from '../services/security'

/** Até 8 MB de bytes aleatórios (não comprimem), gerados uma vez. */
const SPEED_TEST_BYTES = 8 * 1024 * 1024
let speedTestPayload: Uint8Array | null = null

const diagnoses = [
  'ok',
  'streamerNetwork',
  'myLoss',
  'latency',
  'lowLayer',
  'economy',
  'lowFps',
  'freezes',
  'warming',
] as const

/**
 * Qualidade da transmissão e da rede, com o servidor no meio:
 * - `POST /stream-report`: quem assiste conta como está chegando. Vai SÓ para quem transmite
 *   (`destinationIdentities`), com o nome tirado do token, e no máximo 1 relato a cada 3 s.
 * - `GET /speedtest`: baixa alguns MB do servidor (mede a banda host → você);
 *   `POST /speedtest`: manda alguns MB para o servidor (mede você → host, o que importa para
 *   transmitir). Os dois aceitam no máximo 8 MB e um teste a cada 20 s por pessoa.
 */
export const streamRoutes = new Elysia()
  .post(
    '/stream-report',
    async ({ body, headers, set }) => {
      const who = await callerOf(headers, { allowViewer: true })
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      const person = who.viewer ? who.identity.replace(/^viewer-(.+)-[^-]+$/, '$1') : who.identity
      if (person === body.target) {
        set.status = 400
        return { error: 'bad-message' }
      }
      if (overLimit(`report:${person}:${body.target}`, 1, 3000)) {
        set.status = 429
        return { error: 'slow-down' }
      }
      const report: StreamReport = {
        type: 'report',
        target: body.target,
        viewer: person,
        from: who.name.slice(0, 32),
        level: body.level,
        diagnosis: body.diagnosis,
        fps: Math.max(0, Math.min(240, Math.round(body.fps))),
        height: Math.max(0, Math.min(4320, Math.round(body.height))),
      }
      await roomService()
        .sendData(ROOM, new TextEncoder().encode(JSON.stringify(report)), DataPacket_Kind.LOSSY, {
          topic: STREAM_REPORT_TOPIC,
          destinationIdentities: [body.target],
        })
        .catch(() => undefined)
      return { ok: true }
    },
    {
      body: t.Object({
        target: t.String({ maxLength: 128 }),
        level: t.Union([t.Literal('good'), t.Literal('fair'), t.Literal('bad')]),
        diagnosis: t.Union(diagnoses.map((d) => t.Literal(d))),
        fps: t.Number(),
        height: t.Number(),
      }),
    },
  )
  .get(
    '/speedtest',
    async ({ headers, query, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      // Um teste a cada 20 s por pessoa: não vira um jeito de gastar a banda do host.
      if (overLimit(`speedtest:${who.identity}`, 1, 20_000)) {
        set.status = 429
        return { error: 'slow-down' }
      }
      const size = Math.max(64 * 1024, Math.min(SPEED_TEST_BYTES, Number(query.bytes) || 0))
      if (!speedTestPayload) {
        speedTestPayload = new Uint8Array(SPEED_TEST_BYTES)
        for (let i = 0; i < SPEED_TEST_BYTES; i += 65536) {
          crypto.getRandomValues(speedTestPayload.subarray(i, i + 65536))
        }
      }
      return new Response(speedTestPayload.subarray(0, size), {
        headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
      })
    },
    { query: t.Object({ bytes: t.Optional(t.String({ maxLength: 12 })) }) },
  )
  .post(
    '/speedtest',
    async ({ headers, request, set }) => {
      const who = await callerOf(headers)
      if ('error' in who) {
        set.status = who.status
        return { error: who.error }
      }
      if (overLimit(`speedtest-up:${who.identity}`, 1, 20_000)) {
        set.status = 429
        return { error: 'slow-down' }
      }
      const started = performance.now()
      let received = 0
      const reader = request.body?.getReader()
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          received += value.byteLength
          if (received > SPEED_TEST_BYTES) {
            await reader.cancel().catch(() => undefined)
            break
          }
        }
      }
      return { bytes: received, ms: Math.round(performance.now() - started) }
    },
    { parse: 'none' },
  )
