import { BrowserWindow, nativeImage, screen } from 'electron'
import iconPath from '../../../resources/icon.png?asset'
import { hardenNavigation, keepOnTop, loadPage, secureWebPreferences } from './common'

/**
 * Janela de assistir transmissão — criada sob demanda pelo ViewerManager.
 * Janela normal: NÃO tem content protection (o usuário pode querer compartilhá-la).
 */
export function createViewerWindow(title: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title,
    icon: nativeImage.createFromPath(iconPath),
    minWidth: 480,
    minHeight: 300,
    webPreferences: secureWebPreferences(),
  })
  win.once('ready-to-show', () => win.show())
  // O título vem do main (nome de quem transmite), não do <title> da página.
  win.on('page-title-updated', (event) => event.preventDefault())
  hardenNavigation(win)
  loadPage(win, 'viewer')
  return win
}

/** Larguras da miniatura (16:9). */
export const MINI_WIDTHS = [320, 480, 640]
const MARGIN = 16

/**
 * Miniatura sobre o jogo: sem moldura, sempre no topo, fora da barra de tarefas e sem pegar o
 * foco (clicar nela não tira o jogo de primeiro plano). Content protection: se você também
 * transmitir a sua tela, a transmissão do amigo não vai junto.
 */
export function createMiniViewerWindow(
  title: string,
  near: Electron.Rectangle | null,
): BrowserWindow {
  const display = near ? screen.getDisplayMatching(near) : screen.getPrimaryDisplay()
  const wa = display.workArea
  const width = MINI_WIDTHS[1]!
  const height = Math.round((width * 9) / 16)
  const win = new BrowserWindow({
    x: wa.x + wa.width - width - MARGIN,
    y: wa.y + wa.height - height - MARGIN,
    width,
    height,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: true,
    backgroundColor: '#000000',
    title,
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: secureWebPreferences(),
  })
  win.setContentProtection(true)
  keepOnTop(win)
  win.once('ready-to-show', () => win.showInactive())
  win.on('page-title-updated', (event) => event.preventDefault())
  hardenNavigation(win)
  loadPage(win, 'viewer')
  return win
}
