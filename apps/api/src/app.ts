import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { env } from './env'
import { healthRoutes } from './routes/health'
import { infoRoutes } from './routes/info'
import { avatarRoutes } from './routes/avatars'
import { joinRoutes } from './routes/join'
import { meRoutes } from './routes/me'
import { moderateRoutes } from './routes/moderate'
import { pointerRoutes } from './routes/pointer'
import { sessionRoutes } from './routes/session'
import { isLoopback } from './services/roles'
import { hostHeaderAllowed, isBanned } from './services/security'

/**
 * Montagem da aplicação. Contas e vários canais entram no M3 (docs/10-next-steps.md).
 *
 * CORS aberto: o app instalado chama a API a partir de file:// (origem "null") e de
 * outros PCs da rede. Não há cookies nem credenciais de navegador nesta API; o que dá poder
 * é o token da chamada e, para o dono, a chave do app de quem hospeda (services/security.ts).
 */
const base = new Elysia()
  .use(cors({ origin: true }))
  .onRequest(({ request, server }) => {
    const ip = server?.requestIP(request)?.address
    // DNS rebinding: um site no navegador de quem hospeda falando com 127.0.0.1 pelo domínio dele.
    if (isLoopback(ip) && !hostHeaderAllowed(request.headers.get('host'))) {
      return new Response('forbidden', { status: 403 })
    }
    // Desconectado pelo dono: 15 minutos sem conseguir entrar nem usar a API.
    if (isBanned(ip) && new URL(request.url).pathname !== '/health') {
      return Response.json({ error: 'banned' }, { status: 403 })
    }
  })
  .use(healthRoutes)
  .use(infoRoutes)

export const app = env.openJoin
  ? base
      .use(joinRoutes)
      .use(avatarRoutes)
      .use(meRoutes)
      .use(moderateRoutes)
      .use(pointerRoutes)
      .use(sessionRoutes)
  : base

export type App = typeof app
