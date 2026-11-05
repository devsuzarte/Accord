import { PASSWORD_HEADER } from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { MAX_AVATAR_BYTES, readAvatar, saveAvatar } from '../services/avatars'
import { normalizeIp, overLimit, passwordFailed, passwordLocked } from '../services/security'
import { checkPassword } from '../services/session'

/** Fotos de perfil: o app envia ao entrar (ou ao trocar), os outros baixam pelo caminho. */
export const avatarRoutes = new Elysia()
  .post(
    '/avatar',
    ({ body, headers, request, server, set }) => {
      const ip = normalizeIp(server?.requestIP(request)?.address ?? 'desconhecido')
      if (overLimit(`avatar:${ip}`, 12, 60_000) || passwordLocked(ip)) {
        set.status = 429
        return { error: 'too-many-attempts' }
      }
      const passwordError = checkPassword(headers[PASSWORD_HEADER])
      if (passwordError) {
        if (passwordError === 'wrong-password') passwordFailed(ip)
        set.status = 401
        return { error: passwordError }
      }
      try {
        return { path: saveAvatar(body.data) }
      } catch (error) {
        set.status = 400
        return { error: error instanceof Error ? error.message : 'Imagem inválida.' }
      }
    },
    { body: t.Object({ data: t.String({ maxLength: Math.ceil(MAX_AVATAR_BYTES * 1.4) + 100 }) }) },
  )
  .get('/avatars/:file', ({ params, set }) => {
    const avatar = readAvatar(params.file)
    if (!avatar) {
      set.status = 404
      return 'not found'
    }
    set.headers['content-type'] = avatar.type
    set.headers['x-content-type-options'] = 'nosniff'
    // O nome do arquivo é o hash do conteúdo: pode ficar em cache para sempre.
    set.headers['cache-control'] = 'public, max-age=31536000, immutable'
    return new Response(avatar.bytes, { headers: set.headers as Record<string, string> })
  })
