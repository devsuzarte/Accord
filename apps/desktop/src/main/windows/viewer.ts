import { BrowserWindow, nativeImage } from 'electron'
import iconPath from '../../../resources/icon.png?asset'
import { hardenNavigation, loadPage, secureWebPreferences } from './common'

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
