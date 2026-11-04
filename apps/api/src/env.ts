import { hostname } from 'node:os'
import { DEFAULT_API_PORT, DEFAULT_LIVEKIT_PORT } from '@sharescreen/shared'

/**
 * Configuração lida do ambiente (Bun carrega apps/api/.env automaticamente).
 * Sem nada configurado, funciona como no desenvolvimento: LiveKit local com as chaves
 * de dev. O pacote do servidor (managed-livekit.ts) troca as chaves por chaves próprias.
 */
const isProd = process.env.NODE_ENV === 'production'

function read(name: string, fallback: string): string {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

export const env = {
  isProd,
  host: read('API_HOST', '0.0.0.0'),
  port: Number(read('API_PORT', String(DEFAULT_API_PORT))),
  /** Nome mostrado na lista de canais de quem procura (padrão: nome do computador). */
  serverName: read('SERVER_NAME', hostname()).slice(0, 48),
  databasePath: read('DATABASE_PATH', './data/sharescreen.db'),
  /**
   * Entrada aberta (só com um nome) no canal "Geral". É o jeito de entrar enquanto não
   * existem contas (M3). OPEN_JOIN=false desliga.
   */
  openJoin: read('OPEN_JOIN', 'true') !== 'false',
  livekit: {
    url: read('LIVEKIT_URL', `ws://localhost:${DEFAULT_LIVEKIT_PORT}`),
    apiKey: read('LIVEKIT_API_KEY', 'devkey'),
    apiSecret: read('LIVEKIT_API_SECRET', 'secret'),
  },
}
