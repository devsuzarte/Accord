# 11 — Research: noise suppression and Discord login

Researched on 2026-11-04. Legend: **[Verified]** = confirmed in the cited source · **[Hypothesis]** = likely, validate in a test before it becomes code.

---

## 1. Noise suppression

### What the app already uses
The microphone is already captured with `noiseSuppression`, `echoCancellation` and `autoGainControl` on: that's WebRTC/Chromium's native processing. **[Verified]** LiveKit's documentation recommends leaving these on when you're not using "advanced" noise cancellation. It removes constant hiss, but lets mechanical keyboards, strong fans and street noise through.

### Options evaluated

| Option | How it works | License | Works with our self-hosted server? | CPU cost | Quality |
|---|---|---|---|---|---|
| **Native WebRTC** (current) | A classic filter inside Chromium | — | Yes | Very low | Basic |
| **Noise gate** | Cuts sound below a volume | MIT (`@sapphi-red/web-noise-suppressor`) | Yes | Negligible | Only silences between phrases |
| **Speex** (preprocess) | Classic DSP in WASM | MIT (same package) | Yes | Low | A bit better than native |
| **RNNoise** | A small neural network (Xiph), in WASM in an AudioWorklet | MIT (`@sapphi-red/web-noise-suppressor` 0.4.1) | Yes, runs on the speaker's PC | Low/medium | Good for keyboards and fans |
| **DeepFilterNet3** | A bigger AI model, in WASM + ONNX | Apache-2.0 or MIT (`deepfilternet3-noise-filter` 1.3.0) | Yes | **Higher** (the README gives no numbers) | The best of the open ones |
| **Krisp** (`@livekit/krisp-noise-filter`) | Krisp's commercial model on the client | LiveKit's terms | **Doesn't work for us.** The documentation presents Krisp as a feature "for LiveKit Cloud customers" | Medium | Very good |
| **ai-coustics** | Processes on the server (agents) | Paid | Only in the agent SDKs (Python/Node), not in call clients | — | — |
| **NVIDIA Broadcast / Windows Studio Effects** | Lives in the system, outside the app | The vendor's | Yes (the app doesn't even know) | On the GPU/NPU | Very good |

**What I confirmed in the sources:**
- **[Verified]** `@sapphi-red/web-noise-suppressor` ships three AudioWorklet nodes: noise gate, RNNoise (based on xiph/rnnoise) and Speex (speexdsp preprocess). It has a configuration example with Vite (`?url`). MIT license, version 0.4.1.
- **[Verified]** `deepfilternet3-noise-filter` integrates with LiveKit through `audioTrack.setProcessor(filter)`, adjusts the strength with `setSuppressionLevel()`, toggles with `setEnabled()`, and the examples use 48 kHz. The README doesn't state the model size or the CPU cost.
- **[Verified]** LiveKit's Krisp is presented as a feature "for your LiveKit Cloud project". The page says nothing about self-hosted servers.

### Recommendation
A **"Noise suppression"** option in the panel's Audio section, with three levels:
1. **Default**: the native filter, as today;
2. **Strong (RNNoise)**: the new suggested default, because it's light, MIT and runs on the speaker's PC, without depending on the server;
3. **Maximum (DeepFilterNet3)**: only after measuring CPU on Windows. If it's heavy, it stays as an option "for stronger PCs".

**Implementation notes:**
- **[Hypothesis]** With RNNoise on, it's best to **turn off native `noiseSuppression`** so it doesn't filter twice, but keep `echoCancellation` on.
- The `.wasm` file and the worklet need to be real files (`?url&no-inline`), because of the same security rule (CSP) we already handled for stream audio.

> **[Decision] 2026-11-04 — implemented:** RNNoise is the default, with a "Noise suppression" switch in the Audio section (off = only Chromium's filter). With it on, native `noiseSuppression` is off and `echoCancellation` stays on. The pill page got `'wasm-unsafe-eval'` in its CSP (without it WebAssembly doesn't compile). DeepFilterNet3 stays open until CPU is measured on Windows. Code: `apps/desktop/src/renderer/pill/call/noise.ts`.
>
> **[Decision] 2026-11-04:** Discord login **is postponed**. Name and photo are now chosen in the You tab.

---

## 2. Discord login (the user's name and photo)

