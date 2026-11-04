import { DEFAULT_DISCOVERY_PORT, DISCOVERY_QUESTION } from '@sharescreen/shared'
import { env } from '../env'

/**
 * Responde à pergunta de descoberta ("sharescreen?v1", em broadcast UDP) com a porta da API.
 * O app então chama `GET /info` neste endereço — o que também confirma que a API é alcançável.
 * Broadcast chega na rede local e no Radmin VPN; Tailscale não repassa broadcast.
 */
export async function startDiscoveryResponder(): Promise<void> {
  const reply = Buffer.from(JSON.stringify({ sharescreen: 1, port: env.port }))
  try {
    await Bun.udpSocket({
      hostname: '0.0.0.0',
      port: DEFAULT_DISCOVERY_PORT,
      socket: {
        data(socket, data, port, address) {
          if (data.toString() === DISCOVERY_QUESTION) socket.send(reply, port, address)
        },
      },
    })
    console.log(`[api] descoberta na rede ligada (UDP ${DEFAULT_DISCOVERY_PORT})`)
  } catch (error) {
    // Outro servidor no mesmo PC já responde; este continua acessível pelo endereço.
    console.warn(`[api] descoberta na rede indisponível (UDP ${DEFAULT_DISCOVERY_PORT}): ${error}`)
  }
}
