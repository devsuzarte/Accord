import { join } from 'node:path'
import { shell } from 'electron'
import type { BrowserWindow, BrowserWindowConstructorOptions, WebPreferences } from 'electron'

export type Page = 'pill' | 'panel' | 'picker' | 'people' | 'chat' | 'viewer'

/** Preferências de segurança obrigatórias (docs/02-arquitetura.md › Segurança Electron). */
export function secureWebPreferences(extra: WebPreferences = {}): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    ...extra,
  }
}

/**
 * Base das superfícies do overlay (pill e painel).
 * Estudo: docs/09-estudo-overlay-opencluely.md §1.2 — janela que "não parece janela".
 */
export const overlaySurfaceOptions: BrowserWindowConstructorOptions = {
  show: false,
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  hasShadow: false, // a sombra é desenhada no CSS
  thickFrame: false, // Windows: sem sombra/animação do sistema
  resizable: false, // tamanho só por código (segue o conteúdo)
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  title: 'Accord',
}

export function loadPage(win: BrowserWindow, page: Page): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(`${devUrl}/${page}/index.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
  }
}

/** Links externos abrem no navegador do sistema; nada navega dentro do app. */
export function hardenNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (!devUrl || !url.startsWith(devUrl)) event.preventDefault()
  })
}

/**
 * Mantém a janela acima de tudo, inclusive da barra de tarefas.
 * Nível 'screen-saver' (≥ 'pop-up-menu' fica acima da taskbar no Windows).
 * Reforço só por evento — sem setInterval (diferente do OpenCluely, §2 item 7).
 */
export function keepOnTop(win: BrowserWindow): void {
  const apply = () => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver')
  }
  apply()
  win.on('show', apply)
  win.on('blur', apply)
  win.on('always-on-top-changed', (_event, isOnTop) => {
    if (!isOnTop) apply()
  })
}

/** Overlay nunca minimiza (§1.2). */
export function preventMinimize(win: BrowserWindow): void {
  win.on('minimize', () => win.restore())
}
