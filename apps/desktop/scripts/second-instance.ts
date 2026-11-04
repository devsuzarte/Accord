/**
 * Abre uma SEGUNDA instância do app no mesmo PC, para testar uma chamada consigo mesmo.
 * Precisa do `bun run dev` rodando em outro terminal (usa o mesmo servidor do Vite).
 *
 * Uso (na raiz): bun run dev:second          → perfil "b"
 *                bun run dev:second carla    → perfil "carla"
 */
import { join } from 'node:path'
import electronPath from 'electron'

const profile = process.argv[2] ?? 'b'
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173'

try {
  await fetch(`${rendererUrl}/pill/index.html`)
} catch {
  console.error(
    `[second] Não achei o Vite em ${rendererUrl}. Rode "bun run dev" em outro terminal antes.`,
  )
  process.exit(1)
}

console.log(`[second] abrindo o perfil "${profile}"`)
const proc = Bun.spawn([electronPath as unknown as string, '.', `--profile=${profile}`], {
  cwd: join(import.meta.dir, '..'),
  env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
  stdout: 'inherit',
  stderr: 'inherit',
})
process.exit(await proc.exited)
