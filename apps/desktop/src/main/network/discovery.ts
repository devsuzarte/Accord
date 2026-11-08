import { execFile } from 'node:child_process'
import dgram from 'node:dgram'
import {
  DEFAULT_API_PORT,
  DEFAULT_DISCOVERY_PORT,
  DISCOVERY_QUESTION,
  isLocalServer,
  normalizeServerUrl,
} from '@sharescreen/shared'
import type { DiscoveredServer, ProbeResult, ServerInfo, ServerRoute } from '@sharescreen/shared'
import {
  broadcastAddress,
  localInterfaces,
  neighbors24,
  prefixLength,
  routeOf,
  sameSubnet,
} from './interfaces'
import type { LocalInterface } from './interfaces'

/**
 * Procura servidores do sharescreen que este PC alcança, por vários caminhos ao mesmo tempo:
 *
 *  1. Este PC (localhost) e os endereços que a pessoa salvou.
 *  2. Pergunta em broadcast UDP (porta 7871) em cada rede: chega na rede local e no Radmin VPN.
 *  3. Vizinhos conhecidos pela tabela ARP (pega peers do Radmin com quem já houve tráfego).
 *  4. Peers online do Tailscale (`tailscale status --json`, se estiver instalado).
 *  5. Varredura da porta padrão no /24 da rede local (para quando o broadcast não passa).
 *
 * Todo candidato é confirmado com `GET /info` — só aparece o que responde de verdade.
 */

interface Candidate {
  url: string
  route: ServerRoute
  timeoutMs: number
}

const routeRank: Record<ServerRoute, number> = {
  'this-pc': 0,
  lan: 1,
  radmin: 2,
  tailscale: 3,
  vpn: 4,
  saved: 5,
}

/**
 * Para escolher o caminho até um servidor achado por vários endereços: rede local primeiro;
 * entre as VPNs (Radmin, Tailscale, outras), a mais rápida — uma VPN passando por relay tem
 * mais atraso, e é ela que costuma deixar a transmissão instável.
 */
const pathRank: Record<ServerRoute, number> = {
  'this-pc': 0,
  lan: 1,
  radmin: 2,
  tailscale: 2,
  vpn: 2,
  saved: 3,
}

function isServerInfo(value: unknown): value is ServerInfo {
  const v = value as ServerInfo
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.channels)
  )
}

async function probeUrl(candidate: Candidate): Promise<DiscoveredServer | null> {
  const started = Date.now()
  try {
    const response = await fetch(`${candidate.url}/info`, {
      signal: AbortSignal.timeout(candidate.timeoutMs),
    })
    if (!response.ok) return null
    const info: unknown = await response.json()
    if (!isServerInfo(info)) return null
    return {
      ...info,
      name: info.name.slice(0, 48),
      channels: info.channels.slice(0, 20).map((c) => ({
        id: String(c.id),
        name: String(c.name).slice(0, 48),
        people: (Array.isArray(c.people) ? c.people : []).slice(0, 50).map((p) => ({
          name: String(p.name).slice(0, 32),
          avatar:
            typeof p.avatar === 'string' && p.avatar.startsWith('/avatars/') ? p.avatar : null,
        })),
        count:
          typeof c.count === 'number' && Number.isInteger(c.count) && c.count >= 0
            ? Math.min(c.count, 999)
            : undefined,
      })),
      url: candidate.url,
      route: candidate.route,
      latencyMs: Date.now() - started,
    }
  } catch {
    return null
  }
}

/** Roda as promessas com no máximo `limit` ao mesmo tempo. */
async function pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!
      results.push(await run(item))
    }
  })
  await Promise.all(workers)
  return results
}

/** Pergunta em broadcast e coleta quem responde (endereço + porta da API). */
function askByBroadcast(interfaces: LocalInterface[], waitMs = 900): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>()
    const socket = dgram.createSocket('udp4')
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        /* já fechado */
      }
      resolve([...found])
    }
    const timer = setTimeout(finish, waitMs)
    socket.on('error', finish)
    socket.on('message', (message, remote) => {
      try {
        const reply = JSON.parse(message.toString()) as { sharescreen?: number; port?: number }
        if (reply.sharescreen === 1 && Number.isInteger(reply.port)) {
          found.add(`http://${remote.address}:${reply.port}`)
        }
      } catch {
        /* resposta de outra coisa */
      }
    })
    socket.bind(0, () => {
      try {
        socket.setBroadcast(true)
      } catch {
        return finish()
      }
      const question = Buffer.from(DISCOVERY_QUESTION)
      const targets = new Set(['255.255.255.255', ...interfaces.map(broadcastAddress)])
      const send = () => {
        for (const target of targets) {
          socket.send(question, DEFAULT_DISCOVERY_PORT, target, () => undefined)
        }
      }
      send()
      // UDP pode se perder: uma segunda rajada logo depois.
      setTimeout(() => !done && send(), 250)
    })
  })
}

function run(command: string, args: string[], timeoutMs = 1500): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) =>
      resolve(error ? '' : String(stdout)),
    )
  })
}

