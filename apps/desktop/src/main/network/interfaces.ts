import { networkInterfaces } from 'node:os'
import type { ServerRoute } from '@sharescreen/shared'

export interface LocalInterface {
  address: string
  netmask: string
  route: Exclude<ServerRoute, 'this-pc' | 'saved'>
}

const toInt = (ip: string) =>
  ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0) >>> 0
const toIp = (n: number) => [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.')

/** Radmin VPN usa 26.0.0.0/8; Tailscale, 100.64.0.0/10 (CGNAT); o resto privado é rede local. */
export function routeOf(ip: string): LocalInterface['route'] {
  const [a = 0, b = 0] = ip.split('.').map(Number)
  if (a === 26) return 'radmin'
  if (a === 100 && b >= 64 && b <= 127) return 'tailscale'
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'lan'
  return 'vpn'
}

/** IPv4 desta máquina (sem loopback nem link-local 169.254). */
export function localInterfaces(): LocalInterface[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => !!i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => ({ address: i!.address, netmask: i!.netmask, route: routeOf(i!.address) }))
}

export function broadcastAddress({ address, netmask }: LocalInterface): string {
  const mask = toInt(netmask)
  return toIp(((toInt(address) & mask) | ~mask) >>> 0)
}

export function prefixLength(netmask: string): number {
  return toInt(netmask).toString(2).replace(/0/g, '').length
}

/** Os outros 253 endereços do /24 deste IP (para a varredura da rede local). */
export function neighbors24(address: string): string[] {
  const base = address.split('.').slice(0, 3).join('.')
  const own = Number(address.split('.')[3])
  const list: string[] = []
  for (let host = 1; host <= 254; host++) if (host !== own) list.push(`${base}.${host}`)
  return list
}

/** Mesma sub-rede? (usado para filtrar a tabela ARP) */
export function sameSubnet(ip: string, iface: LocalInterface): boolean {
  const mask = toInt(iface.netmask)
  return (toInt(ip) & mask) === (toInt(iface.address) & mask)
}
