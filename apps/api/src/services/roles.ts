import { networkInterfaces } from 'node:os'

/**
 * Papéis na sala, guardados SÓ no servidor (os atributos do LiveKit são só para mostrar
 * na interface — o cliente pode editar os próprios atributos, então não servem para autorizar).
 *
 *  - owner: quem entrou pelo próprio computador do servidor (é quem hospeda).
 *  - admin: promovido pelo dono. Pode desconectar pessoas.
 *  - member: todo o resto.
 */
export type Role = 'owner' | 'admin' | 'member'

const roles = new Map<string, Role>()

/** Bloqueios "para todos" aplicados pelo dono. */
export interface Blocks {
  mic: boolean
  audio: boolean
}
/**
 * Guardados pelo NOME (não pela identidade, que muda a cada entrada): sair e entrar de novo
 * não tira o silêncio aplicado pelo dono.
 */
const blocks = new Map<string, Blocks>()
const names = new Map<string, string>()

const keyOf = (identity: string) => names.get(identity) ?? identity

/** Liga a identidade da chamada ao nome com que a pessoa entrou. */
export function rememberName(identity: string, name: string): void {
  names.set(identity, name.trim().toLowerCase())
}

export function setRole(identity: string, role: Role): void {
  roles.set(identity, role)
}

export function roleOf(identity: string): Role {
  return roles.get(identity) ?? 'member'
}

export function blocksOf(identity: string): Blocks {
  return blocks.get(keyOf(identity)) ?? { mic: false, audio: false }
}

export function setBlocks(identity: string, value: Blocks): void {
  blocks.set(keyOf(identity), value)
}

/**
 * O pedido veio deste mesmo computador? (loopback ou qualquer IP das placas de rede daqui —
 * quem entra pelo próprio PC do servidor é o dono, qualquer que seja o endereço usado.)
 */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  const ip = address.replace(/^::ffff:/, '')
  if (ip === '::1' || ip.startsWith('127.')) return true
  // Testes com duas instâncias na mesma máquina: só 127.0.0.1 vira dono.
  if (process.env.SHARESCREEN_OWNER_LOOPBACK_ONLY === '1') return false
  return Object.values(networkInterfaces())
    .flat()
    .some((i) => i?.address === ip)
}
