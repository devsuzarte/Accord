import { app, BrowserWindow, Notification } from 'electron'
import { IpcChannel } from '@sharescreen/shared'
import type { UpdateState } from '@sharescreen/shared'
import electronUpdater from 'electron-updater'
import { tm } from './i18n'

const { autoUpdater } = electronUpdater

const SIX_HOURS = 6 * 60 * 60 * 1000

/**
 * Atualização automática pelo GitHub Releases (devsuzarte/Accord).
 *
 * O app instalado lê o `latest.yml` da release mais nova, baixa o instalador em segundo
 * plano (só a diferença, pelo .blockmap) e instala ao sair — ou na hora, se a pessoa pedir.
 * Para publicar uma versão: aumentar a versão, `bun run package` e anexar à release os
 * arquivos Accord-Setup-X.exe, Accord-Setup-X.exe.blockmap e latest.yml (docs/12).
 */
export class Updater {
  private state: UpdateState = { status: 'disabled', version: null, progress: 0 }
  onReady: (() => void) | null = null

  constructor(enabled: boolean) {
    if (!enabled) return
    this.state = { status: 'idle', version: null, progress: 0 }
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = {
      info: (m: unknown) => console.info(`[update] ${String(m)}`),
      warn: (m: unknown) => console.warn(`[update] ${String(m)}`),
      error: (m: unknown) => console.warn(`[update] ${String(m)}`),
      debug: () => undefined,
    }
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'latest', version: null }))
    autoUpdater.on('update-available', (info) =>
      this.set({ status: 'downloading', version: info.version, progress: 0 }),
    )
    autoUpdater.on('download-progress', (p) =>
      this.set({ status: 'downloading', progress: Math.round(p.percent) }),
    )
    autoUpdater.on('update-downloaded', (info) => {
      this.set({ status: 'ready', version: info.version, progress: 100 })
      this.notify(info.version)
      this.onReady?.()
    })
    autoUpdater.on('error', (error) => {
      console.warn('[update] falhou', error)
      if (this.state.status !== 'ready') this.set({ status: 'error' })
    })

    setTimeout(() => this.check(), 15_000)
    setInterval(() => this.check(), SIX_HOURS)
  }

  getState(): UpdateState {
    return this.state
  }

  check(): void {
    if (this.state.status === 'disabled' || this.state.status === 'downloading') return
    if (this.state.status === 'ready') return
    autoUpdater.checkForUpdates().catch(() => undefined)
  }

  install(): void {
    if (this.state.status !== 'ready') return
    // isSilent=false (mostra o instalador), isForceRunAfter=true (abre o app de novo).
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }

  private notify(version: string): void {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: tm('update.notifyTitle', { version }),
      body: tm('update.notifyBody'),
    })
    n.on('click', () => this.install())
    n.show()
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.UpdateStateChanged, this.state)
    }
  }
}

/** Só no app instalado e no perfil principal (o --profile é para testes). */
export function updatesEnabled(profile: string | undefined): boolean {
  return app.isPackaged && !profile && process.platform === 'win32'
}
