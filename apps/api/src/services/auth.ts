import type { SessionError } from '@sharescreen/shared'
import { verifyToken } from './livekit'
import { isRevoked } from './security'

export interface Caller {
  identity: string
  name: string
  viewer: boolean
}

/**
 * Quem pede: o token da chamada (Authorization: Bearer), emitido por este servidor no /join.
 * A senha só é conferida no /join: o token já prova que a pessoa passou por ela.
 * Tokens de quem foi desconectado deixam de valer na hora.
 */
export async function callerOf(
  headers: Record<string, string | undefined>,
  options: { allowViewer?: boolean } = {},
): Promise<Caller | { error: SessionError; status: number }> {
  try {
    const token = headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
    const who = await verifyToken(token)
    if (isRevoked(who.identity)) return { error: 'invalid-session', status: 401 }
    if (who.viewer && !options.allowViewer) return { error: 'invalid-session', status: 401 }
    return { identity: who.identity, name: who.name, viewer: who.viewer }
  } catch {
    return { error: 'invalid-session', status: 401 }
  }
}
