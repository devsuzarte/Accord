# 10 — Next steps: from the approved layout to a working app

The pill and panel layout is **approved**. This document reorganizes the [roadmap](05-roadmap.md) to **see the app working as soon as possible**: real voice first, then screen sharing, and only then accounts, invites and polish.

Each milestone ends with something you can **use and show**. Relative sizes: S (small), M (medium), L (large).

```
 M1 Call ─► M2 Screen ─► M5 App audio ─► M6 Delivery ─► M7 Moderation ─► M8 Hosting, discovery and languages ─► M9 Chat, password and host migration ─► M10 Invites and quality ─► M11 Security and gaming     M3 Accounts
    ✅          ✅            ✅               ✅              ✅                  ✅                                      ✅                                       ✅                         ✅                 ⏸ postponed
```

> **Decision (2026-11-06):** documentation is written in **English** (README, `docs/`, CONTRIBUTING and the GitHub templates). The app itself stays in Portuguese and English.

> **Decision (2026-11-05):** the license changed from MIT to the **Apache License 2.0**, and the project opened to contributions through pull requests, reviewed by the maintainer (`CONTRIBUTING.md`, `.github/CODEOWNERS`). Versions up to 0.4.0 published as MIT stay MIT for whoever already has them.

> **Decision (2026-11-03):** M3 and M4 were postponed. (M4's invite links shipped in M10, on 2026-11-04.) Joining stays open with just a name (`POST /join`, can be turned off with `OPEN_JOIN=false`), and the default port became **7870**. The server is distributed as a one-click package that starts LiveKit along with it.

## Validation on Windows (what can only be confirmed there)

Everything below was implemented and tested on the development environment's Linux, with two instances, LiveKit 1.13.11, Chromium's fake microphone/camera and a test tone instead of native audio.

> **Validated (2026-11-04):** Benjamin used the app on Windows with real friends and **approved** it. The items below remain a checklist to repeat for each version. Automatic updates still need testing (publish a version and watch the previous one update).

- [ ] Real voice with headphones: both instances hear each other; mute and deafen
- [ ] Clicking the pill during a game in a borderless window does **not** take focus from the game
- [ ] The pill stays above the taskbar and does **not show up** in OBS or in the stream
- [ ] Sharing **one app** with audio: viewers hear only that app's sound
- [ ] Sharing **the entire screen** with audio: viewers do **not** hear the call's voices (no echo)
- [ ] Closing the shared app ends the stream on its own
- [ ] `bun run package` builds the installer and the server; the installer installs and opens; the server starts with a double click
- [ ] App memory in normal use (Tray → Help → Copy diagnostics shows the total)
- [ ] RNNoise: with a fan or a noisy keyboard, the other side doesn't hear the noise; turning the option off in Audio brings the noise back
- [ ] "Smooth" (60 fps): the log shows `captura 1920x1080 a 60 fps` and viewers see smooth motion in a game
- [ ] People list: opens next to the pill, right-click works, and Esc closes it
- [ ] App sounds come out of the headphones chosen in "Sound output"
- [ ] After Win+L, the screen turning off and Ctrl+Shift+O, the pill still responds to clicks
- [ ] A person's volume at 200% sounds louder and at 0% disappears
- [ ] Host migration with real PCs (one of them closes the app in the middle of the call)
- [ ] Automatic updates: publish a new version through GitHub Actions and watch the installed previous one update
- [ ] Invite: clicking the link in WhatsApp/Discord opens Accord with the invite card; pasting the link into "Add address" does too
- [ ] Viewer: the quality badge and the diagnosis match what you see (the streamer's bad Wi-Fi → "the bottleneck is on the streamer's side")
- [ ] Hosting from the installed app: Windows asks for firewall access for `accord-server.exe` and `livekit-server.exe`; closing the app stops both
- [ ] A second PC on the same network **and** one on Radmin VPN see the channel under "Channels found" without typing anything
- [ ] Cropping a real GIF (from the internet): the photo stays animated for the others

---

## M1 — First call (L) · ✅ implemented

> **Status (2026-11-03):** everything in the table below is in the code. Tested with two instances + LiveKit 1.13.11 + API: both see each other, remote audio plays, the speaking ring lights up, mute and deafen show on the other side (mute arrived instantly), and leaving updates the list. **You still need to test on Windows** with real headphones and a microphone, and the S1 list over a game.

**Result:** two app instances (on the same PC or two PCs on the same network) join a channel and talk by voice. The pill shows the **real** participants: green ring for whoever speaks, mute, deafen, leave.

No accounts yet: everyone types a name and joins the "General" channel. It's a development shortcut that M3 replaces.

| # | Task | Where |
|---|---|---|
| 1.1 | Download `livekit-server.exe` into `infra/bin/` and start it with `bun run livekit:dev` | `infra/` |
| 1.2 | Route `POST /dev/token { name }` → LiveKit token for the `geral` room (**today it's `POST /join`, open join also in production**) | `apps/api` |
| 1.3 | Run **two instances on the same PC** for testing: `--profile=<name>` lifts the single-instance lock and separates the data folders | `apps/desktop/src/main` |
| 1.4 | `LiveKitSession` + `CallStore` (Zustand) **in the pill**: connect, publish the microphone, play remote audio and turn events into `ParticipantState` | `src/renderer/pill/call/` |
| 1.5 | Real controls in the pill: mute, deafen (silences remote audio + mutes), leave | `Pill.tsx` |
| 1.6 | A provisional **Channels** tab: a "Your name" field + "Join General" | `Panel.tsx` |
| 1.7 | Call state in the panel too (pill → main → panel over IPC) | `shared/ipc.ts` |
| 1.8 | The sample participants leave the default path (they only appear with `VITE_OVERLAY_DEMO=1`) | `demo.ts` |
| extra | Avatar color from the name, without green/red (so it isn't confused with "speaking" and "muted") | `packages/ui` |

✅ **Done when:** two instances hear each other; the green ring follows speech; muting shows for the other in less than 0.5 s; leaving and joining again works.
⚠️ **Test with headphones.** Two instances on the same PC without headphones cause feedback.

---

## M2 — Share the screen with audio (L) · ✅ implemented

> Tested: picker (Screens and Apps tabs, "Entire screen" localized), streaming with the LIVE badge, the viewer's pill receiving **voice only** (no video), the viewer opening from the badge with video and **sound** (440 Hz tone measured in the viewer), the viewer invisible in the list, "stream ended" notice. Native Windows audio went in directly (see M5), so items 2.3/2.4 below were solved another way.

**Result:** from the pill, you pick an **entire screen** or an **app**, stream with audio, and the other person opens the stream in its own window, full screen.

| # | Task |
|---|---|
| 2.1 | **Screen picker** window (Screens · Apps tabs, thumbnails and icons; no browser tabs) |
| 2.2 | `setDisplayMediaRequestHandler` hands over the chosen source; publish the video with simulcast and the presets (text/default/game) |
| 2.3 | **Entire screen** audio: `audio: 'loopback'`. Measure whether the **call's voices echo** (Spike S3a) and record the result |
| 2.4 | **App** audio: in M2, it streams without audio, with an on-screen notice; app-only audio arrives in M5 |
| 2.5 | A real **LIVE** badge, stop, switch source, end on its own if the shared window closes |
| 2.6 | **Viewer**: open from the LIVE badge, receive video only on demand, full screen, stream volume |

✅ **Done when:** A streams a game with sound; B watches full screen; A's pill doesn't show up in the stream.

---

## M7 — Moderation, profile and appearance (L) · ✅ implemented (2026-11-04)

> Tested with two instances (one as owner through `localhost`, the other as a member through the machine's IP): photo and name change instantly for the other; the owner's menu has the 6 actions and an admin's menu on the owner only the 2 "for me" ones; mute for everyone blocks the microphone (and the member can't turn it back on); promoting to admin and disconnecting work; RNNoise turns on for the microphone; "Smooth" captured 1920×1080 at 60 fps; the theme and background image apply to every window.

| # | What | Where |
|---|---|---|
| 7.1 | **Roles:** owner = whoever joins from the server's own PC; admin = promoted by the owner. Stored only on the server | `apps/api/src/services/roles.ts` |
| 7.2 | `POST /moderate` (call token in `Authorization`): mute mic/stream audio **for everyone** (removes the publish permission, like Discord's "server mute", and holds even if the person leaves and comes back with the same name), make/remove admin, disconnect | `routes/moderate.ts` |
| 7.3 | **Mute for me** (voice and stream audio), stored by name on this PC; the muted voice stops being received | `shared/localMutes.ts`, `callStore.ts`, `Viewer.tsx` |
| 7.4 | A pill with just you and the **always-visible controls**; a **people** button opens the list beside it | `Pill.tsx`, `people/` |
| 7.5 | **Profile:** name and photo (animated GIFs included). The photo goes to the server (`POST /avatar`, name = hash) and others download it from `/avatars/…` | `ProfileTab.tsx`, `routes/avatars.ts` |
| 7.6 | **RNNoise** on the microphone (`@sapphi-red/web-noise-suppressor`, wasm + AudioWorklet at 48 kHz); with it on, Chromium's filter turns off | `pill/call/noise.ts` |
| 7.7 | **App sounds** synthesized (no files): mic, headphones, join, leave, someone arrived/left, start/stop streaming | `pill/call/sounds.ts` |
| 7.8 | **Smooth** quality: 1080p at 60 fps, ~8 Mbps, keeps the frame rate when bandwidth gets tight | `screenShare.ts` |
| 7.9 | **Appearance:** 6 palettes, 8 editable colors (the rest is derived with `color-mix`) and a background image with up to 60% opacity | `AppearanceTab.tsx`, `shared/theme.ts` |
| 7.10 | A collapsible **Audio** section, starts closed and closes again when the panel hides | `ChannelsTab.tsx` |

**Known limits:** the admin role doesn't survive leaving and joining (the identity changes on every join; the owner promotes again). Roles and blocks live in the server's memory: restarting the server resets them.

---

## M8 — Hosting, finding channels, photo cropping and languages (L) · ✅ implemented (2026-11-04)

> Tested with two instances: A hosted from the app (status "running" in ~2 s) and joined as owner; B found the channel in the list (with the PC's name, the General channel and "1 person") and joined; an invalid address shows the error; PNG and GIF photos cropped (the GIF comes out as a GIF, animated); English switches every window instantly (right-click menu included); stopping hosting ends the API and LiveKit without leaving processes behind.

| # | What | Where |
|---|---|---|
| 8.1 | **Hosting from the app**: `HostService` starts the server as a child process (installed: `resources/server/` from `package:server`; development: `bun` + `infra/bin`). Shows the addresses per network (local, Radmin, Tailscale) to hand to friends | `src/main/network/host-service.ts` |
| 8.2 | **Finding channels**: localhost and saved addresses; a UDP broadcast query on port **7871** (local network and Radmin VPN); neighbors from the ARP table; Tailscale peers; a scan of the local network's /24. All confirmed with `GET /info` | `src/main/network/discovery.ts`, `apps/api/src/services/discovery.ts`, `routes/info.ts` |
| 8.3 | **Add address** (IP or IP:port), saved to the list; a **Guide** on how to create and how to find a channel | `ChannelsTab.tsx` |
| 8.4 | **Photo cropping**: drag, zoom (slider or wheel), round crop; GIFs cropped frame by frame with `ImageDecoder` + `gifenc` (MIT), still animated | `AvatarCropper.tsx`, `shared/crop.ts` |
| 8.5 | **Languages** PT-BR and EN: dictionaries in `packages/shared/src/i18n/`, the language is saved in main and announced to every window; the server replies with error codes | `useT()` in `renderer/shared/i18n.ts` |
| 8.6 | Name only in the You tab; outside a call the pill has no collapse arrow; a 360 px panel | `Pill.tsx`, `ChannelsTab.tsx` |

### Fixes from 2026-11-04 (after the first test on Windows)

- **The panel closed when choosing a file** (photo, background): the system dialog took focus and the panel closes when it loses focus. Now the panel is "held" while the file dialog is open (`panel.hold`, `shared/filePicker.ts`).
- **GIFs stayed still**: `ImageDecoder` only counts frames after `tracks.ready`; without waiting, `frameCount` came back as 1 and the GIF came out with a single frame. Anyone who already set a GIF needs to pick it again.
- **Clicks stopped working** (mostly after Ctrl+Shift+O): the pill no longer uses `-webkit-app-region: drag` (main does the drag by following the cursor), and hiding the overlay now makes the pill invisible and "pass-through" instead of `hide()`/`showInactive()`. [Hypothesis] the cause was the transparent window's stale drag region; validate on Windows.
- **Entire screen with the app's own sound**: the capture already excludes the app's process tree (the audio service is a child of the main process). The log now shows the pids involved. [Hypothesis] the captured sound came from a second app instance on the same PC (another process tree, which Windows doesn't let you exclude along with it).
- Quality presets: 1080p at 15 fps went out, **720p at 60 fps** came in ("Light & smooth", ~4 Mbps).

**Known limits:** Tailscale doesn't relay broadcast (that's why peers come from `tailscale status`); if Radmin blocks the broadcast, the PC only shows up after some traffic with it (ARP table) or through the manual address.

---

## M9 — Chat, password, host migration, per-person volume and updates (L) · ✅ implemented (2026-11-04)

> Tested with three instances (A hosts with a password; B and C join): without the password the server refuses (401) and a wrong password shows "Wrong password"; the chat delivers text and images to everyone; mini mode shows the messages scrolling; a 150% volume applied; the session copy reached B (with the attachment) and C. Then **A's PC was killed** (app and server dead at once): B opened its own server with the copy and became owner, C reconnected to B on its own, the 2 messages and the image remained, the password too, and the conversation went on. Quitting the app the normal way stops the server it opened.

| # | What | Where |
|---|---|---|
| 9.1 | **Freeze after Win+L/idle**: Chromium's "covered window" calculation (`CalculateNativeWinOcclusion`) is off and, on unlock/resume, the windows are redrawn and brought back on top. [Hypothesis] that was the cause; validate on Windows | `src/main/index.ts` |
| 9.2 | **Automatic updates** through GitHub Releases | `src/main/updater.ts`, [12](12-publishing-a-release.md) |
| 9.3 | **Channel password** (`x-accord-password` on `/join`, `/avatar`, `/chat/*`, `/session/*`; `/info` shows `locked`) | `apps/api/src/services/session.ts` |
| 9.4 | **Temporary chat**: messages and attachments (up to 15 MB each, 300 MB per session) in memory and in a temporary server folder, deleted when it closes; notices through LiveKit data (topic `accord.chat`, only what comes from the server counts) | `routes/session.ts`, `renderer/chat/`, `main/overlay/chat-window.ts` |
| 9.5 | **Host migration** (first in, first host): the queue follows the LiveKit join order, each person's addresses in the `addrs` attribute, a session copy every 10 s (everyone keeps the text; the first 2 in line also keep the attachments) | `pill/call/migration.ts`, `main/network/session-mirror.ts` |
| 9.6 | **Per-person volume** 0–200%: voices through WebAudio (`webAudioMix`), a gain per person | `shared/localVolumes.ts` |
| 9.7 | License (MIT at the time; **Apache 2.0 since 2026-11-05**) and third-party notices | `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md` |

**Fix in 0.2.1:** leaving the call also closes the streams you were watching (before, the viewer window stayed open with its own connection), and the viewer closes on its own 4 s after the stream ends or the streamer leaves.

**Known limits of host migration:**
- If it's **your** internet that dropped (and not the host's), the app can't tell the difference and, if you're first in line, opens a server just for you. When the internet comes back, join the host's channel again.
- Promoted admins don't carry over to the new host (the role is per identity); "for everyone" mutes do.
- Messages sent in the last few seconds before the drop may be missing for whoever didn't receive them.
- It only works if the app of whoever takes over can host (firewall allowed and the server bundled in the installer).

---

## M10 — GitHub builds, invite links and quality in the viewer (M) · ✅ implemented (2026-11-04)

> Tested with two instances: A hosts with a password and copies the invite (the link came out with the network IP, not `localhost`); B opened with the `accord://` link, saw the card and joined directly, without typing the password. In B's viewer, the badge showed `720p · 20 fps`, the panel showed resolution, bitrate, loss, delay, freezes and the streamer's connection, and Data saver switched to receiving `360p · 15 fps`.

| # | What | Where |
|---|---|---|
| 10.1 | **CI** (typecheck, lint and Prettier) on every push and pull request | `.github/workflows/ci.yml` |
| 10.2 | **Automatic release**: pushing a `v0.3.0` tag builds the installer on GitHub's Windows and publishes the release with `latest.yml` (what the automatic update reads). Free on a public repository | `.github/workflows/release.yml`, [12](12-publishing-a-release.md) |
| 10.3 | **Invite links**: `accord://join?h=IP:port&n=name&k=key` (the installer registers the protocol) and the clickable version `https://devsuzarte.github.io/Accord/convite/#…`, a static GitHub Pages page that only forwards to `accord://`. The data goes after the `#`, which the browser doesn't send to any server | `packages/shared/src/invite.ts`, `main/invites.ts`, `site/convite/` |
| 10.4 | Where to copy it: **Channels → in the call → Copy invite**, a link icon in the people list and on each address in the Host tab. Pasting a link into "Add address" also opens the card | `panel/InviteCard.tsx`, `shared/CopyInviteButton.tsx` |
| 10.5 | **Quality in the viewer**: a badge with resolution, fps and color (good/unsteady/poor); a panel with bitrate, loss, delay, jitter, freezes, codec and the streamer's connection; a diagnosis of **where** the bottleneck is; Automatic or Data saver (the 360p layer) | `renderer/viewer/quality.ts`, `QualityPanel.tsx` |

**Once, on GitHub:** Settings → Pages → Source: **GitHub Actions** (without it the `https://…/convite/` link returns 404; `accord://` works the same).

**Limits:** the invite uses the first address in the order Radmin → local network → Tailscale → other VPNs; for a friend on another network, copy the one for the right address in the Host tab. (In 0.3.0 the link carried the password; since M11 it carries a revocable invite key instead.)

---

## M11 — Security, ending the session, push to talk, pointing and mini stream (M) · ✅ implemented (2026-11-05)

> Tested with three instances. **End for everyone**: the others left in under 0.4 s with "The host ended the session" (before, they kept reconnecting for almost a minute). **Hand over the host**: the next in line became host and everyone was on them within 5 s, with the same invite key. **Push to talk** (test voice from a file): the other side saw the person speaking 0 out of 24 times without holding and 24 out of 24 while holding. **Pointing**: the click in the viewer showed up on the streamer's screen (in the right place, with the name) and on the viewers' video. **Mini stream**: 480×270 in the corner, always on top, without taking focus; lock, opacity and size worked.

| # | What | Where |
|---|---|---|
| 11.1 | **Stopping hosting with people in the call** asks: **End for everyone** (the server deletes the room and everyone leaves at once) or **Hand the host over to {name}** (tells the room, the next one pulls the session copy and takes over in seconds). Quitting the app while hosting = handing over the host | `main/network/host-service.ts` (`stop('end' \| 'handoff')`), `POST /session/end`, `panel/ChannelsTab.tsx` |
| 11.2 | **Reconnecting without waiting in vain**: if the connection drops and the host's API doesn't answer within 4 s, it drops the room and moves to migration (before, LiveKit kept trying for ~50 s). LiveKit now dies together with the API (`SIGKILL`; with SIGTERM it waited for the room to empty) | `pill/call/callStore.ts`, `apps/api/src/managed-livekit.ts` |
| 11.3 | **Security audit** and fixes: see [14-security.md](14-security.md) | API and app |
| 11.4 | **Voice shortcuts** chosen by the person: mute, deafen, **push to talk** (hold) and unlock the mini stream. On Windows they're read with `GetAsyncKeyState` (koffi): the key still reaches the game and side mouse buttons work. Outside Windows, only mute/deafen | `main/hotkeys.ts`, `panel/VoiceShortcuts.tsx`, `packages/shared/src/keys.ts` |
| 11.5 | In push to talk the microphone stays published and sends silence outside the shortcut (`track.enabled`): no delay to open and no mute icon flickering for the others. A **PTT** badge on the pill, lit while holding; adjustable release delay | `pill/call/callStore.ts` |
| 11.6 | **Pointing on the screen**: a click on the viewer's video → `POST /pointer` (the server checks who it is and limits the rate) → a marker with the name on the streamer's screen (a transparent window that isn't part of the stream) and on the viewers' video. Can be turned off in Overlay | `routes/pointer.ts`, `main/overlay/pointer-window.ts`, `renderer/pointer/` |
| 11.7 | **Mini stream over your game**: a button in the viewer. A frameless window in the corner, always on top, without taking focus from the game and out of the stream. Drag by the bar, 3 sizes, opacity and **lock** (clicks pass through; unlock with the shortcut or from the tray) | `main/share/viewer-manager.ts`, `windows/viewer.ts`, `renderer/viewer/Viewer.tsx` |

**Limits:** [Hypothesis] games in exclusive full screen may cover the mini stream and the markers (like the pill); in borderless full screen they work. [Hypothesis] a game running as administrator may hide the keyboard from Accord (push to talk doesn't respond); running Accord as administrator fixes it. Pointing at a streamed **window** uses the window's position on Windows; outside Windows it only works for the entire screen.

### To test on Windows (M11)
- [ ] Stop hosting with friends in the call: "End for everyone" removes everyone at once; "Hand the host over" moves everyone to the next one
- [ ] Push to talk with a key and with a side mouse button, with a game in front (the key still works in the game)
- [ ] Mute/deafen through the shortcuts with the game in focus
- [ ] Pointing on an entire screen and on a window (the marker lands in the right place, including with 125%/150% scaling on Windows)
- [ ] Mini stream over a game in borderless full screen; lock and unlock with the shortcut

---

## M3 — Accounts, channels and presence (L)

**Result:** the panel stops being provisional: sign-up, login, photo, multiple channels and the list showing who is in each channel before joining.

| # | Task |
|---|---|
| 3.1 | API: sign-up, login, refresh and logout (argon2id); refresh stored with `safeStorage` |
| 3.2 | Panel: login/sign-up, profile and avatar (the first user becomes the server owner) |
| 3.3 | Channels: create, rename, reorder, delete; `POST /channels/:id/join` → token. **Restricts `/join`** |
| 3.4 | Presence: LiveKit webhooks → API → WebSocket → Channels tab in real time |
| 3.5 | Per-person volume (in the people list's right-click menu) — shipped in M9 |
| 3.6 | Push to talk with a native keyboard hook (Spike S5) — shipped in M11 |

✅ **Done when:** three people with accounts switch channels and everyone sees the right presence without reloading.

---

## M4 — Friends outside your network (M)

> **Partial:** invite links came in M10. The connection assistant is still missing.

**Result:** you click "Create my server", send a link and a friend in another city joins.

| # | Task |
|---|---|
| 4.1 | `HostService`: the app starts `livekit-server` and the API (compiled to `.exe`) as child processes, with keys generated per install and UDP on a single port (7882) |
| 4.2 | Invites (expiration, use limit, revoke) + `sharescreen://join?...` links |
| 4.3 | Connection assistant: detects the **Radmin** (`26.x`) and **Tailscale** (`100.x`) IPs, fills in the address and tests whether the friend can reach it |
| 4.4 | Solve the connection without TLS (`ws://`) coming from the app (risk R9) |

✅ **Done when:** a friend outside your network joins through the link, talks and watches your screen.

---

## M5 — App-only audio, without echo (M) · ✅ implemented (validate on Windows)

> Done with the **loopback-capture** package (MIT, a ready N-API binary for Windows x64, nothing to compile): `start(pid)` for one app and `startSystemAudio(cb, process.pid)` for the entire screen excluding sharescreen itself. The window's PID comes from `GetWindowThreadProcessId` (through **koffi**). The PCM goes from main to the pill through a `MessagePort` → AudioWorklet (`pcm-player.worklet.js`) → a `ScreenShareAudio` track. To test outside Windows: `SHARESCREEN_FAKE_SHARE_AUDIO=1` swaps the capture for a 440 Hz tone (development only).
>
> **Known limitation:** Microsoft Store/UWP apps run inside another process (ApplicationFrameHost), so "only the app's sound" may come out silent for them.

| # | Task |
|---|---|
| 5.1 | A native addon with WASAPI process loopback: **include** the chosen process (window) or **exclude** the app itself (entire screen) |
| 5.2 | PCM → AudioWorklet → a track published as `ScreenShareAudio` |

✅ **Done when:** sharing window A streams only A's sound, and the call's voices never go back to the viewers.

---

## M6 — Delivery (M) · ✅ implemented

> - **One-click server:** `bun run package:server` builds `release/accord-server/` with `accord-server.exe` (compiled API) + `livekit-server.exe` + `LEIA-ME.txt`. The API starts LiveKit with keys generated on first run (`dados/chaves.json`) and shows the machine's IPs. Tested on Linux: two instances talked through the package.
> - **Installer:** `bun run package:desktop` (NSIS, x64). Packaging tested on Linux (`--linux dir`): the app opens from the `.asar`, joins the server, the AudioWorklet loads from `file://`, native modules stay outside the `.asar`.
> - **Logs and diagnostics:** `%APPDATA%/Accord/logs/main.log` (rotates at 1 MB), window errors included; tray → Help → Copy diagnostics / Open logs folder.
> - **Error messages** without developer commands.
> - **Memory measurement (Linux, no GPU, with the picker open):** ~890 MB summing every process (the "working set" counts shared memory more than once). Possible next optimizations: create the panel only when it first opens; measure again on Windows.
> - **Pending:** a usability test with 5–8 people ([07](07-user-research.md)). Automatic updates shipped in M9.

NSIS installer with an icon, automatic updates, error handling and reconnection, logs and "copy diagnostics", an overlay usability test ([07](07-user-research.md)), an accessibility review, RAM/CPU measurement. **Done when:** v0.1.0 is installed by 5–8 testers.

---

## Windows validations that go with the milestones

The Spike S1 list ([09](09-overlay-study-opencluely.md#spike-s1-checklist-derived-from-this-study)) goes **into M1**: with a real call, test over a real game that focus doesn't change, that the pill stays above the taskbar and that it doesn't show up in OBS.

## What needs to come from you

| When | What |
|---|---|
| M1 | Headphones for testing; run `bun install` + `bun run dev` when I say so |
| M2 | A game or video to test entire-screen audio |
| M4 | A friend or a second PC **outside your network**, with Radmin or Tailscale installed |

## Outside these milestones (backlog)

Camera, multiple servers per account, macOS/Linux, cloud ([02](02-architecture.md#migrating-to-a-scalable-server)).
