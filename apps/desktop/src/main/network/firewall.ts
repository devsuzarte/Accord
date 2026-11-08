import { execFile, spawn } from 'node:child_process'

/**
 * Firewall do Windows. Sem as portas liberadas, ou a conexão nem chega, ou o UDP fica bloqueado
 * e o LiveKit cai para TCP (a imagem congela a cada pacote perdido). O Windows costuma perguntar
 * sozinho na primeira vez, mas é comum a pessoa fechar o aviso ou liberar só "redes públicas".
 *
 * As regras valem para qualquer perfil de rede (o adaptador do Radmin às vezes fica como
 * "Pública"), mas só aceitam conexões vindas de redes de casa e de VPN: nada da internet.
 */
const RULES = [
  { name: 'Accord (servidor TCP)', protocol: 'TCP', ports: '7870,7880,7881' },
  { name: 'Accord (voz e descoberta UDP)', protocol: 'UDP', ports: '7871,7882' },
]
const REMOTE =
  'LocalSubnet,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10,26.0.0.0/8,25.0.0.0/8'

export type FirewallState = 'ok' | 'missing' | 'unknown' | 'unsupported'

function ruleExists(name: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    execFile(
      'netsh',
      ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') return resolve(null)
        // netsh sai com erro quando a regra não existe.
        resolve(!error && stdout.includes(name))
      },
    )
  })
}

export async function firewallState(): Promise<FirewallState> {
  if (process.platform !== 'win32') return 'unsupported'
  const found = await Promise.all(RULES.map((rule) => ruleExists(rule.name)))
  if (found.some((f) => f === null)) return 'unknown'
  return found.every(Boolean) ? 'ok' : 'missing'
}

/**
 * Cria as regras com permissão de administrador (o Windows mostra o aviso do UAC).
 * Comando em base64 (UTF-16LE) para não depender de aspas na linha de comando.
 */
export function allowFirewall(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  const script = RULES.map(
    (rule) =>
      `Remove-NetFirewallRule -DisplayName '${rule.name}' -ErrorAction SilentlyContinue; ` +
      `New-NetFirewallRule -DisplayName '${rule.name}' -Direction Inbound -Action Allow ` +
      `-Protocol ${rule.protocol} -LocalPort ${rule.ports} -Profile Any -RemoteAddress ${REMOTE} | Out-Null`,
  ).join('; ')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const outer =
    `Start-Process -FilePath powershell -Verb RunAs -Wait -WindowStyle Hidden ` +
    `-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'`
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', outer], { windowsHide: true })
    child.on('error', () => resolve(false))
    // Cancelar o UAC faz o Start-Process falhar (código diferente de 0).
    child.on('exit', (code) => resolve(code === 0))
  })
}
