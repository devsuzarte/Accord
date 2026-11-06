# infra/

## Local LiveKit (Windows)

`livekit-server.exe` **v1.13.11** is already in `infra/bin/` (downloaded from the official releases, checksum verified; the folder is ignored by git). To update it, download `livekit_<version>_windows_amd64.zip` from https://github.com/livekit/livekit/releases and replace the file. The release workflow downloads it on its own (`.github/workflows/release.yml`).

At the root: `bun run livekit:dev` (the `infra/livekit-dev.ts` script uses the binary in `infra/bin/` or, if there is none, the one on the PATH).

Ports: 7880/TCP (signaling), 7881/TCP (ICE/TCP), 7882/UDP (media, mux).
On first run Windows Firewall asks for permission — allow it for private networks.

## Remote access

See `docs/02-architecture.md` › Host mode. For a VPN (Radmin/Tailscale), uncomment `node_ip` and `ips.includes` in `livekit.yaml`.

## Server package (for distribution)

`bun run package:server` builds `release/accord-server/`: the compiled API starts this same `livekit-server.exe` with its own keys (generated on first run in `dados/`). It needs neither the `livekit.yaml` from here nor `--dev` mode.
