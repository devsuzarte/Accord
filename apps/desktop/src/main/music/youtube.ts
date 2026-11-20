import { INVITE_PAGE } from '@sharescreen/shared'
import { addHeaderRule } from '../network/request-headers'

/**
 * O YouTube exige que quem usa o player embutido se identifique pelo cabeçalho Referer
 * ("API Client Identity and Credentials", Required Minimum Functionality). Páginas abertas
 * de `file://` (o app instalado) não mandam Referer, e o player recusa tocar (erro 153).
 * Para o iframe do player, o app se identifica com o endereço do próprio site do Accord.
 * [Hypothesis] validar no app instalado (no desenvolvimento a página já é http://localhost).
 */
export const ACCORD_SITE = new URL('..', INVITE_PAGE).href

export function identifyToYouTube(): void {
  addHeaderRule(['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'], (details) => {
    if (details.resourceType !== 'subFrame') return null
    const has = Object.keys(details.requestHeaders).some((h) => h.toLowerCase() === 'referer')
    return has ? null : { Referer: ACCORD_SITE }
  })
}
