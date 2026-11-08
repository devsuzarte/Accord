# 15 — Moving to a cloud server (free tier)

Plan written on 2026-11-08 (version 0.5.0). Status: **planning, nothing deployed yet.**
Legend: **[Verified]** = confirmed in the cited source · **[Hypothesis]** = likely, check before relying on it.

## Why

Today whoever hosts runs the API and LiveKit on their own PC. That's the cause of most of the
instability people feel when streaming:

- **The host's upload is multiplied by the viewers.** LiveKit forwards; it doesn't re-encode. At
  1080p30 (~5.4 Mbps with the 360p layer), 4 people watching need ~22 Mbps of the host's upload
  (table in the Host tab, `PRESET_MBPS`). A home connection with 10–20 Mbps of upload can't keep it.
- **The host's PC does everything at once**: the game, the overlay, encoding its own stream and
  forwarding everyone else's.
- **Reaching the host is fragile**: Radmin relays, UDP blocked → TCP, the Windows firewall, CGNAT.
- **Exposure**: everyone in the call can see (and target) the host's address. See [14](14-security.md).

A server in a data center fixes the first three (gigabit-class links, always on, a public address)
and hides everyone's home IP behind it.

## The free option: Oracle Cloud "Always Free"

**[Verified]** in Oracle's Always Free documentation:

- Arm VMs (`VM.Standard.A1.Flex`): **2 OCPUs and 12 GB of memory** in total for Always Free
  tenancies (1,500 OCPU hours and 9,000 GB hours a month). Older guides say 4 OCPUs / 24 GB;
  the current page says 2 / 12.
- **10 TB a month of outbound data.**
- The Always Free instances must be created in the account's **home region**, chosen at sign-up.
- **Idle instances may be reclaimed**: over 7 days, CPU (95th percentile), network and memory
  (A1 only) all under 20%. A voice server that sits unused for a week could be taken back.

**[Hypothesis]** to confirm when creating the account:

