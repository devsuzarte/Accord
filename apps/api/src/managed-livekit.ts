import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_LIVEKIT_PORT } from '@sharescreen/shared'
import { env } from './env'

/**
 * Pacote do servidor: se o `livekit-server(.exe)` estiver na MESMA pasta deste executável,
 * a API sobe o LiveKit junto, com chaves próprias geradas na primeira execução.
 * Resultado: um duplo clique em `accord-server.exe` e o servidor está pronto.
 *
 * Em desenvolvimento (`bun src/index.ts`) o executável é o Bun, então nada acontece aqui —
 * a não ser que o app peça (botão Hospedar): ele passa SHARESCREEN_LIVEKIT_BIN e
 * SHARESCREEN_DATA_DIR para usar o binário de infra/bin e uma pasta de dados própria.
 */

interface Keys {
  apiKey: string
  apiSecret: string
}

function loadOrCreateKeys(file: string): Keys {
  if (existsSync(file)) {
    const keys = JSON.parse(readFileSync(file, 'utf8')) as Keys
    if (keys.apiKey && keys.apiSecret?.length >= 32) return keys
  }
  const keys: Keys = {
    apiKey: `accord-${randomBytes(4).toString('hex')}`,
    apiSecret: randomBytes(32).toString('base64url'),
  }
  writeFileSync(file, JSON.stringify(keys, null, 2))
  return keys
}

function livekitConfig(keys: Keys): string {
  return [
    '# Gerado pelo accord-server. Edite à vontade; as chaves ficam em chaves.json.',
    `port: ${DEFAULT_LIVEKIT_PORT}`,
    'rtc:',
    `  tcp_port: ${DEFAULT_LIVEKIT_PORT + 1}`,
    `  udp_port: ${DEFAULT_LIVEKIT_PORT + 2}`,
    '  use_external_ip: false',
    'keys:',
    `  ${keys.apiKey}: ${keys.apiSecret}`,
    'logging:',
    '  level: warn',
    '',
  ].join('\n')
}

export function startManagedLivekit(): ChildProcess | null {
  if (process.env.SHARESCREEN_MANAGED_LIVEKIT === '0') return null
  const baseDir = dirname(process.execPath)
  const binary =
    process.env.SHARESCREEN_LIVEKIT_BIN ||
    join(baseDir, process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server')
  if (!existsSync(binary)) return null

  const dataDir = process.env.SHARESCREEN_DATA_DIR || join(baseDir, 'dados')
  mkdirSync(dataDir, { recursive: true })
  const keys = loadOrCreateKeys(join(dataDir, 'chaves.json'))
  const configPath = join(dataDir, 'livekit.yaml')
  if (!existsSync(configPath)) writeFileSync(configPath, livekitConfig(keys))

  env.livekit.apiKey = keys.apiKey
  env.livekit.apiSecret = keys.apiSecret
  env.livekit.url = `ws://localhost:${DEFAULT_LIVEKIT_PORT}`

  const child = spawn(binary, ['--config', configPath, '--bind', '0.0.0.0'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })
  child.on('exit', (code) => {
    console.error(`[servidor] o LiveKit parou (código ${code}). Feche e abra o servidor de novo.`)
  })
  // SIGKILL: com SIGTERM o LiveKit "drena" (espera a sala esvaziar) e a call continuava viva
  // com a API já fechada — todo mundo ficava conectado num servidor pela metade.
  const stop = () => child.kill('SIGKILL')
  process.on('exit', stop)
  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))
  console.log('[servidor] LiveKit iniciado com as chaves deste computador.')
  return child
}
