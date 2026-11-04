import { networkInterfaces } from 'node:os'
import { app } from './app'
import { env } from './env'
import { startManagedLivekit } from './managed-livekit'
import { startDiscoveryResponder } from './services/discovery'

startManagedLivekit()
app.listen({ hostname: env.host, port: env.port })
void startDiscoveryResponder()

/** Endereços IPv4 desta máquina (rede local, Radmin 26.x, Tailscale 100.x...). */
function localAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address)
}

console.log(`[api] ouvindo na porta ${env.port}`)
const addresses = localAddresses()
if (addresses.length) {
  console.log('[api] em outros computadores, use no campo "Servidor" um destes endereços:')
  for (const address of addresses) console.log(`        ${address}`)
}