/** IPs vizinhos que o sistema já conhece (tabela ARP), nas redes deste PC. */
async function arpNeighbors(interfaces: LocalInterface[]): Promise<string[]> {
  const output =
    process.platform === 'win32' ? await run('arp', ['-a']) : await run('ip', ['-4', 'neigh'])
  const ips = new Set(output.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [])
  return [...ips].filter((ip) => {
    const last = Number(ip.split('.')[3])
    if (last === 0 || last === 255 || Number(ip.split('.')[0]) >= 224) return false
    return interfaces.some((i) => i.address !== ip && sameSubnet(ip, i))
  })
}

/** Peers online do Tailscale, se ele estiver instalado. */
async function tailscalePeers(): Promise<string[]> {
  const binary =
    process.platform === 'win32' ? 'C:\\Program Files\\Tailscale\\tailscale.exe' : 'tailscale'
  let output = await run(binary, ['status', '--json'])
  if (!output && process.platform === 'win32') output = await run('tailscale', ['status', '--json'])
  try {
    const status = JSON.parse(output) as {
      Peer?: Record<string, { Online?: boolean; TailscaleIPs?: string[] }>
    }
    return Object.values(status.Peer ?? {})
      .filter((p) => p.Online)
      .map((p) => p.TailscaleIPs?.find((ip) => ip.includes('.')))
      .filter((ip): ip is string => !!ip)
  } catch {
    return []
  }
}

export class DiscoveryService {
  private scanning: Promise<DiscoveredServer[]> | null = null

  /** Uma busca por vez; quem pedir durante a busca recebe o mesmo resultado. */
  scan(saved: string[]): Promise<DiscoveredServer[]> {
    this.scanning ??= this.doScan(saved).finally(() => {
      this.scanning = null
    })
    return this.scanning
  }

  async probe(address: string): Promise<ProbeResult> {
    const url = normalizeServerUrl(address)
    const server = await probeUrl({ url, route: this.routeForUrl(url), timeoutMs: 2500 })
    return server ? { ok: true, server } : { ok: false, url }
  }

  private routeForUrl(url: string): ServerRoute {
    if (isLocalServer(url)) return 'this-pc'
    const host = new URL(url).hostname
    if (localInterfaces().some((i) => i.address === host)) return 'this-pc'
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? routeOf(host) : 'saved'
  }

  private async doScan(saved: string[]): Promise<DiscoveredServer[]> {
    const interfaces = localInterfaces()
    const own = new Set(interfaces.map((i) => i.address))
    const candidates = new Map<string, Candidate>()
    const add = (url: string, route: ServerRoute, timeoutMs: number) => {
      const existing = candidates.get(url)
      if (!existing || routeRank[route] < routeRank[existing.route]) {
        candidates.set(url, {
          url,
          route,
          timeoutMs: Math.max(timeoutMs, existing?.timeoutMs ?? 0),
        })
      }
    }
    const routeForIp = (ip: string): ServerRoute => (own.has(ip) ? 'this-pc' : routeOf(ip))
    // O servidor deste PC é sempre usado por 127.0.0.1 (é assim que você vira o dono).
    const urlFor = (ip: string, port: number | string) =>
      `http://${own.has(ip) ? '127.0.0.1' : ip}:${port}`

    add(`http://127.0.0.1:${DEFAULT_API_PORT}`, 'this-pc', 1200)
    for (const address of saved.slice(0, 20)) {
      const url = normalizeServerUrl(address)
      add(url, isLocalServer(url) ? 'this-pc' : 'saved', 2500)
    }

    const [broadcast, arp, tailscale] = await Promise.all([
      askByBroadcast(interfaces),
      arpNeighbors(interfaces),
      interfaces.some((i) => i.route === 'tailscale') ? tailscalePeers() : Promise.resolve([]),
    ])
    for (const found of broadcast) {
      const { hostname, port } = new URL(found)
      add(urlFor(hostname, port), routeForIp(hostname), 2000)
    }
    for (const ip of arp) add(urlFor(ip, DEFAULT_API_PORT), routeForIp(ip), 1200)
    for (const ip of tailscale) add(`http://${ip}:${DEFAULT_API_PORT}`, 'tailscale', 2000)
    // Varredura só na rede local (o /8 do Radmin teria 16 milhões de endereços).
    for (const iface of interfaces.filter(
      (i) => i.route === 'lan' && prefixLength(i.netmask) >= 16,
    )) {
      for (const ip of neighbors24(iface.address))
        add(`http://${ip}:${DEFAULT_API_PORT}`, 'lan', 800)
    }

    const results = (await pool([...candidates.values()], 96, probeUrl)).filter(
      (s): s is DiscoveredServer => !!s,
    )

    // O mesmo servidor responde por vários endereços: fica o melhor caminho.
    const byId = new Map<string, DiscoveredServer>()
    for (const server of results) {
      const current = byId.get(server.id)
      if (
        !current ||
        pathRank[server.route] < pathRank[current.route] ||
        (pathRank[server.route] === pathRank[current.route] && server.latencyMs < current.latencyMs)
      ) {
        byId.set(server.id, server)
      }
    }
    const list = [...byId.values()].sort(
      (a, b) => routeRank[a.route] - routeRank[b.route] || a.name.localeCompare(b.name),
    )
    console.info(
      `[descoberta] ${candidates.size} endereços testados, ${list.length} servidor(es): ${list
        .map((s) => `${s.name} (${s.route}, ${s.url})`)
        .join(', ')}`,
    )
    return list
  }
}
