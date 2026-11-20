import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CustomEmoji, SessionError } from '@sharescreen/shared'
import { CUSTOM_EMOJI_MAX, CUSTOM_EMOJI_MAX_BYTES, CUSTOM_EMOJI_NAME } from '@sharescreen/shared'
import { sniff } from './avatars'

/**
 * Emojis personalizados do servidor (como os de um servidor do Discord). Diferente do chat,
 * ficam guardados na pasta de dados de quem hospeda: continuam lá na próxima sessão.
 * Só PNG, GIF e WebP (o tipo é conferido pelos bytes), até 512 KB cada.
 */
const dir = join(process.env.SHARESCREEN_DATA_DIR || './data', 'emojis')
const indexFile = join(dir, 'index.json')

const contentTypes = { png: 'image/png', gif: 'image/gif', webp: 'image/webp' } as const
type Ext = keyof typeof contentTypes

interface Stored extends CustomEmoji {
  file: string
}

let emojis: Stored[] = load()

function load(): Stored[] {
  try {
    const list = JSON.parse(readFileSync(indexFile, 'utf8')) as Stored[]
    return list.filter(
      (e) =>
        CUSTOM_EMOJI_NAME.test(e.name) &&
        /^[a-z0-9_]+-[a-f0-9]{12}\.(png|gif|webp)$/.test(e.file) &&
        existsSync(join(dir, e.file)),
    )
  } catch {
    return []
  }
}

function persist(): void {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(indexFile, JSON.stringify(emojis))
  } catch (error) {
    console.error('[emojis] não consegui salvar a lista', error)
  }
}

const publicOf = ({ name, path, animated, by }: Stored): CustomEmoji => ({
  name,
  path,
  animated,
  by,
})

export function listEmojis(): CustomEmoji[] {
  return emojis.map(publicOf)
}

export function addEmoji(name: string, bytes: Uint8Array, by: string): CustomEmoji | SessionError {
  const clean = name.trim().toLowerCase()
  if (!CUSTOM_EMOJI_NAME.test(clean)) return 'bad-message'
  if (bytes.byteLength === 0 || bytes.byteLength > CUSTOM_EMOJI_MAX_BYTES) return 'too-large'
  if (emojis.length >= CUSTOM_EMOJI_MAX) return 'session-full'
  if (emojis.some((e) => e.name === clean)) return 'name-taken'
  const ext = sniff(bytes)
  if (ext !== 'png' && ext !== 'gif' && ext !== 'webp') return 'blocked-file'
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const file = `${clean}-${hash}.${ext}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), bytes)
  const entry: Stored = {
    name: clean,
    file,
    path: `/emojis/${file}`,
    animated: ext === 'gif',
    by: by.slice(0, 32),
  }
  emojis = [...emojis, entry]
  persist()
  return publicOf(entry)
}

/** Quem enviou (pelo nome) ou o dono/admin pode apagar. */
export function removeEmoji(name: string, by: string, privileged: boolean): true | SessionError {
  const entry = emojis.find((e) => e.name === name)
  if (!entry) return 'not-found'
  if (!privileged && entry.by.toLowerCase() !== by.toLowerCase()) return 'forbidden'
  emojis = emojis.filter((e) => e !== entry)
  rmSync(join(dir, entry.file), { force: true })
  persist()
  return true
}

export function readEmoji(file: string): { bytes: Buffer; type: string } | null {
  const entry = emojis.find((e) => e.file === file)
  if (!entry) return null
  const path = join(dir, entry.file)
  if (!existsSync(path)) return null
  const ext = entry.file.split('.').pop() as Ext
  return { bytes: readFileSync(path), type: contentTypes[ext] }
}
