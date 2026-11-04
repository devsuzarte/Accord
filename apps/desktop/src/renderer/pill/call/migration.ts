import { DEFAULT_API_PORT } from '@sharescreen/shared'
import type { Participant, Room } from 'livekit-client'

/**
 * Migração de host: "first in, first host". Se o PC de quem hospeda cair, quem entrou
 * primeiro (fora o dono) abre o próprio servidor com a cópia da sessão e os outros
 * reconectam no IP dele. Todos calculam a mesma fila, pela ordem de entrada no LiveKit.
 */
export interface Successor {
  identity: string
  name: string
  /** IPv4 que essa pessoa anunciou (atributo `addrs`). */
  addresses: string[]
}

const joinedAt = (p: Participant) => p.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER

/** Fila de quem assume, sem o dono atual. */
export function successionOf(room: Room): Successor[] {
  const people = [room.localParticipant, ...room.remoteParticipants.values()].filter(
    (p) => p.attributes.role !== 'owner',
  )
  people.sort((a, b) => joinedAt(a) - joinedAt(b) || a.identity.localeCompare(b.identity))
  return people.map((p) => ({
    identity: p.identity,
    name: p.name || p.identity,
    addresses: (p.attributes.addrs ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a)),
  }))
}

/** O servidor ainda responde? (Pode ter sido só a minha conexão que oscilou.) */
export async function serverAlive(base: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2500) })
      if (response.ok) return true
    } catch {
      /* tenta de novo */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

/**
 * Espera o servidor do sucessor aparecer em algum dos endereços dele.
 * Prefere a mesma rede do host antigo (ex.: os dois no Radmin 26.x).
 */
export async function waitForServer(
  addresses: string[],
  previousHost: string,
  timeoutMs: number,
  cancelled: () => boolean,
): Promise<string | null> {
  const previous = new URL(previousHost).hostname
  const sameNet = (a: string) => a.split('.')[0] === previous.split('.')[0]
  const ordered = [...addresses].sort((a, b) => Number(sameNet(b)) - Number(sameNet(a)))
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !cancelled()) {
    const found = await Promise.any(
      ordered.map(async (address) => {
        const url = `http://${address}:${DEFAULT_API_PORT}`
        const response = await fetch(`${url}/info`, { signal: AbortSignal.timeout(1500) })
        if (!response.ok) throw new Error('não')
        return url
      }),
    ).catch(() => null)
    if (found) return found
    await new Promise((r) => setTimeout(r, 1500))
  }
  return null
}
