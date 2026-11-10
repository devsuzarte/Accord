# Accord

<p align="center"><img src="apps/desktop/resources/icon.png" width="128" alt="Accord"></p>

> A desktop app for **voice + screen sharing** that runs as a **discreet overlay** on top of your computer, with the server **self-hosted by whoever runs the session** and a migration path to the cloud. Visual and flow inspiration: Discord (without copying its brand, logo, font or proprietary icons).

The app is available in English and Brazilian Portuguese.

## Download (Windows 10/11)

Download **`Accord-Setup-<version>.exe`** from the [Releases](https://github.com/devsuzarte/Accord/releases) page and install it. The installer already includes the server: whoever hosts just clicks **Channels → Host**; everyone else goes to **Channels → Join**.

- The installer is **not signed** yet: Windows may show "Windows protected your PC". Click **More info → Run anyway**.
- The first time you host, allow **Windows Firewall** on "Private networks".
- Friends outside your home: everyone on the same **Radmin VPN** (or Tailscale).

## Key decisions

| Topic | Decision | Why |
|---|---|---|
| Desktop shell | **Electron** (MVP) | Screen capture + system audio come ready (`desktopCapturer` + `setDisplayMediaRequestHandler` with `audio: 'loopback'`). In Tauri, webview capture still has open issues on macOS/Linux. See [02-architecture](docs/02-architecture.md#decision-electron-vs-tauri) |
| Media (SFU) | Self-hosted **LiveKit** (single binary) | Runs locally with `livekit-server --dev`; same protocol on LiveKit Cloud or a cluster later → migration without rewriting the client |
| Backend | **Elysia + Bun** | Issues LiveKit tokens (open join); accounts, channels and invites later |
| Database | **SQLite + Drizzle** (MVP) → Postgres in the cloud | Zero infrastructure on the host; Drizzle swaps the driver |
| UI | **React + TypeScript + Vite** (electron-vite), CSS with design tokens | Highly customizable, Discord-like theme |
| Monorepo | **Turborepo + Bun workspaces** | `apps/desktop`, `apps/api`, `packages/ui`, `packages/shared` |
| MVP platform | **Windows 10 (2004+) / 11** | Overlay excluded from capture and per-process audio depend on Win10 2004+ APIs |

## Running it (development)

Requirements: **Bun 1.4+** and **Git**. `livekit-server.exe` is already in `infra/bin/`.

```powershell
bun install                # installs everything and downloads the Electron binary

bun run livekit:dev        # terminal 1: voice server (LiveKit)
bun run dev                # terminal 2: Accord server (port 7870) + app
bun run dev:second         # terminal 3 (optional): a second instance to test on your own
```

**Test a call:** set your name (and photo, if you like) in the **You** tab. In **Channels → Host**, click **Host now** and then **Join my channel**. In the second instance, use another name and go to **Channels → Join**: the channel shows up in the list.

**Share your screen:** in the pill, click **Share screen**, pick a screen or an app, the quality (up to **1080p at 60 fps** with "Smooth") and whether to stream audio, then click **Go live**. People in the call open the people list (people icon, next to leave) and click the **LIVE** badge.

**With another PC on the same network (or on Radmin/Tailscale):** the app looks for servers by itself on the local network, on Radmin VPN and on the Tailscale PCs that are online. If yours doesn't show up, use **Add address** with the IP (or `IP:port`, if it isn't 7870). The **Guide** tab walks through it.

## Distributing

```powershell
bun run package            # builds both outputs below (run it on Windows)
```

| Output | What it is |
|---|---|
| `release/accord-server/` | **Server**: `accord-server.exe` + `livekit-server.exe` + `LEIA-ME.txt`. A double click starts everything, with its own keys generated on first run, and the window shows the IPs for friends to use |
| `release/app/Accord-Setup-<version>.exe` | **App**: Windows NSIS installer |

Ports to allow in the host's firewall: **7870/TCP** (server), **7871/UDP** (so the app finds the server on the network), **7880–7881/TCP** and **7882/UDP** (voice and video). The app installer already includes the server (Host button).

| Command (at the root) | What it does |
|---|---|
| `bun run dev` | server with watch + app with HMR |
| `bun run dev:api` / `dev:desktop` | only one of the two |
| `bun run livekit:dev` | local voice server (development keys) |
| `bun run dev:second [profile]` | another app instance with separate data (needs `bun run dev` running) |
| `bun run package:server` / `package:desktop` | only the server / only the installer |
| `bun run typecheck` · `lint` · `format` | TypeScript · ESLint · Prettier |

**When something goes wrong:** in the tray icon, **Help → Copy diagnostics** (versions, system, memory and the last log lines) or **Open logs folder** (`%APPDATA%\Accord\logs`).

### Layout

```
apps/desktop    Electron: main (overlay, sharing, native audio, viewer, shortcuts, tray, logs),
                preload (PlatformBridge), renderer (pill, panel, people, picker, chat, viewer, pointer)
apps/api        Elysia + Bun: /health, /info, /join, /avatar, /me, /moderate, /pointer, /chat, /session;
                LiveKit bundled in the server package
packages/ui     tokens.css, global.css, surface.css, Avatar, IconButton, useReportSize
packages/shared types, default ports, palettes, IPC channels, PlatformBridge interface, i18n, invites, keys
packages/config shared tsconfigs
infra           livekit.yaml, livekit-dev.ts, bin/livekit-server.exe
```

What already works:
- **Overlay:** pill always on top, sized to its content, never steals focus, hidden from capture, draggable by its spine with edge snapping; panel attached to the pill; ghost mode; tray; shortcuts `Ctrl+Shift+O` (show/hide) and `Ctrl+Shift+G` (ghost).
- **Voice:** join the "General" channel with your name and photo; speaking ring, mute, deafen; noise suppression with **RNNoise** (toggle in Audio); sounds for mute, deafen, join, leave and when someone arrives.
- **Pill:** just you and the controls, always visible (mic, headphones, screen, settings, people, leave). The people button shows how many are in the call and a red dot when someone is live.
- **People list:** a window next to the pill. Right-click a person: **Mute mic / audio (for me)**; the **owner** (whoever joins from the server PC) can also mute **for everyone** and promote to **admin**; owner and admins can **disconnect** people.
- **Panel:** Channels (**Join** with the list of channels found and a manual address, **Host** from the app itself, **Guide**; collapsible Audio section), **You** (name, photo with crop and zoom, animated GIFs stay animated, and language), **Appearance** (6 palettes, 8 colors, background image) and Overlay.
- **Languages:** Portuguese and English, in every window, the tray and server messages. On first run it follows the system language.
- **Screen:** picker (screens/apps, no browser tabs), 4 quality presets (up to 1080p at 60 fps), LIVE badge, on-demand viewer (its own hidden connection), stream audio captured natively on Windows: entire screen = everything except the call; app = only that app's audio.
- **Temporary chat:** a button on the pill. Open: messages, images (click to enlarge), files and the input with attach/send (drag and paste work too). Minimized: messages scroll near the pill, like a livestream chat (images become "open the chat to see"); can be turned off in Overlay. It lives only on the host's server and disappears when the session ends.
- **Channel password:** the host sets it (or changes it with the channel open); locked channels show a padlock in the list.
- **Host migration:** if the host's PC drops, the session moves to whoever joined first, who opens their own server with the session copy (password, chat, attachments, mutes); everyone else reconnects to their IP automatically. Stopping hosting asks whether to **end for everyone** or **hand the host over**.
- **Per-person volume:** 0% to 200%, just for you, from the right-click menu in the people list.
- **Security review** ([14](docs/14-security.md)): nobody can pose as the owner or watch hidden, invites never carry the password, attempt limits, disconnecting blocks for 15 minutes, no programs through chat.
- **Push to talk** and mute/deafen shortcuts that work with a game in focus (side mouse buttons included).
- **Point at the streamer's screen** and a **mini stream over your game**.
- **Invite links:** "Copy invite" creates a link that opens Accord straight in the channel (with an invite key, never the password). Works when clicked in WhatsApp or Discord.
- **Quality in the viewer:** badge with resolution and fps, a panel with bitrate, loss, delay and freezes, a diagnosis of where the bottleneck is, and a Data saver option (360p).
- **Stream health (0.5.0):** a "Your stream" card shows what is really going out, whether the **graphics card** (H.264) or the processor (VP8) is encoding, what is holding the quality back (CPU or bandwidth), UDP vs TCP, and how each viewer is receiving it. Viewers report back automatically; the app suggests (or, with **Automatic quality**, applies) one step down without stopping the stream. Network test to the host, Windows firewall rule in one click, and an upload table for hosts.
- **Camera (0.6.0):** turn the camera on from the pill; any video input works (laptop webcam, USB camera, or the phone as a webcam through Windows 11's connected camera or a webcam app). Pick the device with a local preview in Panel › Channels › Camera. Others open your camera in a window from the people list. The owner can turn off someone's camera for everyone.
- **Switch the screen or app mid-stream (0.6.0):** the ⇄ button on the pill opens the picker in switch mode. Viewers keep watching without reconnecting.
- **Delivery:** one-click server package, installer, **automatic updates** through GitHub Releases, published by GitHub Actions ([12](docs/12-publishing-a-release.md)), logs and diagnostics.

Not yet: accounts and multiple channels (M3) and the connection assistant (M4). Ideas for what comes next: [13](docs/13-ideas.md). To review the visuals with **sample participants**, create `apps/desktop/.env.development.local` with `VITE_OVERLAY_DEMO=1`.

## Documents

1. [Product vision and scope](docs/01-product-vision.md) — problem, personas, user stories, in/out of the MVP
2. [Architecture](docs/02-architecture.md) — Electron vs Tauri, components, flows, data model, API, host mode
3. [Features and acceptance criteria](docs/03-features.md) — spec for each feature
4. [Design system and overlay](docs/04-design-system.md) — palette, tokens, pill, states, icons, wireframes
5. [Roadmap](docs/05-roadmap.md) — spikes, phases, tasks, definition of done
6. [Risks and mitigations](docs/06-risks.md)
7. [User research](docs/07-user-research.md) — plan, interview script, overlay usability test
8. [References](docs/08-references.md) — verified sources
9. [Overlay study (OpenCluely)](docs/09-overlay-study-opencluely.md) — window techniques, what we took/adapted/dropped, overlay-first architecture and design direction
10. [Next steps](docs/10-next-steps.md) — milestones M1–M12 up to a working app
11. [Research: noise suppression and Discord login](docs/11-noise-and-discord-research.md) — options evaluated and recommendation
12. [Publishing a release](docs/12-publishing-a-release.md) — release and automatic update, step by step
13. [Ideas](docs/13-ideas.md) — what could make Accord different, without paid services
14. [Security](docs/14-security.md) — who could attack whom, what is fixed and what remains a risk
15. [Cloud server](docs/15-cloud-server.md) — plan to move hosting to a free-tier VM

## Legend used in the documents

- **[Verified]**: confirmed in official documentation (link in [08-references](docs/08-references.md))
- **[Hypothesis]**: likely, but needs to be validated in a spike before it becomes production code
- **[Decision]**: a project choice that can be revisited

## Next step

Test on Windows (voice, screen with audio, installer and server) and follow the validation list in [10-next-steps](docs/10-next-steps.md#validation-on-windows-what-can-only-be-confirmed-there).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request: it explains how to propose a change, what gets checked and how review works. Security issues go through a private channel ([SECURITY.md](SECURITY.md)), never a public issue. Everyone follows the [code of conduct](CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](LICENSE) — see also [NOTICE](NOTICE). By submitting a contribution, you agree it is licensed under the same terms (section 5 of Apache 2.0). The installer also ships third-party software (LiveKit, Electron, RNNoise and others), each under its own license: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
