# 08 — References

Sources consulted on 2026-11-03 for the **[Verified]** marks.

## Electron
- [desktopCapturer: official documentation](https://electronjs.org/zh/docs/latest/api/desktop-capturer): a `setDisplayMediaRequestHandler` example with `audio: 'loopback'`; notes for macOS 14.2+ (`NSAudioCaptureUsageDescription`; CoreAudio Tap as the default from Electron 39) and for Linux/PipeWire (a single source)
- [Electron: capture exclusion support on Windows (PR #24274)](https://ayakael.net/mirrors/electron/commit/bf68405a2f2a1be6218076186118b16b74a687b5?files=docs): `setContentProtection` on Windows 10 2004+

- [BaseWindow (official documentation)](https://www.electronjs.org/docs/latest/api/base-window): `setAlwaysOnTop` levels on Windows (below/above the taskbar), the `forward` limitation with elevated integrity, `focusable:false` implies `skipTaskbar` on Windows, `thickFrame`, `setVisibleOnAllWorkspaces` has no effect on Windows

## Reference study
- [TechyCSR/OpenCluely](https://github.com/TechyCSR/OpenCluely) (Apache-2.0), commit `0a9da75`: overlay mechanics studied in [09-overlay-study-opencluely](09-overlay-study-opencluely.md). No code copied

## Tauri
- [tauri-apps/tauri issue #2600](https://github.com/tauri-apps/tauri/issues/2600): `getDisplayMedia` problems in WKWebView and WebKitGTK, with no settled fix

## Per-process audio (Windows)
- [AUDIOCLIENT_ACTIVATION_TYPE (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-audioclient_activation_type): `PROCESS_LOOPBACK` activation
- [WerdoxDev/loopback-capture](https://github.com/WerdoxDev/loopback-capture): N-API addon (MIT), capture by PID on Windows 10 2004+, s16le 48 kHz stereo PCM

## LiveKit
- [Self-hosting: running locally](https://docs.livekit.io/home/self-hosting/local/): `livekit-server --dev`, dev keys, `--bind 0.0.0.0`
- [Self-hosting: ports and firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall.md): 7880 TCP (API/WS), 7881 TCP (ICE/TCP), 7882 UDP (mux), 50000–60000 UDP, TURN 3478/5349
- [Screen sharing](https://docs.livekit.io/transport/media/screenshare.md): `createScreenTracks({ audio: true })`, `screen_share_audio`
- [client-sdk-js](https://github.com/livekit/client-sdk-js)
