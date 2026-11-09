# Accord (formerly "sharescreen"): context for Claude Code

Desktop app for voice + screen sharing as an overlay, inspired by Discord. Full plan in `README.md` and `docs/`.

## Fixed decisions
- Electron (MVP), React + TS + electron-vite; Windows 10 2004+/11 first
- Self-hosted LiveKit (SFU); Elysia + Bun API; SQLite + Drizzle
- Turborepo + Bun workspaces: `apps/desktop`, `apps/api`, `packages/ui`, `packages/shared`, `packages/config`
- UI and call logic import nothing from Electron; all OS access goes through the `PlatformBridge` (preload)
- Electron security: contextIsolation + sandbox + allowlisted IPC with validated payloads
- Lucide icons, Noto Sans font, tokens in `packages/ui/tokens.css`; never use Discord's brand, font, icons or sounds
- Screen picker only offers `screen` and `window` (no browser tabs)
- **Overlay-first**: no main window. Surfaces = pill (non-focusable, sized to content, `screen-saver` level, `setContentProtection`) + panel attached to the pill + picker and viewer on demand. See `docs/09-overlay-study-opencluely.md`
- OpenCluely is only a study reference: don't copy code or features; no process disguising

## Commands
- `bun run dev` (API + desktop), `bun run typecheck`, `bun run lint`, `bun run format`, `bun run build`
- Migrations: edit `apps/api/src/db/schema.ts` → `bun run --cwd apps/api db:generate` → `db:migrate`
- New IPC channel: `packages/shared/src/ipc.ts` → `PlatformBridge` → `apps/desktop/src/preload` → `apps/desktop/src/main/ipc.ts`
- Workspace packages are TS source; in electron-vite they go in `externalizeDeps.exclude`
- Overlay: `apps/desktop/src/main/overlay/overlay-manager.ts`. Surfaces measure their own content with `useReportSize` (ResizeObserver) and main resizes the window. Moves made by code are marked in `expectedPosition` so they aren't treated as drags
- Sample pill participants: `src/renderer/shared/demo.ts` (dev only, with `VITE_OVERLAY_DEMO=1`)
- Call: the LiveKit `Room` lives in the pill (`src/renderer/pill/call/callStore.ts`, Zustand). The panel sends a `CallCommand` → main → pill; the pill publishes a `CallSnapshot` → main → panel
- Open join: `POST /join { name, viewer? }` (room `geral`; `viewer: true` = hidden watch-only token, only for someone already in the call). `OPEN_JOIN=false` turns it off. Accounts (M3) postponed
- Default API port: 7870 (`packages/shared/src/defaults.ts`; `normalizeServerUrl` adds the port)
- Sharing: `src/main/share/` (picker, `setDisplayMediaRequestHandler`, native audio via loopback-capture + koffi, viewers). The pill receives voices only (`autoSubscribe: false`); the viewer has its own connection
- Switching the source mid-stream: `CallCommand { type: 'switch-share' }` → pill `openSwitchPicker()` → `share.openPicker(ShareSwitchInfo)` (picker in switch mode) → `startShare` while sharing = `switchShare` → `ActiveShare.switchSource` (`replaceTrack` on the same publication; audio rebinds the native capture). Details in docs/02 › Switching the source
- Stream audio: main → MessagePort (forwarded by the preload via `window.postMessage`) → `pcm-player.worklet.js` (import with `?url&no-inline`: the CSP blocks data:)
- Testing without Windows: `SHARESCREEN_FAKE_SHARE_AUDIO=1` (440 Hz tone instead of native audio, dev only; `=stall` stops after 3 s per start like a dead capture, `=mute` stops for good like a silent app). `SHARESCREEN_FAKE_MEDIA=1` = Chromium fake mic/camera (dev only; use it with `dev:second`)
- Packages: `bun run package:server` (the compiled API starts the neighboring LiveKit with generated keys) and `package:desktop` (NSIS). Logs in `app.getPath('logs')`
- Testing a call on your own: `bun run livekit:dev` + `bun run dev` + `bun run dev:second` (separate profile via `--profile=`)
- Renderer dependencies only in devDependencies (Vite bundles them); desktop `dependencies` = only main's native modules
- Roles: owner = whoever joins from the server PC (through the host app, see Security); admin = promoted by the owner. Authorization only on the server (`apps/api/src/services/roles.ts`); LiveKit attributes (`role`, `avatar`, `serverMic`, `serverAudio`) are only for the UI
- Moderation: `POST /moderate` with the call token in `Authorization: Bearer`. "Mute for me" is local, by name (`src/renderer/shared/localMutes.ts`)
- People list: `people` window (`src/main/overlay/people-window.ts`), receives the `CallSnapshot` and sends `CallCommand` like the panel
- Profile and theme: `src/main/settings/settings-store.ts` (profile.json, theme.json in userData) → `ProfileChanged`/`ThemeChanged` to every window. Every page calls `startTheme()`; new CSS colors = tokens/`color-mix`, never fixed hex
- Languages: new UI text ALWAYS in both dictionaries (`packages/shared/src/i18n/pt-BR.ts` and `en.ts`, same keys); in the renderer `useT()`, outside React `translateNow()`; in main `src/main/i18n.ts`. API errors come back as codes, not sentences
- Hosting and discovery: `src/main/network/` (HostService, DiscoveryService). Discovery port 7871/UDP (`DEFAULT_DISCOVERY_PORT`); the server confirms with `GET /info`
- RNNoise: `pill/call/noise.ts` (wasm and worklet with `?url&no-inline`; the pill CSP has `'wasm-unsafe-eval'`). Sounds: `pill/call/sounds.ts` (WebAudio, no files)