### Is it possible?
**Yes.** Discord has OAuth2, and the `identify` scope gives access to the logged-in user. The question is **how to do it in a desktop app without storing a secret**.

**[Verified]** in Discord's OAuth2 documentation:
- Authorization URL: `https://discord.com/oauth2/authorize`; token URL: `https://discord.com/api/oauth2/token` (accepts only `application/x-www-form-urlencoded`).
- `identify` allows calling `/users/@me` (without the email).
- The standard code exchange flow requires `client_id` **and** `client_secret`. An installed app can't hide the secret, so that flow only works with a server of ours holding the secret.
- The access token lasts 7 days (604800 s in the example) and can be renewed with `grant_type=refresh_token`.
- There's an **implicit** flow, which doesn't return a refresh token: the person has to authorize again when the token expires.

**[Verified]** in the Discord Social SDK account linking guide:
- With **"Public Client"** turned on for the app (Developer Portal), exchanging the code for a token uses a **code challenge + code verifier** (that's PKCE, although the guide doesn't use the name), **without a client secret**.
- The guide itself warns: *"Most games will not want to ship with this enabled"*.
- The examples use the C++ SDK. There are also redirect URIs for desktop and mobile.

### Possible paths

| Path | How | Pros | Cons |
|---|---|---|---|
| **A. Public Client + PKCE** (recommended) | The app opens Discord's login in the browser, receives the code on a local address (`http://127.0.0.1:<port>/callback`) and exchanges it for a token with the `code_verifier` | No secret in the app; has a refresh token | Discord advises against Public Client for most cases. **[Hypothesis]** Confirm in a test whether the plain HTTP exchange (without the SDK) accepts PKCE and whether the local address is accepted as a redirect |
| **B. Implicit flow** | The token comes straight back in the redirect address | Simple, no secret | No renewal: reauthorize every 7 days. Considered a less secure flow |
| **C. A central server of ours** | A small cloud service holds the `client_secret` and does the exchange | The full official flow | Needs a public server (the project today is self-hosted on each host) |

### How it would work in sharescreen
1. A **"Sign in with Discord"** button in the Channels tab, next to the name field, which stays for people who don't want to link.
2. After login, the app reads `/users/@me` and uses:
   - **name:** `global_name` (the display name), or `username` if there isn't one;
   - **photo:** `https://cdn.discordapp.com/avatars/{id}/{avatar}.png?size=128`. **[Hypothesis]** That's Discord's image CDN format; confirm in the "Image Formatting" reference before implementing.
3. When joining the channel, the app sends `name` and `avatarUrl`. The server puts the photo in the participant's LiveKit metadata, and the pill shows the photo instead of the initials (the `Avatar` component already accepts `src`).
4. The token is stored with Electron's `safeStorage` (encrypted by Windows) and can be removed in "You → Unlink Discord".

### Cautions
- **No fake "Sign in with Discord":** login happens on Discord's official site, in the person's browser. We never ask for the Discord password inside the app.
- Ask **only** for the `identify` scope (no email and no servers).
- The app keeps **its own name and brand**. The button follows Discord's brand guidelines.
- It needs an app created in the Discord Developer Portal (free) to get the `client_id` and register the redirect address.

---

## Sources
- [LiveKit: Noise cancellation](https://docs.livekit.io/home/client/tracks/noise-cancellation)
- [LiveKit: Enhanced noise cancellation with Krisp](https://docs.livekit.io/guides/enhanced-noise-cancellation/)
- [npm: @sapphi-red/web-noise-suppressor](https://www.npmjs.com/package/@sapphi-red/web-noise-suppressor)
- [npm: deepfilternet3-noise-filter (README)](https://cdn.jsdelivr.net/npm/deepfilternet3-noise-filter@1.3.0/README.md)
- [npm: @livekit/krisp-noise-filter](https://www.npmjs.com/package/@livekit/krisp-noise-filter)
- [Discord: OAuth2](https://docs.discord.com/developers/topics/oauth2)
- [Discord Social SDK: Account Linking with Discord](https://docs.discord.com/developers/discord-social-sdk/development-guides/account-linking-with-discord)
- [Discord Social SDK: Public Client](https://docs.discord.com/developers/discord-social-sdk/development-guides/provisional-accounts/public-client)
