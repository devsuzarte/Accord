import { DEFAULT_API_PORT, normalizeServerUrl } from './defaults'
import { INVITE_PREFIX } from './types'

/**
 * Convites por link. Dois formatos com o mesmo conteúdo:
 *  - `accord://join?h=26.1.2.3:7870&n=Sala&k=chave` — abre o app direto (registrado no Windows);
 *  - `https://devsuzarte.github.io/Accord/convite/#h=…` — clicável no WhatsApp/Discord; a página
 *    (GitHub Pages, grátis) só repassa para o `accord://`. Os dados vão depois do `#`, que o
 *    navegador não envia para servidor nenhum.
 *
 * O link leva a CHAVE de convite do servidor, nunca a senha: quem recebe entra sem saber a
 * senha, e o host invalida os links antigos gerando outra chave. Links da 0.3.0 (`p=senha`)
 * continuam sendo lidos.
 */
export const INVITE_SCHEME = 'accord'
export const INVITE_PAGE = 'https://devsuzarte.github.io/Accord/convite/'

export interface Invite {
  /** URL da API, pronta para entrar (`http://host:porta`). */
  serverUrl: string
  /** Nome do servidor, só para mostrar. */
  name: string
  /** Chave de convite (canal com senha). */
  key: string | null
  /** Só links antigos (0.3.0), que levavam a senha. */
  password: string | null
}

/** O que vai no cabeçalho da senha para entrar com este convite. */
export function inviteSecret(invite: Invite): string | null {
  if (invite.key) return `${INVITE_PREFIX}${invite.key}`
  return invite.password
}

const HOST =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{1,63})*)(?::\d{1,5})?$/i

function params(invite: Pick<Invite, 'serverUrl' | 'name' | 'key'>): string {
  const url = new URL(invite.serverUrl)
  const host = url.port === String(DEFAULT_API_PORT) ? url.hostname : url.host
  const q = new URLSearchParams({ h: host })
  if (invite.name) q.set('n', invite.name.slice(0, 48))
  if (invite.key) q.set('k', invite.key)
  return q.toString()
}

export function inviteLinks(invite: Pick<Invite, 'serverUrl' | 'name' | 'key'>): {
  app: string
  web: string
} {
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
    key: /^[\w-]{8,64}$/.test(q.get('k') ?? '') ? q.get('k') : null,
    password: q.get('p')?.slice(0, 64) || null,
  }
}
