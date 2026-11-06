# 06 — Risks and mitigations

| # | Risk | Prob. | Impact | Mitigation | Spike |
|---|---|---|---|---|---|
| R1 | **Participants from outside can't reach the host** (NAT, carrier CGNAT, firewall) | High | High | UDP mux on one port (7882) + ICE/TCP fallback (7881). Recommend a mesh VPN (Tailscale/ZeroTier) as the default path. An assistant with a reachability test. Behind CGNAT, port forwarding doesn't work, so the way out is a VPN or a VPS | S4 |
| R2 | **Echo:** entire-screen audio captures the call's voices | High | High | Process loopback **excluding** the app's own process tree | S3 |
| R3 | The per-process audio native addon is late or unstable | Medium | Medium | Plan B: audio only for the entire screen (with the R2 mitigation), a window without audio and with a notice; the addon comes in a later version | S3 |
| R4 | **The host's upload** can't keep up (the SFU runs at their home and every viewer uses upload) | Medium | High | Screen subscription only on demand, simulcast, moderate presets, a viewer limit per stream; measure in S2/S4; document the bandwidth needed | S2, S4 |
| R5 | The overlay doesn't stay on top of games in **exclusive full screen** | High | Medium | Communicate it: borderless-window games are what's supported. Injecting into the game is out of scope (complex and can trigger anti-cheat) | S1 |
| R6 | Click-through with `forward: true` fails in some scenarios (e.g. multi-monitor, mixed DPI) | Medium | Medium | Test with 2 monitors at different scales; alternative: toggle `ignoreMouseEvents` from a hit-test in the renderer | S1 |
| R7 | Electron too heavy for the expected "lightweight" | Medium | Medium | A budget measured in Phase 0, lean bundles, viewer on demand; Tauri as a long-term plan (UI already isolated) | S2 |
| R8 | Global push to talk (key release) needs a native hook | High | Low | `uiohook-napi` or equivalent; meanwhile, PTT in toggle mode. Settled in M11 with `GetAsyncKeyState` | S5 |
| R9 | A `ws://` connection without TLS gets blocked (secure context / mixed content) from the app's origin | Medium | Medium | Serve the renderer from a local origin that accepts `ws://`; or TLS with a self-signed certificate and pinning in the client; real TLS in the cloud | S4 |
| R10 | Security of a host exposed to the internet | Medium | High | Keys generated per install (never `devkey/secret`), sign-up only with an invite, rate limits, updates; recommend a mesh VPN. See [14-security](14-security.md) | — |
| R11 | Chromium/Windows change capture behavior (e.g. macOS switched the default to CoreAudio Tap in Electron 39) | Medium | Medium | Pin the Electron version, test capture before each update, read the release notes | — |
| R12 | Too much visual similarity to Discord (brand) | Low | Medium | Our own name, logo, font, icons and sounds; only the visual language is inspired | — |
| R14 | `setIgnoreMouseEvents(..., { forward: true })` stops working when the focused app runs as administrator (common in games) | Medium | Medium | Don't depend on hover to switch the click mode: the pill is content-sized (always clickable) and ghost mode is through a shortcut | S1 |
| R15 | The overlay steals the game's focus when clicked | Medium | High | Pill with `focusable:false` + `showInactive()`; only the panel (which has text fields) takes focus | S1 |
| R13 | Windows SmartScreen scares the user (unsigned installer) | High | Low | Instructions on the download page; code signing once distribution grows | — |

## MVP system requirements

- Windows 10 version **2004 or later** (excluding the overlay from capture and process loopback depend on it) or Windows 11
- Host: a connection with enough upload for N viewers × the preset bitrate (define the table after S2)
