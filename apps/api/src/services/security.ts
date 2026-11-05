import { timingSafeEqual } from 'node:crypto'
import { HOST_KEY_HEADER } from '@sharescreen/shared'
import { isLoopback } from './roles'

/**
 * Defesas da API (ver docs/14-seguranca.md): limite de tentativas, banimento de quem foi
 * desconectado, tokens revogados e a chave do app de quem hospeda.
 */

// ───────────────────────── Limite de pedidos ─────────────────────────

const buckets = new Map<string, number[]>()

/**
 * `true` = passou do limite. Janela deslizante simples, na memória (a sessão é curta e o
 * servidor é de um grupo pequeno).
 */
export function overLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((at) => now - at < windowMs)
  if (hits.length >= max) {
    buckets.set(key, hits)
    return true
  }
  hits.push(now)
  buckets.set(key, hits)
  return false
}

/** Conta uma tentativa errada sem bloquear agora (o bloqueio vem no `overLimit` seguinte). */
export function countFailure(key: string, windowMs: number): void {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((at) => now - at < windowMs)
  hits.push(now)
  buckets.set(key, hits)
}

export function failuresOf(key: string, windowMs: number): number {
  const now = Date.now()
  return (buckets.get(key) ?? []).filter((at) => now - at < windowMs).length
}

// Limpa de vez em quando o que já expirou.
setInterval(() => {
  const now = Date.now()
  for (const [key, hits] of buckets) {
    if (hits.every((at) => now - at > 10 * 60_000)) buckets.delete(key)
  }
}, 60_000).unref?.()

// ───────────────────────── Senha errada ─────────────────────────

const PASSWORD_WINDOW = 5 * 60_000
const PASSWORD_MAX_FAILURES = 8

/** Muitas senhas erradas do mesmo IP: espera alguns minutos (trava quem tenta adivinhar). */
export function passwordLocked(ip: string): boolean {
  return failuresOf(`pw:${ip}`, PASSWORD_WINDOW) >= PASSWORD_MAX_FAILURES
}

export function passwordFailed(ip: string): void {
  countFailure(`pw:${ip}`, PASSWORD_WINDOW)
}

// ───────────────────────── Quem foi desconectado ─────────────────────────

const BAN_MS = 15 * 60_000
const bannedIps = new Map<string, number>()
const revoked = new Set<string>()
const ipOf = new Map<string, string>()

/** Guarda de onde cada pessoa entrou (para banir o IP ao desconectar). */
export function rememberIp(identity: string, ip: string | undefined): void {
  if (ip) ipOf.set(identity, normalizeIp(ip))
}

export function ipOfIdentity(identity: string): string | undefined {
  return ipOf.get(identity)
}

export function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, '')
}

/**
 * Desconectar = o token da pessoa deixa de valer na API e o IP fica 15 minutos sem entrar.
 * Sem isso, quem foi desconectado entrava de novo na hora e ainda lia o chat com o token antigo.
 */
export function banIdentity(identity: string): void {
  revoked.add(identity)
  const ip = ipOf.get(identity)
  // Nunca bane o próprio PC do servidor (o dono).
  if (ip && !isLoopback(ip)) bannedIps.set(ip, Date.now() + BAN_MS)
}

export function isBanned(ip: string | undefined): boolean {
  if (!ip) return false
  const until = bannedIps.get(normalizeIp(ip))
  if (!until) return false
  if (Date.now() > until) {
    bannedIps.delete(normalizeIp(ip))
    return false
  }
  return true
}

/** Token revogado? Vale também para as conexões de assistir da pessoa (`viewer-<identidade>-…`). */
export function isRevoked(identity: string): boolean {
  if (revoked.has(identity)) return true
  for (const id of revoked) if (identity.startsWith(`viewer-${id}-`)) return true
  return false
}

export function clearBans(): void {
  bannedIps.clear()
}

// ───────────────────────── O app de quem hospeda ─────────────────────────

/**
 * O app abre o servidor com uma chave aleatória (SHARESCREEN_HOST_KEY) e manda essa chave nos
 * pedidos que ele mesmo faz. Só assim um pedido "do próprio PC" vira dono ou troca a senha:
 * um site aberto no navegador de quem hospeda também chega em 127.0.0.1, mas não tem a chave.
 *
 * Servidor aberto à mão (sem a variável): vale o critério antigo, só ser do próprio PC.
 */
const hostKey = process.env.SHARESCREEN_HOST_KEY?.trim() || null

export function isHostRequest(
  address: string | undefined,
  headers: Record<string, string | undefined>,
): boolean {
  if (!isLoopback(address)) return false
  if (!hostKey) return true
  const given = headers[HOST_KEY_HEADER] ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(hostKey)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * DNS rebinding: um site pode fazer o próprio domínio apontar para 127.0.0.1 e falar com a API
 * como se fosse "do mesmo site". O cabeçalho Host denuncia: aceitamos só IP ou localhost.
 */
export function hostHeaderAllowed(host: string | null | undefined): boolean {
  if (!host) return true
  const name = host
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
  return (
    name === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(name) ||
    /^[0-9a-f:]+$/.test(name) ||
    // Nomes do MagicDNS do Tailscale (*.ts.net) e nomes .local da rede.
    name.endsWith('.ts.net') ||
    name.endsWith('.local')
  )
}
