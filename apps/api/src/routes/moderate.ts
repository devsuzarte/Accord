import type { ModerationAction, ModerationError } from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { TrackSource } from 'livekit-server-sdk'
import { allowedSources, ROOM, roomService, verifyToken } from '../services/livekit'
import { blocksOf, roleOf, setBlocks, setRole } from '../services/roles'

const actions: ModerationAction[] = [
  'mute-mic',
  'unmute-mic',
  'mute-audio',
  'unmute-audio',
  'kick',
  'make-admin',
  'remove-admin',
]

/** Quem pode o quê: silenciar para todos e promover = dono; desconectar = dono ou admin. */
function allowed(action: ModerationAction, role: ReturnType<typeof roleOf>): boolean {
  if (action === 'kick') return role === 'owner' || role === 'admin'
  return role === 'owner'
}

/**
 * Erros voltam como código (`ModerationError`); o app mostra a frase no idioma da pessoa.
 *
 * Moderação. Quem pede se identifica com o próprio token da chamada (Authorization: Bearer).
 * "Silenciar para todos" tira a permissão de publicar o microfone (ou o som da transmissão):
 * a pessoa não consegue reativar até o dono liberar — como o "silenciar no servidor" do Discord.
 */
export const moderateRoutes = new Elysia().post(
  '/moderate',
  async ({ body, headers, set }) => {
    const bearer = headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
    let requester: { identity: string; room: string }
    try {
      requester = await verifyToken(bearer)
    } catch {
      set.status = 401
      return { error: 'invalid-session' satisfies ModerationError }
    }
    const action = body.action as ModerationAction
    if (!actions.includes(action)) {
      set.status = 400
      return { error: 'unknown-action' satisfies ModerationError }
    }
    const role = roleOf(requester.identity)
    if (!allowed(action, role)) {
      set.status = 403
      return { error: 'forbidden' satisfies ModerationError }
    }
    const target = body.target
    if (target === requester.identity && action !== 'unmute-mic' && action !== 'unmute-audio') {
      set.status = 400
      return { error: 'not-self' satisfies ModerationError }
    }
    if (roleOf(target) === 'owner' && action !== 'unmute-mic' && action !== 'unmute-audio') {
      set.status = 403
      return { error: 'owner-protected' satisfies ModerationError }
    }

    const rooms = roomService()
    try {
      if (action === 'kick') {
        await rooms.removeParticipant(ROOM, target)
        return { ok: true }
      }
      if (action === 'make-admin' || action === 'remove-admin') {
        const next = action === 'make-admin' ? 'admin' : 'member'
        setRole(target, next)
        await rooms.updateParticipant(ROOM, target, { attributes: { role: next } })
        return { ok: true }
      }

      const blocks = { ...blocksOf(target) }
      if (action === 'mute-mic') blocks.mic = true
      if (action === 'unmute-mic') blocks.mic = false
      if (action === 'mute-audio') blocks.audio = true
      if (action === 'unmute-audio') blocks.audio = false
      setBlocks(target, blocks)

      // Silencia na hora o que já está publicado e ajusta o que a pessoa pode publicar.
      if (blocks.mic || blocks.audio) {
        const info = await rooms.getParticipant(ROOM, target)
        for (const track of info.tracks) {
          const isMic = track.source === TrackSource.MICROPHONE
          const isShareAudio = track.source === TrackSource.SCREEN_SHARE_AUDIO
          if ((blocks.mic && isMic) || (blocks.audio && isShareAudio)) {
            await rooms.mutePublishedTrack(ROOM, target, track.sid, true)
          }
        }
      }
      await rooms.updateParticipant(ROOM, target, {
        permission: {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          canUpdateMetadata: true,
          canPublishSources: allowedSources(blocks),
        },
        attributes: {
          serverMic: blocks.mic ? 'blocked' : '',
          serverAudio: blocks.audio ? 'blocked' : '',
        },
      })
      return { ok: true }
    } catch (error) {
      console.error('[moderação] falhou', error)
      set.status = 502
      return { error: 'voice-unreachable' satisfies ModerationError }
    }
  },
  { body: t.Object({ action: t.String(), target: t.String({ maxLength: 128 }) }) },
)
