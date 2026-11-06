# 05 — Roadmap

> **Current order of work:** [10-next-steps](10-next-steps.md). With the layout approved, real voice comes before accounts, to see the app working sooner. The phases below still serve as a task list and definition of done.

Sizes are relative (S/M/L); real durations depend on your availability. Each phase ends with something **usable** and **measured**.

## Phase 0 — Technical spikes (do these first)

Throwaway code, one repository/folder per spike. The goal is to answer the architecture's **[Hypotheses]**.

| # | Spike | Question to answer | Done when |
|---|---|---|---|
| S1 | Overlay (pill + panel) | Full checklist in [09-overlay-study-opencluely](09-overlay-study-opencluely.md#spike-s1-checklist-derived-from-this-study): content-sized, `screen-saver` level without polling, doesn't steal the game's focus, `setContentProtection`, drag/snap, attached panel, ghost mode, `backdrop-filter` | A GIF of the pill over a game without stealing focus + an OBS capture without the pill |
| S2 | Capture + LiveKit | Our own picker with `desktopCapturer` → `getDisplayMedia` → publish to `livekit-server --dev` → another instance watches. Measure CPU/RAM at 720p30 and 1080p30. Viewer in a separate window: a second connection or forwarding the track? | Two instances on the LAN, one streaming and the other watching |
| S3 | Screen audio | (a) Does `audio: 'loopback'` echo the call's voices? (b) Does `loopback-capture` capture by PID inside Electron? Does it have an exclude mode? (c) Latency and sync of PCM → AudioWorklet → track published as `ScreenShareAudio` | Streaming a window with only its own sound, no echo |
| S4 | Host network | `livekit-server` + API running as child processes; connecting from outside through Tailscale and through port forwarding (7880 TCP, 7881 TCP, 7882 UDP). Is connecting from the app to `ws://` without TLS accepted? | A friend on another network joins and talks |
| S5 | PTT | `globalShortcut` doesn't detect the key release. Test `uiohook-napi` | PTT working with the game in focus |

> **S1 status:** the mechanics are implemented in `apps/desktop/src/main/overlay/` and were tested on Linux (content-sized, snapping, attached panel, corners, ghost mode). The checklist still needs to run on **Windows**: game focus, `screen-saver` level, `setContentProtection` in OBS, dragging with `focusable:false` and apps running as administrator.
>
> **S5 status:** settled in M11 with `GetAsyncKeyState` through koffi instead of `uiohook-napi` (no new native dependency, and the key still reaches the game).

**Phase 0 output:** update [02-architecture](02-architecture.md) and [06-risks](06-risks.md) with the results, and replace each [Hypothesis] with [Verified] or a new decision.

## Phase 1 — Foundation (M)
- [ ] Turborepo + Bun workspaces monorepo; `packages/config` (tsconfig, eslint, prettier)
- [ ] `apps/desktop` with electron-vite, 3 renderer entries, `PlatformBridge` preload, Electron security
- [ ] `packages/ui`: tokens + Avatar, IconButton, Tooltip, Modal, Toggle, Slider, Toast
- [ ] `apps/api`: Elysia, Drizzle + SQLite, migrations, auth (register/login/refresh/logout), `/me`, avatar
- [ ] Pill + panel (from S1) as the app shell; login, sign-up and profile inside the panel
- [ ] CI (GitHub Actions): lint + typecheck + build
- **Done:** create an account, log in, change the photo, reopen the app and still be logged in.

## Phase 2 — Channels and voice (L)
- [ ] Channel CRUD + roles; the panel's Channels tab
- [ ] `/channels/:id/join` → LiveKit token; `CallStore`; join/leave/switch channels
- [ ] Mic with processing, mute/deafen, speaking indicator, per-user volume
- [ ] Device selection and switching; mic test
- [ ] LiveKit webhooks → in-memory presence → WS → updated list
- [ ] Global shortcuts (mute/deafen) + PTT (S5 result)
- [ ] Join and leave sounds
- **Done:** 3 people on the LAN talking and switching channels, with correct presence for everyone.

## Phase 3 — Overlay (M)
- [ ] Overlay window (S1 result); `UserPill`; collapsed/compact/expanded states
- [ ] Control bar wired to the `CallStore`
- [ ] Drag, edge snapping, remember the position per monitor
- [ ] Overlay settings (opacity, size, names, maximum visible)
- [ ] Toasts in the overlay; "you're muted" warning
- [ ] Ghost mode (full click-through) through a shortcut
- **Done:** play a whole match using only the pill, without the overlay stealing the game's focus a single time.

## Phase 4 — Screen sharing (L)
- [ ] Source picker (Screens | Apps), quality presets, audio toggle
- [ ] Publish video (simulcast) + audio (S3 addon, or plan B)
- [ ] LIVE badge, stop and switch source, automatic end when the window closes
- [ ] Viewer: window, full screen, volume, subscription only on demand
- **Done:** share an app with its own sound and the other side watches full screen, with no echo.

## Phase 5 — Host mode and invites (M)
- [ ] Package `livekit-server.exe` + the compiled API (`bun build --compile`)
- [ ] `HostService`: start/stop, generate keys, UDP mux 7882, logs
- [ ] Invites (create, revoke, expire, use limit) + `sharescreen://` protocol
- [ ] Connection assistant: LAN / Tailscale / port forwarding, with a reachability test
- **Done:** someone with no technical knowledge creates the server and a friend in another city joins through the link.

## Phase 6 — Polish and delivery (M)
- [ ] NSIS installer, icon, code signing (optional; without it SmartScreen warns)
- [ ] Auto-update through GitHub Releases
- [ ] Reconnection, error states, messages (see the `ux-copy` skill), logs and diagnostics
- [ ] Measure RAM/CPU/network again against the Phase 0 budget
- [ ] Overlay usability test ([07-research](07-user-research.md)) and fixes
- [ ] Accessibility review (contrast, focus, screen reader in the main window)
- **Done:** a v0.1.0 installer handed to 5–8 testers.

## After the MVP (suggested order)
1. Text chat in channels
2. 1080p60 + codec choice (H.264/VP9/AV1, depending on hardware)
3. Noise suppression (RNNoise through WASM) and voice sensitivity
4. Multiple servers per account
5. Cloud deploy (VPS + TLS, or LiveKit Cloud), Postgres and Redis
6. macOS (CoreAudio Tap / ScreenCaptureKit) and Linux (PipeWire)
7. Evaluate Tauri + LiveKit Rust SDK if Electron's weight becomes a real problem

## Definition of done (applies to every task)
- Typecheck and lint pass; no `any` at IPC/API boundaries
- Loading, empty and error states handled in the UI
- Tested on Windows 11 (and on 10 22H2 when touching capture/audio)
- `docs/` updated if a decision changed
