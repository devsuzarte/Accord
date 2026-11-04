# 08 — Referências

Fontes consultadas em 03/11/2026 para as marcações **[Verificado]**.

## Electron
- [desktopCapturer: documentação oficial](https://electronjs.org/zh/docs/latest/api/desktop-capturer): exemplo de `setDisplayMediaRequestHandler` com `audio: 'loopback'`; observações para macOS 14.2+ (`NSAudioCaptureUsageDescription`; CoreAudio Tap como padrão a partir do Electron 39) e para Linux/PipeWire (uma única fonte)
- [Electron: suporte a exclusão de captura no Windows (PR #24274)](https://ayakael.net/mirrors/electron/commit/bf68405a2f2a1be6218076186118b16b74a687b5?files=docs): `setContentProtection` no Windows 10 2004+

- [BaseWindow (documentação oficial)](https://www.electronjs.org/docs/latest/api/base-window): níveis de `setAlwaysOnTop` no Windows (abaixo/acima da barra de tarefas), limitação do `forward` com integridade elevada, `focusable:false` implica `skipTaskbar` no Windows, `thickFrame`, `setVisibleOnAllWorkspaces` sem efeito no Windows

## Estudo de referência
- [TechyCSR/OpenCluely](https://github.com/TechyCSR/OpenCluely) (Apache-2.0), commit `0a9da75`: mecânica do overlay estudada em [09-estudo-overlay-opencluely](09-estudo-overlay-opencluely.md). Nenhum código copiado

## Tauri
- [tauri-apps/tauri issue #2600](https://github.com/tauri-apps/tauri/issues/2600): problemas de `getDisplayMedia` em WKWebView e WebKitGTK, sem solução fechada

## Áudio por processo (Windows)
- [AUDIOCLIENT_ACTIVATION_TYPE (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ne-audioclientactivationparams-audioclient_activation_type): ativação `PROCESS_LOOPBACK`
- [WerdoxDev/loopback-capture](https://github.com/WerdoxDev/loopback-capture): addon N-API (MIT), captura por PID no Windows 10 2004+, PCM s16le 48 kHz estéreo

## LiveKit
- [Self-hosting: execução local](https://docs.livekit.io/home/self-hosting/local/): `livekit-server --dev`, chaves de dev, `--bind 0.0.0.0`
- [Self-hosting: portas e firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall.md): 7880 TCP (API/WS), 7881 TCP (ICE/TCP), 7882 UDP (mux), 50000–60000 UDP, TURN 3478/5349
- [Screen sharing](https://docs.livekit.io/transport/media/screenshare.md): `createScreenTracks({ audio: true })`, `screen_share_audio`
- [client-sdk-js](https://github.com/livekit/client-sdk-js)
