/**
 * Portas padrão do sharescreen. Ficam juntas para facilitar a liberação no firewall:
 * 7870 (API, TCP) · 7880 (LiveKit sinalização, TCP) · 7881 (LiveKit ICE/TCP) · 7882 (LiveKit mídia, UDP).
 */
export const DEFAULT_API_PORT = 7870
export const DEFAULT_LIVEKIT_PORT = 7880
/**
 * Descoberta na rede (UDP): o app pergunta em broadcast "tem sharescreen aí?" e os servidores
 * respondem com a porta da API. Funciona na rede local e no Radmin VPN (que repassa broadcast).
 */
export const DEFAULT_DISCOVERY_PORT = 7871
export const DISCOVERY_QUESTION = 'sharescreen?v1'

/** Servidor usado quando o usuário não troca nada: a API no próprio computador. */
export const DEFAULT_SERVER_HOST = 'localhost'

/**
 * Aceita o que a pessoa digitar ("192.168.0.10", "26.1.2.3:7870", "http://meu-pc:9000")
 * e devolve a URL completa da API, usando a porta padrão quando nenhuma for informada.
 */
export function normalizeServerUrl(input: string): string {
  const raw = input.trim().replace(/\/+$/, '') || DEFAULT_SERVER_HOST
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  try {
    const url = new URL(withScheme)
    if (!url.port) url.port = String(DEFAULT_API_PORT)
    return url.origin
  } catch {
    return `http://${DEFAULT_SERVER_HOST}:${DEFAULT_API_PORT}`
  }
}

/** Servidor no próprio computador? */
export function isLocalServer(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

/** "http://192.168.0.10:7870" → "192.168.0.10"; com outra porta, "host:porta". */
export function shortServerAddress(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.port === String(DEFAULT_API_PORT) ? parsed.hostname : parsed.host
  } catch {
    return url
  }
}
