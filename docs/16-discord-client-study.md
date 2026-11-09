# 16 — Study: how the Discord desktop client is built, and what Accord can take from it

**Target studied:** Discord desktop for Windows, stable `1.0.9267` (`build_info.json`), the copy installed on the maintainer's PC, read-only.
**Tool:** [REA](https://github.com/morluto/rea) `6.8.0` (`analyze-javascript-application`, `inspect-analysis-view`), plus plain reading of the extracted JavaScript.
**Scope:** only the shell around calls and screen sharing: windows, overlay, capture, crash handling, updater, Electron hardening. Static only: Discord was not launched, attached to, modified, or watched on the network.
**Rules:** no Discord code is copied into Accord. This document describes behavior so we can reimplement ideas our own way. Discord's Terms of Service restrict reverse engineering of its client, so this study stays at the level of how the app is organized, and nothing here is meant to modify or automate Discord.

Legend: **[Observed]** = in Discord's files · **[REA]** = reported by REA · **[Verified]** = confirmed in official docs · **[Hypothesis]** = not proven, needs a test · **[Proposal]** = what we would do in Accord.

---

## 1. What was analyzed

| Part | What it is | Readable? |
|---|---|---|
| `resources/app.asar` (3.4 MB) | Bootstrap: splash screen, host updater, module updater | Yes, one 3 MB bundle. REA timed out on it at 5 min; read by hand |
| `modules/discord_desktop_core/core.asar` (1.6 MB) | The main process: windows, IPC, permissions, crash handling, tray, popouts | Yes. REA analyzed it (503 modules); the semantic graph of `mainScreenPreload.js` hit REA's result budget, so only its static facts were kept |
| `modules/discord_*/index.js` | Thin JS wrappers over native addons (`.node`) | Yes. REA analyzed 28 files |
| `discord_voice.node` (22 MB), `discord_overlay2.node`, `discord_hook.node`, `discord_utils.node` … | Native code: voice/video engine, overlay, input, game detection | No. Only their JS-facing API is visible |
| `Discord.exe` | Electron executable | Fuse bytes read directly |

**[REA]** limits worth knowing: the main bundle is built with Rspack, so REA could not tie `BrowserWindow`/IPC calls inside it to Electron (it reported 0 windows for `core.asar`). It did resolve the overlay host window, the `DISCORD_*` IPC handler and the 8 native addon bindings in the loose module files. Everything below about `core.asar` comes from reading the extracted bundle.

---

## 2. How Discord is put together

### 2.1 Three layers
**[Observed]**
1. **Bootstrap (`app.asar`)**: shows the splash, updates the host (Squirrel on Windows) and then downloads the **modules** one by one. Downloads retry with a backoff of 1 s → 20 s.
2. **Desktop core (`core.asar`)**: the real main process. The main window loads the web app from Discord's servers with a preload (`mainScreenPreload.js`) that exposes `window.DiscordNative`.
3. **Native modules (`modules/discord_*`)**: each one is a folder with an `index.js` wrapper and a `.node` addon, updated on its own schedule. The wrappers read settings, pick a log folder, and declare which **features** the platform supports.

### 2.2 Feature flags declared by the native layer
**[Observed]** Every module calls `features.declareSupported('<name>')` at load time, and the web app asks before showing an option. The voice module declares, for example, `soundshare`, `screen_soundshare`, `go_live_hardware`, `simulcast`, `first_frame_callback` and `soundshare_loopback` (Windows only). On Linux it checks Wayland and VA-API before declaring `native_screenshare_picker` and `vaapi`.

### 2.3 Voice and screen sharing API (what the UI can call)
**[Observed]** in `discord_voice/index.js`. The engine is native (not Chromium WebRTC), and the wrapper shows its surface:
- **Screen source:** `setDesktopSource`, `setDesktopSourceWithOptions`, `clearDesktopSource`, `presentDesktopSourcePicker`.
- **Separate end and failure events:** `setOnDesktopSourceEnded`, `setOnSoundshare`, `setOnSoundshareEnded`, `setOnSoundshareFailed`. Audio and video report problems separately.
- **Codec fallback events:** `setOnVideoEncoderFallbackCallback`, `setOnVideoDecoderFallbackCallback`, `setVideoCodecErrorCallback`.
- **Connection:** `configureConnectionRetries(baseDelay, maxDelay, maxAttempts)`, `fastUdpReconnect`, `setPingInterval`, `setPingTimeoutCallback`, `setOnConnectionFailedCallback`.
- **Diagnostics:** `getStats`, `getFilteredStats`, `setOnFirstFrameCallback`, first-frame delivered/encrypted stats, `setRtcLogMarker`.
- **Frames only while someone watches:** video sinks are reference-counted per stream. The first viewer subscribes to frames, and the last one to leave unsubscribes. A one-shot `getNextVideoOutputFrame` gives up after 5 s.
- **Test switches:** `--use-fake-video-capture`, `--use-file-for-fake-video-capture`, `--use-fake-audio-capture`, `--use-files-for-fake-audio-capture`.
- **Logs:** voice logs capped at 5 MB by default; the media module keeps 1 file of 3 MB.

### 2.4 Screen picker
**[Observed]** The main process exposes `desktopCapturer.getSources` through IPC and **filters the requested types to `screen` and `window`**, with thumbnails and app icons. This is the same rule Accord already follows (no browser tabs).

### 2.5 Content protection (hiding Discord's own windows from captures)
**[Observed]** There is one global switch plus a **per-window override set**:
- `WINDOW_SET_CONTENT_PROTECTION` turns it on or off for every window, except the ones that have an override.
- `WINDOW_SET_WINDOW_CONTENT_PROTECTION` forces one window on. The effective value is `override || global`.
- Every **new** window gets it at creation if the global switch is on, so a window opened later can't leak into a capture.

### 2.6 The in-game overlay: two designs
**[Observed]**
- **`discord_overlay2` (injected).** An **offscreen** `BrowserWindow` renders the overlay. On every `paint`, its bitmap goes to a native module that draws it inside the game through hook DLLs (`DiscordHook64.dll`). Mouse, keyboard and IME events come back from the game and are replayed with `sendInputEvent`. The frame rate is **60 fps while the game reports a size and 1 fps otherwise**. If loading fails, it retries with a backoff of **1 s → 30 s**. If the renderer dies, the host is torn down and the game is told.
- **`discord_desktop_overlay` (not injected).** It tracks game PIDs and their focus. It creates one host window when the first game is tracked and destroys it when the last one leaves. When focus moves to a different game, it reloads the host.

**[Decision]** Accord keeps its topmost-window overlay. Injecting into games is how anti-cheat systems flag software, and it's out of scope. The focus-tracking idea from the second design is still useful (see P8).

### 2.7 Main window hardening
**[Observed]**
- `contextIsolation: true` and `nodeIntegration: false`, with **`sandbox: false`** on the main window and its embedded frame views (the preload needs Node). Accord is stricter: `sandbox: true` everywhere.
- **Popouts:** the window features a page asks for go through an **allow-list** (`width`, `height`, `left`, `top`, `resizable`, `alwaysOnTop`, `frame`, `transparent` and similar). Anything else is dropped, and the base options are fixed.
- **Navigation:** `will-navigate` is blocked unless the URL has the web app's origin. New windows are allowed only as Discord's own popouts and frame views, and a frame view also checks its owner and URL. Every other link opens in the browser through a **protocol block-list** (`file:`, `javascript:`, `data:`, `ms-msdt:`, `search-ms:`, `shell:` and others).
- **Permissions:** `setPermissionRequestHandler` approves `media` only for a short list of origins, `notifications` only for the app's origin, and denies everything else.
- **IPC from the right frame only:** capture handlers throw unless `event.senderFrame === event.sender.mainFrame`, so an embedded iframe can't start a capture.

### 2.8 Crashes and power events
**[Observed]**
- **Renderer crash (`render-process-gone`) on the main window:**
  - `killed` → quit.
  - A second crash **within 5 s** → quit.
  - Otherwise → log it and **reload** the window.
  - The window size and position are saved on `before-quit`.
- **GPU or utility process crash (`child-process-gone`):** a non-zero exit is logged. If the same kind of process crashes again **within 30 s**, it's flagged as a "frequent crash" and not reported again. `crashed` and `oom` go to the crash reporter.
- **Power:** `suspend`, `resume`, `lock-screen` and `unlock-screen` are broadcast to every window. On `resume`, the clock is re-synced with NTP.
- **Displays:** `display-added`, `display-removed` and `display-metrics-changed` re-check the window bounds.

### 2.9 Electron fuses in `Discord.exe`
**[Observed]** The fuse bytes were read directly from the executable. The order matches Electron's v1 table and REA's documentation.

| Fuse | Discord |
|---|---|
| RunAsNode | OFF |
| EnableCookieEncryption | OFF |
| EnableNodeOptionsEnvironmentVariable | **ON** |
| EnableNodeCliInspectArguments | OFF |
| EnableEmbeddedAsarIntegrityValidation | OFF |
| OnlyLoadAppFromAsar | OFF |
| LoadBrowserProcessSpecificV8Snapshot | OFF |
| GrantFileProtocolExtraPrivileges | ON |
| WasmTrapHandlers | ON |

Discord turns off `ELECTRON_RUN_AS_NODE` and `--inspect`, but leaves `NODE_OPTIONS` on and doesn't validate its ASARs. Accord currently flips **no fuses at all**, so all of them are at Electron's defaults.

---

## 3. Where Accord already matches Discord

These came up in the comparison and need no work:

| Discord does | Accord already has it |
|---|---|
| Picker limited to `screen` + `window` | Yes (`share-service.ts`) |
| Per-window content protection | Yes, on every overlay surface and the viewer |
| Navigation and new-window lockdown | Yes, and stricter: only `https://` opens outside |
| Permission request and check handlers | Yes (`windows/permissions.ts`) |
| IPC accepted only from the expected window | Yes, by `webContents.id` (`fromPill`, `fromPanel`, `isPicker`) |
| Video frames only while someone watches | Yes, the viewer connects with `autoSubscribe: false` and subscribes only to the screen track |
| Encoder fallback visibility | Yes, `shareMonitor.ts` reads `encoderImplementation` and `qualityLimitationReason` |
| Share ends when the source ends | Yes, the track's `ended` stops the share |
| Power and display events | Yes (`resume`, `unlock-screen`, `display-removed`, `display-metrics-changed`) |
| Log size cap | Yes, rotation to `.old.log` |
| Single instance | Yes |

---

## 4. Proposals for Accord, by value

| # | Proposal | Based on | Effort | Value |
|---|---|---|---|---|
| **P1** | **Recover the pill after a renderer crash.** The pill holds the LiveKit `Room`, so a crash today drops the call and leaves no pill. On `render-process-gone`: `killed` → leave it; a second crash within 5 s → show a tray notice and stop; otherwise recreate the pill and rejoin the last channel. The panel and viewers get a "reconnecting" state meanwhile | §2.8 | Medium | **High** |
| **P2** | **Flip Electron fuses** in `electron-builder.yml` (`electronFuses`): `runAsNode: false`, `enableNodeOptionsEnvironmentVariable: false`, `enableNodeCliInspectArguments: false`, `enableCookieEncryption: true`, `onlyLoadAppFromAsar: true`, `enableEmbeddedAsarIntegrityValidation: true`. **[Verified]** electron-builder 26 supports this key, and ASAR integrity works on Windows from Electron 30 (we're on 45). **[Hypothesis]** the native modules in `app.asar.unpacked` (`loopback-capture`, `koffi`) still load; must be tested on the NSIS build. Check the result with `npx @electron/fuses read --app <exe>` | §2.9 | Low | **High** |
| **P3** | **Handle `child-process-gone`.** Log GPU and utility crashes with the exit code. On repeated GPU crashes within 30 s, show a hint in the panel and offer "disable hardware acceleration on next start". **[Hypothesis]** that offer is our own idea, not Discord's | §2.8 | Low | Medium |
| **P4** | **Report "share audio stopped" separately.** Discord has separate `SoundshareEnded/Failed` events. Today a failure is reported only at start (`startAudio` returns a reason). If the captured app exits or its audio stops mid-share, the viewers just hear silence. **[Hypothesis]** to be confirmed by closing the shared app's audio during a share | §2.3 | Medium | Medium |
| **P5** | **Fake capture for local tests.** Alongside `SHARESCREEN_FAKE_SHARE_AUDIO`, add Chromium's `use-fake-device-for-media-stream` (and optionally `use-fake-ui-for-media-stream`) behind a dev-only env var. Then `dev:second` can run two instances on one PC without fighting over the mic, and so can CI | §2.3 | Low | Medium |
| **P6** | **Global content-protection switch with per-window overrides.** One setting ("Hide Accord from my own captures"), on by default. Every window created afterwards gets it at birth. The pointer window can force it on regardless | §2.5 | Low | Low |
| **P7** | **Feature flags from the main process.** One `capabilities()` call returning what this machine supports (per-app audio, hardware H.264, Windows build ≥ 2004 for capture exclusion). The UI hides what won't work instead of failing later. Today only `audioSupported` exists | §2.2 | Low | Low |
| **P8** | **Optional "follow the game" mode for the pill.** Track the foreground window's PID (we already resolve HWND → PID with koffi) and keep the pill on that window's monitor and corner. No injection | §2.6 | Medium | Low (idea) |

**What not to take:**
- injecting into games (§2.6);
- turning the sandbox off for a Node-capable preload (§2.7);
- leaving `NODE_OPTIONS` on (§2.9).

---

## 5. What was applied

P1 to P7 are in the app. P8 is still only an idea and needs a product decision first.

How it was tested: on Linux under Xvfb, with a local LiveKit 1.13.11 and the API, driving real Electron instances with Playwright (`_electron`). The packaged build (fuses on) was driven over the Chromium DevTools protocol, since `--inspect` is now off.

### P1 — Pill recovery
- `overlay-manager.ts` listens to `render-process-gone` on the pill and reloads it.
- `call-recovery.ts` remembers the last `join` and keeps the panel on "reconnecting".
  - When the reloaded pill sends its first snapshot, it asks it to join again.
  - The server URL comes from the current snapshot, so a host migration is respected.
- **[Decision]** It gives up after **2 crashes in 5 s** (like Discord) **or 3 in 2 min** (the rejoin itself takes seconds).
  - On giving up, a notification and Tray › Help › "Reload the overlay" both try again.
  - `killed` is treated like a crash, not as "quit": the app lives in the tray, so a dead pill is worse than a reload.
- **[Decision]** The rejoin **reuses the same token** (kept in `sessionStorage`, which survives the renderer crash).
  - LiveKit replaces a participant with the same identity, so the stale copy disappears at once. A fresh token left "Ana" twice in the room until LiveKit timed out the old one.
  - The role (owner/admin) is kept.
  - If the token no longer works (server restarted), the pill joins the normal way.
- **[Observed in tests]**
  - Crash mid-call → panel shows "reconnecting" → back in the call in under half a second. The other participant sees one "Ana".
  - Crash while out of a call → it doesn't join anything.
  - Two crashes in under 5 s → it gives up and leaves the call.
  - The packaged build recovers the same way.
- **Limit:** after giving up, the stale participant stays until LiveKit times it out (about 20 s), because there's no live renderer holding the token.

### P2 — Electron fuses
- Set in `electron-builder.yml`.
- **[Observed in tests]** On the Linux build:
  - `@electron/fuses read` shows them flipped.
  - `ELECTRON_RUN_AS_NODE=1`, `NODE_OPTIONS=--require …` and `--inspect` are all ignored. The unfused Electron honors run-as-node, as a control.
  - The packaged app joins a call, and RNNoise (wasm + worklet over `file://`) loads.
- **[Hypothesis]** Two things still need one check on a Windows NSIS build, because Electron only enforces ASAR integrity on Windows and macOS:
  - the ASAR integrity check itself;
  - loading `loopback-capture`/`koffi` from `app.asar.unpacked`.

### P3 — Helper process crashes
- `process-watch.ts` logs every non-zero `child-process-gone` with type, reason and code.
- **[Decision]** It offers to restart without hardware acceleration after **2 GPU crashes in 1 min**, not 3.
  - **[Observed in tests]** On the 3rd GPU crash with no software fallback left, Chromium aborts the whole app ("GPU process isn't usable. Goodbye."), so a third crash would never reach our handler.
  - [Hypothesis] On Windows with a real GPU, Chromium usually falls back to software first.
- The choice is saved in `gpu.json` and applied before `ready`. Tray › Help › "Use hardware acceleration (restarts)" toggles it.
- The diagnostics report says whether acceleration is on.
- Unlike the proposal, the offer is a notification plus the tray item, not a hint in the panel.

### P4 — Stream audio watchdog
- **[Observed]** In `loopback-capture`'s Windows source:
  - buffers below −70 dB are **never sent**, so silence produces no chunks;
  - a capture error (`OnAudioSampleRequested` failing, for example on a device change) sets the state to `Error` and **stops for good without any callback**.
  - From outside, silence and a dead capture look the same.
- What main does now:
  - restarts the capture after **10 s** without chunks, backing off to 1 min;
  - if nothing arrives by **15 s**, sends `{ type: SHARE_AUDIO_STATUS }` through the same MessagePort as the PCM;
  - the pill shows "No sound coming from the app" until chunks return. If a restart throws, the share audio becomes `failed` with the reason.
- **[Observed in tests]** With `SHARESCREEN_FAKE_SHARE_AUDIO=stall` (a dead capture), the restart brings the sound back and the streamer never sees a warning. With `=mute` (a silent app), the warning appears at about 15 s and stays, and restarts space out 10 s → 20 s → 40 s.

### P5 — Fake devices
- `SHARESCREEN_FAKE_MEDIA=1` (dev builds only) turns on `use-fake-device-for-media-stream`.
- **[Observed in tests]** Two instances join with a microphone and no error. The second one sees the first one speaking (the fake beep crosses the call), and RNNoise loads.

### P6 — One switch for capture protection
- `windows/content-protection.ts` is the only place that calls `setContentProtection`.
- **Panel › Overlay › "Hide Accord from captures"** controls the pill, panel, chat and people list, and applies to windows created later. It's on by default and saved in `capture.json`.
- These stay hidden always:
  - the picker;
  - the pointer markers;
  - the mini viewer (so a stream never shows itself).
- Only the panel can change the switch.
- **[Observed in tests]** On Linux the switch is locked with an explanation (see P7). Setting it from the panel saves it, notifies every window and survives a restart. The pill can't change it.

### P7 — Capabilities
- `app.capabilities()` returns `shareAudio`, `captureExclusion` and `hardwareAcceleration`.
- **[Decision]** Stream audio and capture exclusion both require Windows build **19041** (10 2004).
  - Microsoft documents process loopback from build 20348, but it works from 19041; GStreamer made the same call.
  - On older builds, stream audio now says so in the picker instead of failing when the share starts.

---

## 6. How to repeat this study

```bash
npm install rea-agents@6.8.0 @electron/asar
# copy (read-only) from %LOCALAPPDATA%\Discord\app-<version>\
npx rea analyze-javascript-application <copy>/modules --artifact-format directory \
  --detail summary --evidence_output modules.evidence --format json > modules.summary.json
npx rea analyze-javascript-application <copy>/modules/discord_desktop_core-1/discord_desktop_core/core.asar \
  --detail summary --evidence_output core.evidence --format json > core.summary.json
# app.asar needs --analysis-timeout-ms above 300000 (it timed out at the default)
npx asar extract <copy>/resources/app.asar app/   # then read bundle.js by hand
```

Project facts from the saved evidence with `rea inspect-analysis-view` and a `javascript-facts` view, filtering on `browser-window`, `ipc-channel`, `ipc-handler` and `native-export`.

## Sources
- [REA repository](https://github.com/morluto/rea) and its `docs/electron-fuses.md`, `docs/guides/javascript/javascript-application-workflows.md`
- [electron-builder: adding Electron fuses (v26)](https://www.electron.build/v26/docs/tutorials/adding-electron-fuses)
- [Microsoft: PROCESS_LOOPBACK_MODE](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-process_loopback_mode) and [GStreamer wasapi2: process loopback on Windows 10](https://git.fasttube.de/FaSTTUBe/GST-Tensordecoder-ov_ep/commit/c98ad6f249f72db4eb6a2bca911f3c57808b197e)
- `loopback-capture` 4.0.0 source (`src/platform/windows/LoopbackCapture.cpp`)
- [Electron: fuses](https://electronjs.org/docs/latest/tutorial/fuses)
- Discord desktop `1.0.9267` installed files (not redistributed)
