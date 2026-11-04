import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { WebContents } from 'electron'

/**
 * Log em arquivo: %APPDATA%/Accord/logs/main.log (gira em 1 MB → main.old.log).
 * Tudo que o main escreve no console vai junto, mais erros das janelas.
 */
const MAX_BYTES = 1024 * 1024
let file = ''

function write(level: string, parts: unknown[]): void {
  if (!file) return
  const text = parts
    .map((p) =>
      p instanceof Error ? (p.stack ?? p.message) : typeof p === 'string' ? p : JSON.stringify(p),
    )
    .join(' ')
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES)
      renameSync(file, file.replace(/\.log$/, '.old.log'))
    appendFileSync(file, `${new Date().toISOString()} ${level.padEnd(5)} ${text}\n`)
  } catch {
    /* log nunca derruba o app */
  }
}

export function setupLogging(): void {
  const dir = app.getPath('logs')
  mkdirSync(dir, { recursive: true })
  file = join(dir, 'main.log')

  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...parts: unknown[]) => {
      original(...parts)
      write(level === 'log' ? 'info' : level, parts)
    }
  }
  process.on('uncaughtException', (error) => console.error('[crash] exceção não tratada', error))
  process.on('unhandledRejection', (reason) => console.error('[crash] promessa rejeitada', reason))
  console.info(
    `[app] Accord ${app.getVersion()} iniciando (Electron ${process.versions.electron})`,
  )
}

/** Erros e avisos das janelas também vão para o log. */
export function captureRendererLogs(contents: WebContents, label: string): void {
  contents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') {
      write(event.level === 'error' ? 'error' : 'warn', [`[${label}] ${event.message}`])
    } else if (event.message.startsWith('[call]')) {
      // Passos da chamada e do compartilhamento (ajudam no "Copiar diagnóstico").
      write('info', [`[${label}] ${event.message}`])
    }
  })
  contents.on('render-process-gone', (_event, details) => {
    console.error(`[${label}] a janela parou: ${details.reason}`)
  })
}

export function logDirectory(): string {
  return app.getPath('logs')
}

/** Texto para colar numa mensagem quando pedir ajuda. */
export function diagnosticReport(): string {
  let tail: string
  try {
    tail = readFileSync(file, 'utf8').split('\n').slice(-150).join('\n')
  } catch {
    tail = '(sem log)'
  }
  return [
    `Accord ${app.getVersion()}`,
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
    `Sistema: ${process.platform} ${process.getSystemVersion()} (${process.arch})`,
    `Memória do app: ${Math.round(
      app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024,
    )} MB`,
    '',
    '--- últimas linhas do log ---',
    tail,
  ].join('\n')
}
