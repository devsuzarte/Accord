import { DEFAULT_API_PORT, normalizeServerUrl } from './defaults'

/**
 * Convites por link. Dois formatos com o mesmo conteúdo:
 *  - `accord://join?h=26.1.2.3:7870&n=Sala&p=senha` — abre o app direto (registrado no Windows);
 *  - `https://devsuzarte.github.io/Accord/convite/#h=…` — clicável no WhatsApp/Discord; a página
 *    (GitHub Pages, grátis) só repassa para o `accord://`. Os dados vão depois do `#`, que o
 *    navegador não envia para servidor nenhum.
 */
export const INVITE_SCHEME = 'accord'
export const INVITE_PAGE = 'https://devsuzarte.github.io/Accord/convite/'

export interface Invite {
  /** URL da API, pronta para entrar (`http://host:porta`). */
  serverUrl: string
  /** Nome do servidor, só para mostrar. */
  name: string
  password: string | null
}

const HOST =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{1,63})*)(?::\d{1,5})?$/i

function params(invite: Invite): string {
  const url = new URL(invite.serverUrl)
  const host = url.port === String(DEFAULT_API_PORT) ? url.hostname : url.host
  const q = new URLSearchParams({ h: host })
  if (invite.name) q.set('n', invite.name.slice(0, 48))
  if (invite.password) q.set('p', invite.password)
  return q.toString()
}

export function inviteLinks(invite: Invite): { app: string; web: string } {
  const q = params(invite)
  return { app: `${INVITE_SCHEME}://join?${q}`, web: `${INVITE_PAGE}#${q}` }
}

/** Lê um convite colado ou recebido (qualquer um dos dois formatos). `null` se não for convite. */
export function parseInvite(text: string): Invite | null {
  const raw = text.trim()
  let query: string | null = null
  if (raw.toLowerCase().startsWith(`${INVITE_SCHEME}://`)) {
    query = raw.slice(raw.indexOf('?') + 1)
    if (!raw.includes('?')) return null
  } else if (raw.startsWith(INVITE_PAGE) || /^https?:\/\/[^/]+\/Accord\/convite\/?#/i.test(raw)) {
    query = raw.slice(raw.indexOf('#') + 1)
  }
  if (query === null) return null
  const q = new URLSearchParams(query)
  const host = q.get('h')?.trim() ?? ''
  if (!HOST.test(host)) return null
  const port = Number(host.split(':')[1] ?? DEFAULT_API_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return {
    serverUrl: normalizeServerUrl(host),
    name: (q.get('n') ?? '').slice(0, 48),
    password: q.get('p')?.slice(0, 64) || null,
  }
}
