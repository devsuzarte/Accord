import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { PASSWORD_HEADER } from '@sharescreen/shared'
import type { ChatMessage, SessionMirrorRequest, SessionSnapshot } from '@sharescreen/shared'

const EVERY_MS = 10_000

/**
 * Cópia local da sessão (senha, chat, anexos, silêncios do dono), atualizada a cada 10 s.
 * Serve para a migração de host: se quem hospeda cair, o primeiro da fila abre o próprio
 * servidor a partir desta cópia e a conversa continua de onde parou.
 *
 * Fica em <dados do app>/sessao-copia e é apagada quando a pessoa sai da chamada.
 */
export class SessionMirror {
  private request: SessionMirrorRequest | null = null
  private timer: NodeJS.Timeout | null = null
  private busy = false
  readonly dir = join(app.getPath('userData'), 'sessao-copia')

  set(request: SessionMirrorRequest | null): void {
    const changedServer = request?.serverUrl !== this.request?.serverUrl
    this.request = request
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (!request) return
    if (changedServer) this.clear()
    void this.pull()
    this.timer = setInterval(() => void this.pull(), EVERY_MS)
  }

  /** Para de copiar (sem apagar): usado logo antes de abrir o servidor com a cópia. */
  pause(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.request = null
  }

  clear(): void {
    rmSync(this.dir, { recursive: true, force: true })
  }

  hasCopy(): boolean {
    return existsSync(join(this.dir, 'snapshot.json'))
  }

  /** Junta mensagens que chegaram depois da última cópia (as do pill estão sempre em dia). */
  saveMessages(messages: ChatMessage[]): void {
    const file = join(this.dir, 'snapshot.json')
    if (!existsSync(file)) return
    try {
      const snapshot = JSON.parse(readFileSync(file, 'utf8')) as SessionSnapshot
      const known = new Set(snapshot.messages.map((m) => m.id))
      for (const message of messages) if (!known.has(message.id)) snapshot.messages.push(message)
      snapshot.messages.sort((a, b) => a.at - b.at)
      writeFileSync(file, JSON.stringify(snapshot))
    } catch (error) {
      console.warn('[sessão] não consegui juntar as últimas mensagens', error)
    }
  }

  private async pull(): Promise<void> {
    const request = this.request
    if (!request || this.busy) return
    this.busy = true
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${request.token}` }
      if (request.password) headers[PASSWORD_HEADER] = request.password
      const response = await fetch(`${request.serverUrl}/session/snapshot`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok || this.request !== request) return
      const snapshot = (await response.json()) as SessionSnapshot
      const filesDir = join(this.dir, 'arquivos')
      mkdirSync(filesDir, { recursive: true })
      if (request.files) {
        const wanted = new Set(snapshot.files.map((f) => f.id))
        for (const name of readdirSync(filesDir)) {
          if (!wanted.has(name)) rmSync(join(filesDir, name), { force: true })
        }
        for (const file of snapshot.files) {
          if (!/^[\w-]+$/.test(file.id) || existsSync(join(filesDir, file.id))) continue
          const data = await fetch(`${request.serverUrl}${file.path}`, {
            signal: AbortSignal.timeout(60_000),
          })
          if (!data.ok || this.request !== request) continue
          writeFileSync(join(filesDir, file.id), Buffer.from(await data.arrayBuffer()))
        }
      }
      writeFileSync(join(this.dir, 'snapshot.json'), JSON.stringify(snapshot))
    } catch {
      // O host pode ter caído agora mesmo: fica a última cópia boa.
    } finally {
      this.busy = false
    }
  }
}
