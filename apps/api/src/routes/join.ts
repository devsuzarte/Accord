import type { JoinResponse, SessionError } from '@sharescreen/shared'
import { PASSWORD_HEADER } from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { AccessToken } from 'livekit-server-sdk'
import { env } from '../env'
import { allowedSources, CHANNEL_NAME, ROOM } from '../services/livekit'
import { blocksOf, isLoopback, rememberName, roleOf, setRole } from '../services/roles'
import { checkPassword } from '../services/session'

/**
 * Se o LIVEKIT_URL aponta para localhost, devolve o mesmo host que o cliente usou para
 * chegar na API. Assim um segundo PC na rede (ou no Radmin/Tailscale) recebe o IP do host,
 * e não "localhost", que seria ele mesmo.
 */
function livekitUrlFor(request: Request): string {
  const configured = new URL(env.livekit.url)
  if (configured.hostname === 'localhost' || configured.hostname === '127.0.0.1') {
    configured.hostname = new URL(request.url).hostname
  }
  return configured.toString().replace(/\/$/, '')
}

/**
 * Entrada aberta: qualquer pessoa que alcance o servidor entra no canal "Geral" só com
 * um nome. É o modelo de "sala de amigos" enquanto contas não existem (M3); OPEN_JOIN=false
 * desliga. `viewer: true` gera o token invisível e só-assistir da janela de transmissão.
 *
 * Quem entra pelo próprio computador do servidor vira "dono" (owner).
 */
export const joinRoutes = new Elysia().post(
  '/join',
  async ({
    body,
    headers,
    request,
    server,
    set,
  }): Promise<JoinResponse | { error: SessionError }> => {
    const passwordError = checkPassword(headers[PASSWORD_HEADER])
    if (passwordError) {
      set.status = 401
      return { error: passwordError }
    }
    const name = body.name.trim()
    const viewer = body.viewer === true
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'pessoa'
    const identity = `${viewer ? 'viewer-' : ''}${slug}-${crypto.randomUUID().slice(0, 8)}`

    const address = server?.requestIP(request)?.address
    if (!viewer) rememberName(identity, name)
    if (!viewer && isLoopback(address)) setRole(identity, 'owner')
    const role = roleOf(identity)

    const avatar =
      body.avatar && /^\/avatars\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(body.avatar)
        ? body.avatar
        : ''

    const token = new AccessToken(env.livekit.apiKey, env.livekit.apiSecret, {
      identity,
      name,
      ttl: '6h',
      // Só para a interface mostrar; a autorização usa o mapa de papéis do servidor.
      attributes: viewer
        ? {}
        : {
            role,
            ...(avatar ? { avatar } : {}),
            ...(blocksOf(identity).mic ? { serverMic: 'blocked' } : {}),
            ...(blocksOf(identity).audio ? { serverAudio: 'blocked' } : {}),
          },
    })
    token.addGrant(
      viewer
        ? {
            // Janela de assistir: conexão separada, invisível para os outros e só recebe.
            room: ROOM,
            roomJoin: true,
            hidden: true,
            canPublish: false,
            canPublishData: false,
            canSubscribe: true,
          }
        : {
            room: ROOM,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            // Nome, foto e "ensurdecido" são atualizados pelo próprio cliente.
            canUpdateOwnMetadata: true,
            canPublishSources: allowedSources(blocksOf(identity)),
          },
    )

    return {
      livekitUrl: livekitUrlFor(request),
      token: await token.toJwt(),
      identity,
      channelName: CHANNEL_NAME,
      role,
    }
  },
  {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 32 }),
      viewer: t.Optional(t.Boolean()),
      avatar: t.Optional(t.String({ maxLength: 64 })),
    }),
  },
)