- Product name: **Accord** (installer, windows, tray, text). Internal packages stay `@sharescreen/*`, and localStorage keys and the discovery protocol keep the `sharescreen` prefix
- Icons: `apps/desktop/resources/` (original `logo.svg`, app `icon.png`/`icon.ico`, `tray.png`/`tray@2x.png`)
- Building for Windows from Linux works with wine + wine32 (NSIS runs the uninstaller under wine) and `@koromix/koffi-win32-x64` present in node_modules

- Channel password: header `x-accord-password` (`PASSWORD_HEADER`); the password lives in `apps/api/src/services/session.ts` (env `SHARESCREEN_PASSWORD` on start; `POST /session/password` only from the host's app, with the host key)
- Chat: the server keeps it in memory + a temp folder (`routes/session.ts`) and announces through the room (`sendData`, topic `accord.chat`); the pill stores messages (`pill/call/chat.ts`) and publishes `ChatState` → main (`overlay/chat-window.ts`) → `chat` window (`expanded`/`mini` modes). The chat window posts straight to the server with the token
- Host migration: `pill/call/migration.ts` (queue by `joinedAt`, `addrs` attribute), `main/network/session-mirror.ts` (copy every 10 s in userData/sessao-copia) and `HostService.start({ restore: true })` → env `SHARESCREEN_RESTORE`
- Voices play through WebAudio (`webAudioMix`): volume, deafen and "mute for me" use `participant.setVolume`, never `<audio>.muted`
- Automatic updates: `src/main/updater.ts` (electron-updater, GitHub). Publishing: `docs/12-publishing-a-release.md`
- Invites: `packages/shared/src/invite.ts` (`accord://join?h=&n=&k=` with the invite key, never the password; and the `site/convite/` page on GitHub Pages, which only forwards). Main: `src/main/invites.ts` (protocol, `second-instance`) → `InviteReceived` → `panel/InviteCard.tsx`. `CallSnapshot.server` gives the URL/name/key of the current call
- Quality in the viewer: `renderer/viewer/quality.ts` (`getRTCStatsReport` every 1 s + the streamer's `connectionQuality`); Data saver = `setVideoQuality(LOW)` (the 360p simulcast layer)
- CI and release: `.github/workflows/` (`ci.yml`; `release.yml` publishes on a pushed `v*` tag matching the desktop version, or from Run workflow with "Publish"; `pages.yml` publishes `site/`). Actions are pinned to full commit SHAs; Dependabot updates them
- Security (docs/14): token without `canUpdateOwnMetadata`/`canPublishData`; name/photo/addrs through `POST /me`; owner and host routes require `SHARESCREEN_HOST_KEY` (main injects `x-accord-host-key` into the app's requests to 127.0.0.1); password stored only as a hash; invite = `invite:<key>` in the password header; `services/security.ts` (limits, bans, Host header)
- Ending the session: `HostService.stop('end' | 'handoff')` → `POST /session/end`; room notices on topic `accord.session` (`ended`, `handoff`, `invite-rotated`)
- Voice shortcuts: `main/hotkeys.ts` (GetAsyncKeyState on Windows, globalShortcut elsewhere), hotkeys.json in userData; PTT = `track.enabled` in the pill. Tests: `SHARESCREEN_FAKE_HOLD=1` lets you turn the mode on and the shortcut comes through `CallCommand { type: 'ptt' }`
- Pointing: viewer → `POST /pointer` → topic `accord.pointer` → pill (if streaming) → `PointerWindow` (`pointer` page) + `Pings` in the viewer
- Mini stream: `ViewerManager.toggleMini` swaps the window (frameless, `focusable: false`, content protection); lock = `setIgnoreMouseEvents`
- Stream health (M12): `pill/call/shareMonitor.ts` (sender stats every 2 s + viewer reports → `shareStats`/`shareAdvice` in the snapshot), `panel/StreamHealth.tsx`. Viewer → `POST /stream-report` → topic `accord.stream-report` only to the streamer. Codec: `ShareRequest.codec` (`auto` = H.264 if `mediaCapabilities` says powerEfficient, else VP8). Live quality change: `ActiveShare.retune` (applyConstraints + setParameters). Speed test: `GET/POST /speedtest` (8 MB max, 1 per 20 s). Firewall: `main/network/firewall.ts` (netsh check, elevated PowerShell to create)
- Cloud hosting plan: `docs/15-cloud-server.md` (Oracle Always Free, Caddy + DuckDNS, admin key instead of loopback owner)
- Windows: `disable-features=CalculateNativeWinOcclusion` keeps overlay windows from "freezing" after lock/idle
- Crash recovery (docs/16 P1): `overlay-manager.ts` reloads the pill on `render-process-gone` (gives up at 2 in 5 s or 3 in 2 min, `crash-guard.ts`); `call-recovery.ts` rejoins with `CallCommand { type: 'join', resume: true }`, and the pill reuses its token from `sessionStorage` (`sharescreen.call.resume`) so the identity stays the same
- Helper processes (P3): `process-watch.ts` logs `child-process-gone`; 2 GPU crashes in 1 min offer a restart without hardware acceleration (`gpu.json`, tray › Help)
- Stream audio watchdog (P4): `ShareService` restarts the native capture after 10 s without chunks and sends `SHARE_AUDIO_STATUS` over the same MessagePort at 15 s (`sharing.audio = 'quiet'`)
- Capture protection (P6/P7): never call `setContentProtection` directly; use `protectWindow(win)` (follows the "Hide Accord from captures" switch, `capture.json`) or `protectWindow(win, { always: true })`. `app.capabilities()` says what the PC supports (stream audio and capture exclusion need Windows build 19041)
- Electron fuses are set in `electron-builder.yml` (`electronFuses`): no run-as-node, NODE_OPTIONS or --inspect in the packaged app, so Playwright `_electron` only works on dev builds; drive packaged builds over `--remote-debugging-port`

## Conventions
- Apache 2.0 license (`LICENSE`, `NOTICE`); contributions through PRs reviewed by the maintainer (`CONTRIBUTING.md`, `.github/CODEOWNERS`, `SECURITY.md`); `main` is protected (PR + review + CI, squash only, admins bypass)
- Documentation in English (README, `docs/`, CONTRIBUTING, templates). UI in Portuguese and English (both dictionaries). Code comments may still be in Portuguese
- Mark assumptions in docs as [Hypothesis] until validated; never invent API behavior without checking the documentation
- Update `docs/` when a decision changes
- The user runs `bun install` on Windows themselves