- Sign-up asks for a **credit card for verification**, even for Always Free only. Nothing is charged
  as long as the account stays "Free Tier" (it doesn't become Pay As You Go on its own). This is a
  decision for you, given "nothing paid for now".
- Brazilian regions: São Paulo (`sa-saopaulo-1`) and Vinhedo (`sa-vinhedo-1`). A1 capacity is often
  exhausted ("out of host capacity") in popular regions; it may take retries over a few days.
- Network bandwidth of A1 VMs scales with the OCPU count (about 1 Gbps per OCPU). Even 1 Gbps is
  far above what a group of friends needs.

**Does it fit?** Yes, see the sizing below: 10 people with one 1080p stream every evening is
~2.6 TB/month, a quarter of the 10 TB. LiveKit doesn't re-encode, so 2 Arm cores should be plenty
for 10 people **[Hypothesis — measure with `top` during a real call]**.

### Sizing for 10 people (one channel)

The server sends one copy of each stream to each viewer and one copy of each voice to each listener.
Top layers from our presets: 720p30 = 2 Mbps, 1080p30 = 5 Mbps. Voice ≈ 40 kbps per listener
**[Hypothesis — Opus with DTX sends much less during silence, so this is an upper bound]**.

| Evening with 10 people | Out of the server | Per hour | 4 h/day for 30 days |
|---|---|---|---|
| Voice only | 10 × 9 × 0.04 ≈ 3.6 Mbps | ~1.6 GB | ~0.2 TB |
| 1 stream at 720p30 to 9 viewers | 18 + 3.6 ≈ 22 Mbps | ~10 GB | ~1.2 TB |
| 1 stream at 1080p30 to 9 viewers | 45 + 3.6 ≈ 49 Mbps | ~22 GB | ~2.6 TB |
| 2 streams at 1080p30 at the same time | ≈ 94 Mbps | ~42 GB | ~5 TB |

The same numbers are the **upload** a home host would need. Even the lightest stream (22 Mbps) is
beyond many home plans, which is why hosting at home is unstable with 10 people.

### Free options compared (checked on 2026-11-08)

| Option | What's free | For 10 people | Verdict |
|---|---|---|---|
| **Oracle Cloud Always Free** | Arm VM 2 OCPU / 12 GB, **10 TB/month out** [Verified] | Fits even 2 simultaneous 1080p streams every evening | **Chosen.** Catch: card verification at sign-up [Hypothesis] and idle reclaim |
| LiveKit Cloud (Build plan) | 5,000 participant minutes and **50 GB** downstream a month, no card; hard cap — new requests fail after it [Verified] | 50 GB ≈ 2.3 h of one 1080p stream to 9 people a **month**; 5,000 min ≈ 8 h of 10 people talking | Too small |
| Cloudflare Realtime (SFU + TURN) | **1,000 GB/month** egress shared by SFU and TURN; ingress free [Verified] | ≈ 45 h of one 1080p stream to 9 people a month | Generous, but it's a different SFU API: replacing LiveKit would mean rewriting the call layer. Its TURN doesn't relay over TCP [Verified] |
| Google Cloud free tier | 1 e2-micro in US regions, **1 GB/month** out [Verified] | Not even one evening | No |
| Azure for Students | US$100 for 12 months, no card, school e-mail [Verified]; first 100 GB/month out free, then US$0.181/GB from Brazil South [Verified] | The credit covers ~550 GB more: about 25 h of 1080p a year | Only for voice or tests |
| Home host + Tailscale | Personal plan: **up to 6 users** [Verified] | Doesn't fit 10 | No |
| Home host + ZeroTier | Personal plan: 10 users, **10 devices**, no way to add more [Verified] | Exactly 10, no slack; the host's upload problem stays | Stopgap |
| Home host + playit.gg | Free tier relays plain UDP; custom TCP+UDP tunnels need Premium [Verified on playit.gg] | Accord needs TCP (API) + UDP (media); the upload problem stays; the relay sees the unencrypted API traffic | No |

## Target architecture

```
                 ┌──────────────── Oracle VM (Ubuntu, arm64) ────────────────┐
 Accord app ──── │ :443 TCP  Caddy (Let's Encrypt for accord-xyz.duckdns.org) │
 (https/wss)     │            ├─ /rtc*  → LiveKit :7880 (signaling)           │
                 │            └─ else   → accord-server API :7870             │
 media ───────── │ :7881 TCP  LiveKit ICE/TCP (fallback)                      │
 (DTLS-SRTP)     │ :7882 UDP  LiveKit media (single UDP port, as today)       │
                 └────────────────────────────────────────────────────────────┘
```

- **Same binaries we ship today**, compiled for `linux-arm64`:
  - **[Verified]** Bun cross-compiles with `--target=bun-linux-arm64`.
  - **[Verified]** LiveKit publishes `livekit_1.13.11_linux_arm64.tar.gz` on its release page
    (download answered 200).
- **TLS is required.** **[Verified]** LiveKit's deployment guide: a domain, a certificate from a
  trusted CA ("self-signed certs do not work"), HTTPS terminated by a load balancer or reverse
  proxy, and `use_external_ip: true` on most clouds (the VM only sees its private address).
- **Domain for free:** DuckDNS gives free subdomains of `duckdns.org` **[Verified]**. Caddy gets
  and renews the Let's Encrypt certificate by itself **[Hypothesis: HTTP-01 on port 80 works with
  DuckDNS's A record; otherwise use the DNS-01 plugin]**.
- **One domain for both**: Caddy sends `/rtc` to LiveKit and the rest to the API, so the app needs
  a single `https://` address **[Hypothesis: the LiveKit client's signaling path is `/rtc`; check
  in `livekit-client` before writing the Caddyfile]**.
- **TURN over TLS/443** (for networks that block everything but 443) needs a second domain and
  certificate **[Verified]**. Left for a later phase.

## What changes in the code

| # | Change | Why |
|---|---|---|
| C1 | `SHARESCREEN_MODE=cloud` in the API | Turns on the rules below without touching the "host on my PC" mode |
| C2 | **Owner by key, not by loopback.** `SHARESCREEN_ADMIN_KEY` (generated on first run, printed once). The app keeps it per server (encrypted with `safeStorage`) and main injects `x-accord-host-key` only for that server's origin | Nobody "joins from the server's PC" in the cloud |
| C3 | **Password mandatory** in cloud mode (refuse to start without one); invites keep using the invite key | The server is on the public internet, not a home network |
| C4 | `normalizeServerUrl`: `https://` addresses keep port 443 (don't append `:7870`); `livekitUrlFor` returns `wss://<domain>` from `LIVEKIT_PUBLIC_URL` | Today it assumes `http://<ip>:7870` |
| C5 | `hostHeaderAllowed`: accept the configured domain | Today only IPs, `localhost`, `.local`, `*.ts.net` (DNS rebinding protection) |
| C6 | No host migration and no session end when "the host" leaves: the session lives as long as the server | There's no host PC to drop |
| C7 | `/info` reports `mode: 'cloud'`; the app shows the server as **pinned** in Join (no discovery) | Discovery is for local networks only |
| C8 | Chat attachments and avatars: cap total disk (already 150 MB per session) and clear on a timer instead of "at session end" | The session no longer ends |
| C9 | `package:server --target linux-arm64` + `install.sh` (systemd units for `accord-server`, Caddyfile, LiveKit config with `use_external_ip`) | One command to install on the VM |
| C10 | Health page `GET /health` already exists; add a systemd `Restart=always` and journald logs | The server must come back on its own |

The app keeps both modes: "host on my PC" stays for LAN parties and for whoever doesn't want the cloud.

## Security on the VM

- SSH by key only, password login off; automatic security updates (`unattended-upgrades`).
- Open only **22 (your IP if possible), 80, 443 TCP, 7881 TCP, 7882 UDP** — in two places:
  Oracle's **security list / network security group** and the VM's own firewall
  **[Hypothesis: Oracle's Ubuntu images ship with iptables rules that block everything except
  SSH; they need an explicit allow]**.
- LiveKit keys and the admin key live in a file readable only by the service user.
- **DDoS**: the home IPs of everyone disappear from the picture (people only see the VM's
  address). The API already rate-limits joins, passwords, chat, pointers, stream reports and speed
  tests. **[Hypothesis]** Oracle applies basic volumetric protection on its network; a targeted
  attack can still take the VM down, but nobody's home connection goes with it.
- The operator (you) can see the chat and who's in the call, exactly like a host today; make that
  clear on the invite page.

## Phases

| Phase | What | Done when |
|---|---|---|
| 0 | **Decide**: create the Oracle account (card verification), pick the home region, who maintains the VM | An A1 VM with 2 OCPUs / 12 GB is running |
| 1 | C1–C8 in the code, tested locally with Caddy and a self-made domain (`/etc/hosts`) | Two app instances call each other through `https://` |
| 2 | C9–C10: arm64 package, `install.sh`, systemd, Caddyfile | `curl https://<domain>/health` answers after a reboot |
| 3 | Real test with friends: 1 stream at 1080p30 to 4 people for 1 hour; measure CPU, RAM and egress | No freezes the "Your stream" card blames on the server |
| 4 | App UX: "Add a cloud server" (address + admin key), pinned server, invite page saying "watch in the app" | A friend joins from an invite with no network knowledge |
| 5 (optional) | TURN/TLS on 443; watching from the browser (now possible: the server is HTTPS) | Someone behind a strict corporate network joins |

## Open questions

1. Are you OK with Oracle's card verification? If not, the cloud plan waits and we keep improving the home-host mode.
2. Who keeps the VM alive (updates, the idle-reclaim rule)? A call once a week is enough to stay above 20%? **[Hypothesis — network use during calls should count; a small cron job can keep it busy if not]**.
3. One server for the whole group, or one per friend group? (The admin key model supports both.)
4. Keep the chat in memory only, or a short history (24 h) on the VM's disk?

## Sources

- [Oracle: Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)
- [LiveKit: Self-hosting › Deployment](https://docs.livekit.io/transport/self-hosting/deployment/)
- [Bun: Single-file executables (cross-compiling targets)](https://bun.com/docs/compiler/executables)
- [LiveKit Cloud pricing](https://livekit.com/pricing) and [quotas and limits](https://docs.livekit.io/deploy/admin/quotas-and-limits/)
- [Cloudflare Realtime: pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/) and [TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/)
- [Google Cloud: Free Tier features](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Azure for Students](https://azure.microsoft.com/en-us/free/students) and [Azure bandwidth pricing](https://azure.microsoft.com/en-us/pricing/details/bandwidth/)
- [Tailscale pricing](https://tailscale.com/pricing), [ZeroTier pricing](https://www.zerotier.com/pricing), [playit.gg](https://playit.gg/)
- [Home Assistant DuckDNS add-on (DuckDNS is free; Let's Encrypt)](https://github.com/home-assistant/addons/blob/master/duckdns/README.md)
- LiveKit release asset checked: `https://github.com/livekit/livekit/releases/download/v1.13.11/livekit_1.13.11_linux_arm64.tar.gz`
