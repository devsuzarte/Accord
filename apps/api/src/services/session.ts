import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type {
  ChatAttachment,
  ChatMessage,
  SessionError,
  SessionSnapshot,
} from '@sharescreen/shared'
import { CHAT_MAX_FILE_BYTES, INVITE_PREFIX, isBlockedFile } from '@sharescreen/shared'
import { env } from '../env'
import { exportBlocks, importBlocks } from './roles'

/**
 * Sessão temporária do canal: senha, chat e anexos.
 *
 * Tudo fica na memória e numa pasta temporária, que é apagada quando o servidor abre e
 * quando fecha — fechar o servidor encerra a sessão. Se o host cair, quem assume abre o
 * servidor com SHARESCREEN_RESTORE apontando para a cópia que vinha guardando.
 */
const MAX_MESSAGES = 1000
const MAX_SESSION_BYTES = 300 * 1024 * 1024

export const sessionDir = join(tmpdir(), `accord-sessao-${env.port}`)
const dir = sessionDir
const filesDir = join(dir, 'arquivos')

/** A senha nunca fica em texto: só o hash (scrypt), que também é o que vai na cópia da sessão. */
type PasswordHash = { salt: string; hash: string }
let password: PasswordHash | null = hashPassword(process.env.SHARESCREEN_PASSWORD)
/** Chave dos links de convite: entra sem saber a senha. Muda quando a senha muda. */
let inviteKey: string | null = password ? newKey() : null
/** Mesma sessão depois da troca de host (a cópia leva o id junto). */
let sessionId = newKey()
const messages: ChatMessage[] = []
const files = new Map<string, ChatAttachment & { file: string }>()
let totalBytes = 0

function reset(): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(filesDir, { recursive: true })
}
reset()
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

// ───────────────────────── Senha ─────────────────────────

function newKey(): string {
  return randomBytes(18).toString('base64url')
}

function hashPassword(plain: string | null | undefined, salt?: string): PasswordHash | null {
  const clean = plain?.trim()
  if (!clean) return null
  const s = salt ?? randomBytes(16).toString('base64url')
  return { salt: s, hash: scryptSync(clean, s, 32).toString('base64url') }
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function hasPassword(): boolean {
  return !!password
}

export function currentSession(): string {
  return sessionId
}

export function currentInvite(): string | null {
  return inviteKey
}

/** Gera uma chave nova: os links antigos param de funcionar (quem já está na call fica). */
export function rotateInvite(): string | null {
  inviteKey = password ? newKey() : null
  return inviteKey
}

export function setPassword(next: string | null): void {
  password = hashPassword(next)
  rotateInvite()
  console.log(password ? '[sessão] canal com senha' : '[sessão] canal sem senha')
}

/**
 * Confere o que veio no cabeçalho da senha: a senha ou `invite:<chave>` (link de convite).
 * `null` = pode entrar.
 */
export function checkPassword(given: string | null | undefined): SessionError | null {
  if (!password) return null
  if (!given) return 'password-required'
  if (given.startsWith(INVITE_PREFIX) && inviteKey) {
    if (same(given.slice(INVITE_PREFIX.length), inviteKey)) return null
  }
  const attempt = hashPassword(given, password.salt)
  return attempt && same(attempt.hash, password.hash) ? null : 'wrong-password'
}

// ───────────────────────── Anexos ─────────────────────────

/** O anexo sem o caminho do arquivo no disco (que não sai do servidor). */
function publicAttachment(entry: ChatAttachment & { file: string }): ChatAttachment {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    size: entry.size,
    image: entry.image,
    path: entry.path,
  }
}

const safeName = (name: string) =>
  [...basename(name)]
    .map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? '_' : c))
    .join('')
    .slice(0, 120) || 'arquivo'

