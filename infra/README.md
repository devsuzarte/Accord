# infra/

## LiveKit local (Windows)

O `livekit-server.exe` **v1.13.11** já está em `infra/bin/` (baixado das releases oficiais, checksum conferido; a pasta é ignorada pelo git). Para atualizar, baixe o `livekit_<versão>_windows_amd64.zip` em https://github.com/livekit/livekit/releases e troque o arquivo.

Na raiz: `bun run livekit:dev` (o script `infra/livekit-dev.ts` usa o binário de `infra/bin/` ou, se não houver, o do PATH).

Portas usadas: 7880/TCP (sinalização), 7881/TCP (ICE/TCP), 7882/UDP (mídia, mux).
Na primeira execução o Firewall do Windows vai pedir permissão — libere para redes privadas.

## Acesso remoto

Ver `docs/02-arquitetura.md` › Host mode. Para VPN (Radmin/Tailscale), descomente `node_ip` e `ips.includes` em `livekit.yaml`.

## Pacote do servidor (para distribuir)

`bun run package:server` gera `release/accord-server/`: a API compilada sobe este mesmo `livekit-server.exe` com chaves próprias (geradas na primeira execução em `dados/`). Não precisa do `livekit.yaml` daqui nem do modo `--dev`.
