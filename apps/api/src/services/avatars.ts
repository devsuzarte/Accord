import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Fotos de perfil (PNG, JPEG, WebP ou GIF animado), guardadas na pasta de dados do servidor. */
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024

const types = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
} as const
type Ext = keyof typeof types

/** Confere o tipo pelos primeiros bytes (não confia no que o cliente diz). */
function sniff(bytes: Uint8Array): Ext | null {
  const b = bytes
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif'
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'webp'
  return null
}

function directory(): string {
  const dir = join(process.env.SHARESCREEN_DATA_DIR ?? './data', 'avatars')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function setAvatarDirectory(dataDir: string): void {
  process.env.SHARESCREEN_DATA_DIR = dataDir
}

/** Salva e devolve o caminho público ("/avatars/<hash>.<ext>"). Lança erro com mensagem pronta. */
export function saveAvatar(dataUrl: string): string {
  const match = /^data:[^;,]+;base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Imagem inválida.')
  const bytes = Buffer.from(match[1]!, 'base64')
  if (bytes.length > MAX_AVATAR_BYTES) throw new Error('A imagem passa de 4 MB.')
  const ext = sniff(bytes)
  if (!ext) throw new Error('Use PNG, JPG, WebP ou GIF.')
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`
  const file = join(directory(), name)
  if (!existsSync(file)) writeFileSync(file, bytes)
  return `/avatars/${name}`
}

export function readAvatar(name: string): { bytes: Buffer; type: string } | null {
  const match = /^([a-f0-9]{32})\.(png|jpg|webp|gif)$/.exec(name)
  if (!match) return null
  const file = join(directory(), name)
  if (!existsSync(file)) return null
  return { bytes: readFileSync(file), type: types[match[2] as Ext] }
}
