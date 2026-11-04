import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { env } from './env'
import { healthRoutes } from './routes/health'
import { infoRoutes } from './routes/info'
import { avatarRoutes } from './routes/avatars'
import { joinRoutes } from './routes/join'
import { moderateRoutes } from './routes/moderate'

/**
 * Montagem da aplicação. Contas, vários canais e convites entram no M3/M4
 * (docs/10-proximos-passos.md).
 *
 * CORS aberto: o app instalado chama a API a partir de file:// (origem "null") e de
 * outros PCs da rede. Não há cookies nem credenciais nesta API.
 */
const base = new Elysia()
  .use(cors({ origin: true }))
  .use(healthRoutes)
  .use(infoRoutes)

export const app = env.openJoin ? base.use(joinRoutes).use(avatarRoutes).use(moderateRoutes) : base

export type App = typeof app
