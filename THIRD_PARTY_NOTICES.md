# Third-party software / Software de terceiros

The Accord source code is MIT-licensed (see `LICENSE`). The installer and the server
package also ship the following third-party software, each under its own license.

O código do Accord é MIT (veja `LICENSE`). O instalador e o pacote do servidor também
levam os programas abaixo, cada um com a sua licença.

| Component | Version | License | Where |
|---|---|---|---|
| [LiveKit Server](https://github.com/livekit/livekit) (`livekit-server.exe`) | 1.13.11 | Apache-2.0 | bundled binary (server) |
| [Electron](https://github.com/electron/electron) / Chromium | 45.2.2 | MIT / BSD-3-Clause and others (`LICENSES.chromium.html` in the install folder) | app runtime |
| [Bun](https://github.com/oven-sh/bun) runtime | 1.4.4 | MIT | embedded in `accord-server.exe` |
| [livekit-client](https://github.com/livekit/client-sdk-js), [livekit-server-sdk](https://github.com/livekit/node-sdks) | 2.23.0, 2.19.2 | Apache-2.0 | app, server |
| [RNNoise](https://github.com/xiph/rnnoise) via [@sapphi-red/web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor) | 0.4.1 | BSD-3-Clause / MIT | noise suppression |
| [loopback-capture](https://www.npmjs.com/package/loopback-capture) | 4.0.0 | MIT | native share audio |
| [koffi](https://koffi.dev) | 3.3.6 | MIT | native bridge |
| [electron-updater](https://github.com/electron-userland/electron-builder) | 6.8.11 | MIT | auto update |
| [gifenc](https://github.com/mattdesl/gifenc) | 1.0.3 | MIT | GIF crop |
| [React](https://react.dev), [Zustand](https://github.com/pmndrs/zustand), [Elysia](https://elysiajs.com) | 19.3.1, 5.0.16, 1.4.30 | MIT | app, server |
| [Lucide](https://lucide.dev) icons | 1.67.0 | ISC | app |
| [Figtree](https://github.com/erikdkennedy/figtree) font | 5.3.0 | SIL OFL 1.1 | app |

Apache-2.0 requires redistributing its license text with the binary: see
<https://www.apache.org/licenses/LICENSE-2.0>. A copy is also placed next to
`livekit-server.exe` in the server package (`LICENSE-livekit.txt`).
