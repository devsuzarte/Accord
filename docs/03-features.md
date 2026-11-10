# 03 — Features and acceptance criteria

Each item has an ID (`F-xx`) so it can become a task/issue (or an OpenSpec change).

## Account and authentication

**F-01 Sign-up**
- Fields: username (3–32, `[a-z0-9_.]`), email, password (≥ 8), display name.
- The first sign-up on a new server becomes **owner**; the following ones need a valid invite.
- ✅ Acceptance: a duplicate username or email shows the error on the field; the password never shows up in a log.

**F-02 Login and persistent session**
- The refresh token is stored with Electron's `safeStorage` (encrypted by the OS).
- ✅ Acceptance: closing and reopening the app keeps you logged in; logout revokes it on the server.

**F-03 Profile and avatar**
- Upload png/jpg/webp ≤ 5 MB, square crop on the client, and the server generates 128 and 256 px.
- No photo: an avatar with initials and a color derived from the id.
- ✅ Acceptance: changing the photo updates the other participants' overlay in ≤ 2 s (WS event + LiveKit metadata).

## Server, invites and channels

**F-04 Create a server (host mode)**: see [architecture](02-architecture.md#host-mode-self-hosted-by-the-session-owner).
- ✅ Acceptance: on a clean Windows, from the click to a ready server with an invite in ≤ 15 s; the server stops when the app closes (or stays in the tray, if configured).

**F-05 Join through an invite**
- A `sharescreen://join?...` link or a code pasted by hand.
- ✅ Acceptance: an expired, revoked or used-up invite shows a clear message.

**F-06 Manage channels** (owner/admin)
- Create, rename, reorder (drag), delete and set a people limit.
- ✅ Acceptance: the change shows for everyone in real time; deleting an occupied channel disconnects whoever is in it, with a notice.

**F-07 Channel list with presence**
- The **Channels** tab of the panel attached to the pill: voice channels with their participants (small avatar, name, mute/deafen/live icons).
- ✅ Acceptance: the list updates without reloading when someone joins, leaves, mutes or starts streaming.

**F-08 Roles**
- owner > admin > member. Admins manage channels and invites, kick and ban.

## Voice

**F-09 Join and leave a channel**
- Click the channel (in the panel) → connects → the panel collapses and the pill shows the participants.
- Switching channels = leaving one and joining the other, without closing the app.
- ✅ Acceptance: from click to audio in ≤ 2 s on the LAN; short join/leave sound (our own sounds, not Discord's).

**F-10 Microphone**
- `getUserMedia` with `echoCancellation`, `noiseSuppression` and `autoGainControl` on by default (can be turned off in settings).
- Mute, deafen (deafen also mutes) and push to talk.
- ✅ Acceptance: the mute state shows for others in ≤ 500 ms; the global shortcut works with another app in focus.

**F-11 Speaking indicator**
- A green ring on the avatar while `participant.isSpeaking`, in the overlay and the channel list.

**F-12 Per-user volume**
- Right-click the participant → a 0–200% slider (local only) and a local mute option. Saved by `user.id`.

**F-13 Devices**
- Choose input/output, with a mic test (level meter) and an output test (test sound).
- Switching devices during the call without reconnecting.

**F-14 Reconnection**
- Network loss → LiveKit tries to reconnect; the overlay shows "Reconnecting…" (yellow).
- ✅ Acceptance: a drop of up to 10 s recovers with no user action.

## Overlay

**F-15 Overlay window (pill)**: technical details in [09-overlay-study-opencluely](09-overlay-study-opencluely.md#3-overlay-architecture-in-sharescreen)
- Transparent, frameless, **exactly the size of its content**, always on top (`screen-saver`), off the taskbar, **non-focusable** and **excluded from capture** (`setContentProtection(true)`).
- Optional ghost mode (full click-through) through a shortcut.
- ✅ Acceptance: clicking the pill during a game in a borderless window doesn't take focus from the game; outside the pill nothing is blocked; the pill doesn't show up in your own stream.

**F-16 Overlay states** (visual details in [04-design-system](04-design-system.md))
1. **Collapsed:** just a "handle" with the people count and a green pulse if someone is speaking.
2. **Compact (default):** a vertical pill of participants, each with avatar + name.
3. **Expanded:** compact + a control bar (mic, deafen, share, leave, gear).
- Click the participant group → expands. Click outside or `Esc` → back to compact. Global shortcut → toggles hidden/visible.

**F-17 Position and appearance**
- Drag by the handle; snaps to screen edges and corners; remembers the position per monitor.
- Settings: opacity (40–100%), size (S/M/L), show names (yes/no), maximum visible people (after that, "+N").
- **[Hypothesis]** Fade automatically after X s with nobody speaking.

**F-18 Notifications in the overlay**
- A short, discreet toast: "So-and-so joined", "Someone started streaming", "You're muted" (when speaking while muted, if the audio level crosses the threshold).

## Screen sharing

**F-19 Source picker**
- Our own modal with two tabs: **Screens** and **Apps**, with thumbnail, icon and title. Browser tabs don't appear (the API doesn't even offer them).
- Filters out the app's own window and the overlay.
- Options: quality (preset), "Include audio" (on by default).
- ✅ Acceptance: at most 3 clicks from "Share" to streaming.

**F-20 Stream audio**
- Entire screen → system audio **excluding the app itself** (no echo of the voices).
- Window → audio from **only that process** (and its children).
- ✅ Acceptance: with music playing in one app and a video in another, sharing window A streams only A's sound; the call's voices never go back to viewers.

**F-21 While streaming**
- A red "LIVE" indicator on your own avatar; a "Stop" button; switching sources without stopping.
- If the shared window closes, the stream stops on its own, with a notice.
- ✅ (0.6.0) Switching sources: the ⇄ button opens the picker in switch mode. Viewers keep the same track and don't reconnect (see [02](02-architecture.md) › Switching the source).

**F-22 Watching a stream**
- "LIVE" badge on the participant → click → opens the viewer (a normal window: resizable, full screen with `F11`/double click, its own stream volume, a leave button).
- Shows the streamer's name and the viewer count (after the MVP: viewer list).
- ✅ Acceptance: whoever didn't open the viewer does **not** receive the video (saves bandwidth).

## Camera (0.6.0)

**F-23 Turning on the camera**
- A camera button on the pill turns it on or off during a call. The camera is always **off** when you join.
- Any video input the system shows works:
  - the laptop's built-in webcam;
  - a USB camera;
  - a **phone shown as a webcam**: on Windows 11 with Android 10+, Settings › Bluetooth & devices › Mobile devices › "Use as connected camera"; other phones need a webcam app.
- Accord has no phone app.
- Panel › Channels › **Camera**:
  - pick the device, with a local, mirrored preview that never goes through the network;
  - the preview shows by itself while the camera is on;
  - switching the device while it's on doesn't take the camera off air.
- Quality: 720p at 30 fps with 180p and 360p layers (simulcast + dynacast).
- Errors are explained:
  - Windows privacy blocked the camera;
  - no camera found;
  - another app is using it.
- ✅ Acceptance: from "turn on" to the others seeing your camera on in a few seconds. Turning it off releases the device (the camera light goes off).

**F-24 Watching someone's camera**
- A camera icon next to the person in the people list (and "See camera" in the right-click menu) opens a window with their camera. It's the same viewer as streams, with full screen and mini mode, but no pointing and no stream reports.
- The camera and the screen of the same person can be open at the same time.
- If the person turns the camera off, the window says so. If they turn it back on, it comes back in the same window.
- ✅ Acceptance: whoever didn't open the window does **not** receive the camera video. The pill only receives voices.

**F-25 Camera moderation**
- The owner can **turn off someone's camera for everyone**. The server removes the permission to publish the camera, and the person can't turn it back on until the owner allows it. It's saved by name, like the mutes, and survives a host migration.
- The owner's own camera can't be blocked.

## Settings and system

**F-23 Settings:** account, voice (devices, PTT, processing), shortcuts, overlay, streaming (default quality), server (host), "Start with Windows".
**F-24 Tray:** the icon changes with the state (disconnected / in a call / muted / live).
**F-25 Installer and updates:** NSIS through `electron-builder`; auto-update (`electron-updater`) with releases on GitHub.
**F-26 Logs:** a rotating file in `%APPDATA%/Accord/logs` and "Copy diagnostics" to report errors.
