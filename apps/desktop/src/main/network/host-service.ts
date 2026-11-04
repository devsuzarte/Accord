import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { DEFAULT_API_PORT, IpcChannel } from '@sharescreen/shared'
import type { HostAddress, HostState } from '@sharescreen/shared'
import { localInterfaces } from './interfaces'

const LOCAL_URL = `http://127.0.0.1:${DEFAULT_API_PORT}`
const exe = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name)

interface Command {
  file: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

/**
 * Hospedar pelo app: sobe o servidor do sharescreen (API + LiveKit) como processo filho.
 *
 *  - Instalado: usa o `accord-server` que vem dentro do app (resources/server/).
 *  - Desenvolvimento: roda a API do repositório com o Bun e o LiveKit de infra/bin/.
 *
 * Os dados do servidor (chaves, fotos) ficam em <dados do app>/servidor.
 * Fechar o app encerra o servidor que ele abriu.
 */
export class HostService {
  private child: ChildProcess | null = null
  private state: HostState = { status: 'stopped', url: LOCAL_URL, addresses: [], error: null }
  private stderrTail = ''
  /** O próprio app pediu para parar (a saída do processo não é erro). */
  private stopping = false

  getState(): HostState {
    return { ...this.state, addresses: this.addresses() }
  }

  /** Confere se já tem um servidor aberto neste PC (por fora do app). */
  async refresh(): Promise<HostState> {
    if (!this.child && this.state.status !== 'starting') {
      const running = await this.isUp()
      const status = running ? 'external' : this.command() ? 'stopped' : 'unavailable'
      if (status !== this.state.status) this.update({ status, error: null })
    }
    return this.getState()
  }

  async start(): Promise<void> {
    if (this.child || this.state.status === 'starting') return
    if (await this.isUp()) return this.update({ status: 'external', error: null })
    const command = this.command()
    if (!command) return this.update({ status: 'unavailable', error: null })

    this.update({ status: 'starting', error: null })
    console.info(`[hospedar] abrindo ${command.file} ${command.args.join(' ')}`)
    this.stderrTail = ''
    const child = spawn(command.file, command.args, {
      cwd: command.cwd,
      env: command.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    const log = (chunk: Buffer) => {
      const text = chunk.toString()
      this.stderrTail = (this.stderrTail + text).slice(-2000)
      for (const line of text.split(/\r?\n/)) if (line.trim()) console.info(`[servidor] ${line}`)
    }
    child.stdout?.on('data', log)
    child.stderr?.on('data', log)
    child.on('error', (error) => {
      console.error('[hospedar] não consegui abrir o servidor', error)
    })
    child.on('exit', (code) => {
      const wasRunning = this.state.status === 'running'
      this.child = null
      console.info(`[hospedar] servidor encerrou (código ${code})`)
      if (this.stopping) {
        this.stopping = false
        this.update({ status: 'stopped', error: null })
        return
      }
      const inUse = /EADDRINUSE|address already in use|port.*in use/i.test(this.stderrTail)
      if (wasRunning) console.warn('[hospedar] o servidor caiu durante a chamada')
      this.update({ status: 'error', error: inUse ? 'port-in-use' : 'crashed' })
    })

    // Espera a API responder (o LiveKit sobe junto em ~1 s).
    const deadline = Date.now() + 20_000
    while (this.child === child && Date.now() < deadline) {
      if (await this.isUp()) {
        this.update({ status: 'running', error: null })
        return
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    if (this.child === child) {
      this.stop()
      this.update({ status: 'error', error: 'timeout' })
    }
  }

  stop(): void {
    const child = this.child
    if (!child?.pid) return
    this.stopping = true
    try {
      if (process.platform === 'win32') {
        // Encerra a árvore toda (o servidor e o LiveKit que ele abriu).
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      } else {
        child.kill('SIGTERM')
      }
    } catch (error) {
      console.warn('[hospedar] falha ao encerrar o servidor', error)
    }
  }

  private async isUp(): Promise<boolean> {
    try {
      const response = await fetch(`${LOCAL_URL}/health`, { signal: AbortSignal.timeout(800) })
      return response.ok
    } catch {
      return false
    }
  }

  private addresses(): HostAddress[] {
    return localInterfaces().map((i) => ({ route: i.route, address: i.address }))
  }

  private command(): Command | null {
    const dataDir = join(app.getPath('userData'), 'servidor')
    mkdirSync(dataDir, { recursive: true })
    const env = { ...process.env, SHARESCREEN_DATA_DIR: dataDir, NODE_ENV: 'production' }
    if (app.isPackaged) {
      const dir = join(process.resourcesPath, 'server')
      const file = join(dir, exe('accord-server'))
      return existsSync(file) ? { file, args: [], cwd: dir, env } : null
    }
    const root = resolve(app.getAppPath(), '..', '..')
    const entry = join(root, 'apps', 'api', 'src', 'index.ts')
    const livekit = join(root, 'infra', 'bin', exe('livekit-server'))
    if (!existsSync(entry) || !existsSync(livekit)) return null
    return {
      file: exe('bun'),
      args: ['run', entry],
      cwd: join(root, 'apps', 'api'),
      env: { ...env, SHARESCREEN_LIVEKIT_BIN: livekit },
    }
  }

  private update(patch: Partial<HostState>): void {
    this.state = { ...this.state, ...patch }
    const state = this.getState()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannel.HostStateChanged, state)
    }
  }
}
