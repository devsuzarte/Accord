/**
 * Monta a pasta do servidor para distribuir: um duplo clique e está no ar.
 *
 *   release/accord-server/
 *     accord-server.exe          API (Bun compilado) — sobe o LiveKit junto
 *     livekit-server.exe         copiado de infra/bin/
 *     LEIA-ME.txt
 *     dados/                     criada na 1ª execução (chaves e configuração do LiveKit)
 *
 * Uso (na raiz): bun run package:server            → Windows x64
 *                bun run package:server --linux    → Linux x64 (testes)
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_API_PORT, DEFAULT_DISCOVERY_PORT, DEFAULT_LIVEKIT_PORT } from '@sharescreen/shared'

const linux = process.argv.includes('--linux')
const root = join(import.meta.dir, '..', '..', '..')
const out = join(root, 'release', linux ? 'accord-server-linux' : 'accord-server')
const exe = linux ? 'accord-server' : 'accord-server.exe'
const livekit = linux ? 'livekit-server' : 'livekit-server.exe'

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

console.log(`[servidor] compilando a API → ${join(out, exe)}`)
const build = Bun.spawnSync(
  [
    'bun',
    'build',
    join(import.meta.dir, '..', 'src', 'index.ts'),
    '--compile',
    '--minify',
    `--target=${linux ? 'bun-linux-x64' : 'bun-windows-x64'}`,
    '--outfile',
    join(out, exe),
  ],
  { stdout: 'inherit', stderr: 'inherit', env: { ...process.env, NODE_ENV: 'production' } },
)
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

const livekitSource = join(root, 'infra', 'bin', livekit)
if (existsSync(livekitSource)) {
  copyFileSync(livekitSource, join(out, livekit))
  console.log(`[servidor] ${livekit} copiado de infra/bin/`)
} else {
  console.warn(
    `[servidor] ATENÇÃO: ${livekit} não está em infra/bin/. Baixe em https://github.com/livekit/livekit/releases e coloque na pasta do servidor.`,
  )
}

// O LiveKit é Apache-2.0: a licença vai junto com o binário.
copyFileSync(join(root, 'infra', 'LICENSE-apache-2.0.txt'), join(out, 'LICENSE-livekit.txt'))
// O próprio Accord também é Apache-2.0 (licença e NOTICE vão junto, como pede a seção 4).
copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE.txt'))
copyFileSync(join(root, 'NOTICE'), join(out, 'NOTICE.txt'))

writeFileSync(
  join(out, 'LEIA-ME.txt'),
  `SERVIDOR DO ACCORD
==================

Como usar
1. Dê dois cliques em ${exe}. Deixe a janela aberta enquanto o grupo estiver na chamada.
2. Na primeira vez, o Firewall do Windows vai perguntar: permita em "Redes privadas"
   (para o ${exe} e para o ${livekit}).
3. No app, cada pessoa abre o painel em Canais > Entrar: quem está na mesma rede
   (ou no mesmo Radmin VPN) vê este servidor na lista. Se não aparecer, use
   "Adicionar endereço" com um dos endereços que esta janela mostra.
   Dica: dá para hospedar direto pelo app, em Canais > Hospedar, sem abrir este programa.

Portas usadas (libere se usar outro firewall)
- ${DEFAULT_API_PORT} TCP  — servidor do Accord
- ${DEFAULT_DISCOVERY_PORT} UDP  — para o app achar este servidor na rede
- ${DEFAULT_LIVEKIT_PORT} TCP  — voz e vídeo (sinalização)
- ${DEFAULT_LIVEKIT_PORT + 1} TCP  — voz e vídeo (alternativa quando UDP é bloqueado)
- ${DEFAULT_LIVEKIT_PORT + 2} UDP  — voz e vídeo (mídia)

Amigos fora da sua rede
Use uma VPN de jogos como Radmin VPN ou Tailscale e passe o IP que ela mostra
(Radmin: 26.x.x.x · Tailscale: 100.x.x.x).

Arquivos
- dados/chaves.json   chaves do servidor de voz, geradas na 1ª execução. Não compartilhe.
- dados/livekit.yaml  configuração do servidor de voz.
`,
)
console.log(`[servidor] pronto: ${out}`)
