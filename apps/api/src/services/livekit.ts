import { RoomServiceClient, TokenVerifier, TrackSource } from 'livekit-server-sdk'
import { env } from '../env'

/** Sala única enquanto não há vários canais (M3). */
export const ROOM = 'geral'
export const CHANNEL_NAME = 'Geral'

// Criados sob demanda: no pacote do servidor as chaves só existem depois do LiveKit subir.
export function roomService(): RoomServiceClient {
  const httpUrl = env.livekit.url.replace(/^ws/, 'http')
  return new RoomServiceClient(httpUrl, env.livekit.apiKey, env.livekit.apiSecret)
}

/** Confere um token emitido por este servidor e devolve a identidade de quem o usa. */
export async function verifyToken(
  token: string,
): Promise<{ identity: string; room: string; name: string; viewer: boolean }> {
  const claims = await new TokenVerifier(env.livekit.apiKey, env.livekit.apiSecret).verify(token)
  if (!claims.sub || !claims.video?.room) throw new Error('Token sem identidade.')
  return {
    identity: claims.sub,
    room: claims.video.room,
    name: claims.name ?? claims.sub,
    viewer: claims.video.hidden === true,
  }
}

/** Fontes que cada participante pode publicar, conforme os bloqueios do dono. */
export function allowedSources(blocks: {
  mic: boolean
  audio: boolean
  camera: boolean
}): TrackSource[] {
  const sources = [TrackSource.SCREEN_SHARE]
  if (!blocks.mic) sources.push(TrackSource.MICROPHONE)
  if (!blocks.audio) sources.push(TrackSource.SCREEN_SHARE_AUDIO)
  if (!blocks.camera) sources.push(TrackSource.CAMERA)
  return sources
}
