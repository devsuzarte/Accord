import type { ChannelPerson, ServerInfo } from '@sharescreen/shared'
import { Elysia } from 'elysia'
import pkg from '../../package.json'
import { env } from '../env'
import { CHANNEL_NAME, ROOM, roomService } from '../services/livekit'

const serverId = crypto.randomUUID()

/** Quem está no canal agora (sem as conexões invisíveis de quem só assiste). */
async function peopleIn(room: string): Promise<ChannelPerson[]> {
  try {
    const participants = await roomService().listParticipants(room)
    return participants
      .filter((p) => !p.permission?.hidden && !p.identity.startsWith('viewer-'))
      .map((p) => ({ name: p.name || p.identity, avatar: p.attributes?.avatar || null }))
  } catch {
    // Sala ainda não existe (ninguém entrou) ou o LiveKit está subindo.
    return []
  }
}

/** Cartão de visita do servidor: o app usa na lista de canais encontrados. */
export const infoRoutes = new Elysia().get('/info', async (): Promise<ServerInfo> => ({
  id: serverId,
  name: env.serverName,
  version: pkg.version,
  port: env.port,
  channels: [{ id: ROOM, name: CHANNEL_NAME, people: await peopleIn(ROOM) }],
}))
