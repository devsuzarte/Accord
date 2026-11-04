import {
  DEFAULT_API_PORT,
  inviteLinks,
  isLocalServer,
  normalizeServerUrl,
} from '@sharescreen/shared'
import type { CallSnapshot, HostAddress } from '@sharescreen/shared'

/** Ordem dos endereços para convidar: quem está longe costuma estar no Radmin. */
const routeOrder: HostAddress['route'][] = ['radmin', 'lan', 'tailscale', 'vpn']

export function sortAddresses(addresses: HostAddress[]): HostAddress[] {
  return [...addresses].sort((a, b) => routeOrder.indexOf(a.route) - routeOrder.indexOf(b.route))
}

/** Link de convite para um endereço específico deste PC (aba Hospedar). */
export function inviteFor(address: string, name: string, password: string | null): string {
  return inviteLinks({ serverUrl: normalizeServerUrl(address), name, password }).web
}

/**
 * Convite para a chamada atual. Se o servidor é este PC (você hospeda), usa o endereço
 * da rede/VPN em vez de "localhost", que não serve para os outros.
 */
export async function inviteForCall(
  server: NonNullable<CallSnapshot['server']>,
): Promise<string | null> {
  let serverUrl = server.url
  if (isLocalServer(serverUrl)) {
    const host = await window.platform.host.getState().catch(() => null)
    const pick = host ? sortAddresses(host.addresses)[0] : undefined
    if (!pick) return null
    const port = new URL(serverUrl).port || String(DEFAULT_API_PORT)
    serverUrl = normalizeServerUrl(`${pick.address}:${port}`)
  }
  return inviteLinks({ serverUrl, name: server.name, password: server.password }).web
}
