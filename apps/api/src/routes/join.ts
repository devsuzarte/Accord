import type { JoinResponse, SessionError } from '@sharescreen/shared'
import { PASSWORD_HEADER } from '@sharescreen/shared'
import { Elysia, t } from 'elysia'
import { AccessToken } from 'livekit-server-sdk'
import { env } from '../env'
import { callerOf } from '../services/auth'
import { allowedSources, CHANNEL_NAME, ROOM, roomService } from '../services/livekit'
import { blocksOf, rememberName, roleOf, setRole } from '../services/roles'
import {
  ipOfIdentity,
  isHostRequest,
  normalizeIp,
  overLimit,
  passwordFailed,
  passwordLocked,
  rememberIp,
} from '../services/security'
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
 * Já tem alguém com esse nome na call, vindo de outro PC? (Impede se passar por outra pessoa.)
 * Do mesmo PC é a mesma pessoa voltando (a conexão antiga pode ainda não ter saído).
 */
export async function nameTaken(name: string, ip: string, except?: string): Promise<boolean> {
  const wanted = name.trim().toLowerCase()
  try {
    const participants = await roomService().listParticipants(ROOM)
    return participants.some(
      (p) =>
        !p.permission?.hidden &&
        p.identity !== except &&
        (p.name || '').trim().toLowerCase() === wanted &&
        ipOfIdentity(p.identity) !== ip,
    )
  } catch {
    return false
  }
}

const err = (set: { status?: number | string }, status: number, error: SessionError) => {
  set.status = status
  return { error }
}

/**
 * Entrada aberta: qualquer pessoa que alcance o servidor entra no canal "Geral" só com
 * um nome (e a senha, se o canal tiver). OPEN_JOIN=false desliga.
 *
 * `viewer: true` gera o token invisível e só-assistir da janela de transmissão. Só sai para
 * quem já está na call (manda o próprio token): ninguém assiste escondido.
 *
 * Dono: quem entra pelo app de quem hospeda (mesmo PC + chave do app).
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
    const ip = normalizeIp(server?.requestIP(request)?.address ?? 'desconhecido')
    if (overLimit(`join:${ip}`, 20, 60_000)) return err(set, 429, 'too-many-attempts')
    const viewer = body.viewer === true

    let identity: string
    let name = body.name.trim()
    if (viewer) {
      const who = await callerOf(headers)
      if ('error' in who) return err(set, who.status, who.error)
      name = who.name
      identity = `viewer-${who.identity}-${crypto.randomUUID().slice(0, 6)}`
    } else {
      if (passwordLocked(ip)) return err(set, 429, 'too-many-attempts')
      const passwordError = checkPassword(headers[PASSWORD_HEADER])
      if (passwordError) {
        if (passwordError === 'wrong-password') passwordFailed(ip)
        return err(set, 401, passwordError)
      }
      if (!name) return err(set, 400, 'bad-message')
      if (await nameTaken(name, ip)) return err(set, 409, 'name-taken')
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'pessoa'
      identity = `${slug}-${crypto.randomUUID().slice(0, 8)}`
      rememberName(identity, name)
      rememberIp(identity, ip)
      if (isHostRequest(ip, headers)) setRole(identity, 'owner')
    }
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
      // Os atributos só mudam pelo servidor (POST /me), então ninguém se coloca de "dono".
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
            canPublishData: false,
            canUpdateOwnMetadata: false,
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
      name: t.String({ maxLength: 32 }),
      viewer: t.Optional(t.Boolean()),
      avatar: t.Optional(t.String({ maxLength: 64 })),
    }),
  },
)