export function addFile(
  name: string,
  type: string,
  bytes: Uint8Array,
): ChatAttachment | SessionError {
  if (bytes.byteLength === 0 || bytes.byteLength > CHAT_MAX_FILE_BYTES) return 'too-large'
  if (isBlockedFile(name)) return 'blocked-file'
  if (totalBytes + bytes.byteLength > MAX_SESSION_BYTES) return 'session-full'
  const id = randomBytes(18).toString('base64url')
  const file = join(filesDir, id)
  writeFileSync(file, bytes)
  totalBytes += bytes.byteLength
  const cleanType = /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream'
  const attachment: ChatAttachment = {
    id,
    name: safeName(name),
    type: cleanType,
    size: bytes.byteLength,
    image: /^image\/(png|jpeg|gif|webp)$/.test(cleanType),
    path: `/chat/files/${id}`,
  }
  files.set(id, { ...attachment, file })
  return attachment
}

export function readAttachment(id: string): { attachment: ChatAttachment; bytes: Buffer } | null {
  const entry = files.get(id)
  if (!entry || !existsSync(entry.file)) return null
  return { attachment: publicAttachment(entry), bytes: readFileSync(entry.file) }
}

// ───────────────────────── Mensagens ─────────────────────────

export function addMessage(
  author: { identity: string; name: string; avatar: string | null },
  text: string,
  attachmentIds: string[],
): ChatMessage | SessionError {
  const attachments: ChatAttachment[] = []
  for (const id of attachmentIds) {
    const entry = files.get(id)
    if (!entry) return 'bad-message'
    attachments.push(publicAttachment(entry))
  }
  const clean = text.trim()
  if (!clean && attachments.length === 0) return 'bad-message'
  const message: ChatMessage = {
    id: randomBytes(9).toString('base64url'),
    at: Date.now(),
    ...author,
    text: clean,
    attachments,
  }
  messages.push(message)
  if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES)
  return message
}

export function history(): ChatMessage[] {
  return messages
}

// ───────────────────────── Cópia para a migração ─────────────────────────

export function snapshot(): SessionSnapshot {
  return {
    version: 2,
    savedAt: Date.now(),
    password,
    invite: inviteKey,
    session: sessionId,
    messages,
    files: [...files.values()].map(publicAttachment),
    blocks: exportBlocks(),
  }
}

/**
 * Continua a sessão de um host que caiu: `restoreDir` tem `snapshot.json` e `arquivos/<id>`
 * (a cópia que o app deste PC vinha guardando).
 */
export function restoreFrom(restoreDir: string): void {
  try {
    const saved = JSON.parse(readFileSync(join(restoreDir, 'snapshot.json'), 'utf8')) as
      | SessionSnapshot
      | (Omit<SessionSnapshot, 'version' | 'password'> & { version: 1; password: string | null })
    if (saved.version === 1) {
      // Cópia de uma versão anterior (senha em texto).
      password = hashPassword(saved.password)
    } else if (saved.version === 2) {
      password = saved.password && typeof saved.password.salt === 'string' ? saved.password : null
      if (typeof saved.session === 'string' && saved.session) sessionId = saved.session
    } else {
      return
    }
    inviteKey = password ? (saved.version === 2 && saved.invite) || newKey() : null
    importBlocks(saved.blocks ?? {})
    for (const attachment of saved.files ?? []) {
      const source = join(restoreDir, 'arquivos', attachment.id)
      if (!/^[\w-]+$/.test(attachment.id) || !existsSync(source)) continue
      const file = join(filesDir, attachment.id)
      copyFileSync(source, file)
      totalBytes += statSync(file).size
      files.set(attachment.id, { ...attachment, file })
    }
    for (const message of saved.messages ?? []) {
      // Anexos que não vieram na cópia saem da mensagem (o texto continua).
      messages.push({ ...message, attachments: message.attachments.filter((a) => files.has(a.id)) })
    }
    console.log(
      `[sessão] continuando a sessão anterior: ${messages.length} mensagens, ${files.size} anexos`,
    )
  } catch (error) {
    console.error('[sessão] não consegui continuar a sessão anterior', error)
  }
}

if (process.env.SHARESCREEN_RESTORE) restoreFrom(process.env.SHARESCREEN_RESTORE)
