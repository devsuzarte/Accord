import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { DEFAULT_API_PORT, HOST_KEY_HEADER, IpcChannel } from '@sharescreen/shared'
import type { HostAddress, HostStartOptions, HostState, HostStopMode } from '@sharescreen/shared'
import type { SessionMirror } from './session-mirror'
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
  private state: HostState = {
    status: 'stopped',
    url: LOCAL_URL,
    addresses: [],
    error: null,
    locked: false,
    invite: null,
  }

  /**
   * Chave aleatória que o app passa ao servidor que ele abre. Os pedidos do próprio app para
   * 127.0.0.1 levam a chave (injetada abaixo); um site aberto no navegador não tem como.
   */
  private readonly hostKey = randomBytes(24).toString('base64url')

  constructor(private readonly mirror: SessionMirror) {
    const filter = {
      urls: [`http://127.0.0.1:${DEFAULT_API_PORT}/*`, `http://localhost:${DEFAULT_API_PORT}/*`],
    }
    session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      callback({ requestHeaders: { ...details.requestHeaders, [HOST_KEY_HEADER]: this.hostKey } })
    })
  }

  private hostHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { ...extra, [HOST_KEY_HEADER]: this.hostKey }
  }
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
      const locked = running ? await this.isLocked() : false
      if (status !== this.state.status || locked !== this.state.locked) {
        this.update({ status, error: null, locked })
      }
    }
    return this.getState()
  }

  async start(options: HostStartOptions = {}): Promise<HostState> {
    await this.run(options)
    return this.getState()
  }

  /** Troca a senha do servidor aberto aqui (só o próprio PC pode). */
  async setPassword(password: string | null): Promise<boolean> {
    try {
      const response = await fetch(`${LOCAL_URL}/session/password`, {
        method: 'POST',
        headers: this.hostHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(3000),
      })
      if (!response.ok) return false
      const body = (await response.json().catch(() => ({}))) as { invite?: string | null }
      this.update({ locked: !!password, invite: body.invite ?? null })
      return true
    } catch {
      return false
    }
  }

  /** Link novo: os convites que já foram mandados param de funcionar. */
  async rotateInvite(): Promise<HostState> {
    try {
      const response = await fetch(`${LOCAL_URL}/session/invite/rotate`, {
        method: 'POST',
        headers: this.hostHeaders(),
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        const body = (await response.json()) as { invite?: string | null }
        this.update({ invite: body.invite ?? null })
      }
    } catch {
      /* fica a chave de antes */
    }
    return this.getState()
  }

  private async fetchInvite(): Promise<string | null> {
    try {
      const response = await fetch(`${LOCAL_URL}/session/invite`, {
        headers: this.hostHeaders(),
        signal: AbortSignal.timeout(1500),
      })
      if (!response.ok) return null
      return ((await response.json()) as { invite?: string | null }).invite ?? null
    } catch {
      return null
    }
  }

  private async run(options: HostStartOptions): Promise<void> {
    if (this.child || this.state.status === 'starting') return
    if (await this.isUp()) return this.update({ status: 'external', error: null })
    const command = this.command()
    if (!command) return this.update({ status: 'unavailable', error: null })
    const password = options.password?.trim() || ''
    if (password) command.env.SHARESCREEN_PASSWORD = password
    command.env.SHARESCREEN_HOST_KEY = this.hostKey
    if (options.restore && this.mirror.hasCopy()) {
      // Migração: o servidor novo continua a sessão a partir da cópia deste PC.
      this.mirror.pause()
      command.env.SHARESCREEN_RESTORE = this.mirror.dir
      console.info('[hospedar] continuando a sessão do host anterior')
    }

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
        this.update({ status: 'stopped', error: null, locked: false, invite: null })
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
        this.update({
          status: 'running',
          error: null,
          locked: await this.isLocked(),
          invite: await this.fetchInvite(),
        })
        return
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    if (this.child === child) {
      this.kill()
      this.update({ status: 'error', error: 'timeout' })
    }
  }

  /**
   * Parar de hospedar. `end` (padrão): o servidor apaga a sala antes de fechar, então todo mundo
   * sai na hora com o aviso "o host encerrou", sem ficar tentando reconectar. `handoff`: avisa
   * a sala que o host vai sair e espera um pouco para o primeiro da fila puxar a cópia da sessão.
   */
  async stop(mode: HostStopMode = 'end'): Promise<void> {
    const child = this.child
    if (!child?.pid) return
    try {
      await fetch(`${LOCAL_URL}/session/end`, {
        method: 'POST',
        headers: this.hostHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ mode }),
        signal: AbortSignal.timeout(2000),
      })
      await new Promise((r) => setTimeout(r, mode === 'handoff' ? 2500 : 400))
    } catch {
      // O servidor já não respondia: fecha assim mesmo.
    }
    this.kill()
  }

  /** Fecha o processo na hora (saída do app ou servidor que não abriu). */
  kill(): void {
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

  private async isLocked(): Promise<boolean> {
    try {
      const response = await fetch(`${LOCAL_URL}/info`, { signal: AbortSignal.timeout(1500) })
      return ((await response.json()) as { locked?: boolean }).locked === true
    } catch {
      return false
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
