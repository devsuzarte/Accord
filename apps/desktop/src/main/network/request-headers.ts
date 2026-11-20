import { session } from 'electron'
import type { OnBeforeSendHeadersListenerDetails } from 'electron'

/**
 * O Electron só aceita UM `onBeforeSendHeaders` por sessão (registrar de novo troca o
 * anterior). Este módulo junta as regras de quem precisa mexer em cabeçalhos: a chave do app
 * de quem hospeda (pedidos ao próprio servidor) e a identificação do app no player do YouTube.
 */
interface Rule {
  patterns: RegExp[]
  urls: string[]
  apply(details: OnBeforeSendHeadersListenerDetails): Record<string, string> | null
}

const rules: Rule[] = []

const toRegExp = (glob: string) =>
  new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)

export function addHeaderRule(
  urls: string[],
  apply: (details: OnBeforeSendHeadersListenerDetails) => Record<string, string> | null,
): void {
  rules.push({ urls, patterns: urls.map(toRegExp), apply })
  const filter = { urls: rules.flatMap((rule) => rule.urls) }
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    let headers = details.requestHeaders
    for (const rule of rules) {
      if (!rule.patterns.some((p) => p.test(details.url))) continue
      const extra = rule.apply({ ...details, requestHeaders: headers })
      if (extra) headers = { ...headers, ...extra }
    }
    callback({ requestHeaders: headers })
  })
}
