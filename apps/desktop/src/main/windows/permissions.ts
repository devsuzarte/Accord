import { session } from 'electron'

/**
 * Permissões do navegador (microfone, tela, área de transferência…) só para as páginas do
 * próprio app. Nada navega para fora (`hardenNavigation`), então isto é uma segunda trava:
 * se um dia algo de fora carregar numa janela, não ganha câmera nem microfone.
 */
const ALLOWED = new Set([
  'media',
  'display-capture',
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
  'speaker-selection',
])

function isAppUrl(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return url.startsWith('file://') || (!!devUrl && url.startsWith(devUrl))
}

export function restrictPermissions(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isAppUrl(webContents.getURL()) && ALLOWED.has(permission))
  })
  ses.setPermissionCheckHandler((webContents, permission) => {
    if (!webContents) return ALLOWED.has(permission)
    return isAppUrl(webContents.getURL()) && ALLOWED.has(permission)
  })
}
