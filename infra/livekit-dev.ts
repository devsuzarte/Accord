/**
 * Sobe o LiveKit local em modo desenvolvimento (chaves devkey/secret).
 * Usa infra/bin/livekit-server(.exe) se existir; senão, o que estiver no PATH.
 * Uso (na raiz): bun run livekit:dev
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const exe = process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server'
const local = join(import.meta.dir, 'bin', exe)
const binary = existsSync(local) ? local : 'livekit-server'

const args = ['--dev', '--bind', '0.0.0.0', '--config', join(import.meta.dir, 'livekit.yaml')]
console.log(`[livekit] ${binary} ${args.join(' ')}`)

const proc = Bun.spawn([binary, ...args], {
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
})
const stop = () => proc.kill()
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.exit(await proc.exited)
