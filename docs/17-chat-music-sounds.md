# 17 — Full chat window, music room and sounds (0.7.0)

Status: implemented, waiting for testing on Windows with real friends. Items marked
[Hypothesis] still need to be checked there.

## 1. Full chat window

The chat now has a real window (taskbar, resize, maximize) besides the mini overlay.

- **Layout**: sidebar (channel, `# chat` and `music` areas, people in the call, what is playing,
  your user bar with mic/deafen/settings/leave) + a centered reading column (max 840 px) with a
  large rounded composer at the bottom, in the spirit of Discord + ChatGPT.
- **Title bar**: `titleBarStyle: 'hidden'` + `titleBarOverlay` (system buttons drawn by Windows,
  colored from the theme, updated on theme change). The X only hides the window.
- **Mini overlay**: still exists; it shows while the full window is not in focus.
- **Messages**: grouping, day separators, replies, reactions (quick ones on hover + any emoji),
  copy text, jump to latest, @mention highlight, lightbox, drag & drop / paste files.
- **Formatting** (`markdown.tsx`, builds React nodes, never HTML): `**bold**`, `*italic*`,
  `~~strike~~`, `` `code` ``, fenced code blocks, `> quote`, `||spoiler||`, links, `@name`,
  `:server_emoji:`. Emoji-only messages render large.
- **Autocomplete**: `:` → emojis (server + Unicode, PT-BR/EN names via emojibase-data),
  `@` → people in the call.

### Emojis

- Unicode list from `emojibase-data` (MIT), lazy-loaded (~800 KB). Emojis newer than Emoji 15 are
  hidden because Segoe UI Emoji on Windows shows them as boxes.
- **Server emojis**: anyone in the call uploads PNG/GIF/WebP up to 512 KB with a `:name:`
  (`[a-z0-9_]{2,32}`), max 120. Stored in `SHARESCREEN_DATA_DIR/emojis` on the host (they persist
  across sessions on that PC; they don't travel with host migration). The uploader (by name) or
  the owner/admins can delete. Type is checked by magic bytes.

### GIFs

- **Tenor is gone**: Google shut the Tenor API down on June 30, 2026. Providers: **KLIPY** (free
  API, default) and **GIPHY**.
- The host pastes a key in *Channels → Host → GIFs in chat*. It is stored in `gifs.json` in
  userData, passed to the server as `ACCORD_GIF_PROVIDER` / `ACCORD_GIF_KEY`, and applied live
  with `POST /gifs/config` (host key only). Clients never see the key.
- Search goes through `GET /gifs/search` (40/min per person). The server remembers what it
  returned (6 h); sending a GIF posts only `{ provider, id }` and the server fills in the URLs.
  Nobody can push an arbitrary image URL (tracker) as a "GIF".
- [Hypothesis] KLIPY response shape (`data.data[].file.{hd,md,sm,xs}.{gif,webp}.{url,width,height}`,
  `type: "ad"` items skipped, `locale=br|us`, `content_filter=medium`) was taken from open-source
  integrations, because the official docs only render with JavaScript. Validate with a real key.
- Privacy note: GIF images load straight from the provider's CDN, so it sees the viewer's IP.

## 2. Watching streams

- Clicking a person who is streaming opens the stream (people list row, chat sidebar row,
  viewer strip tile) — no need to hit the LIVE badge.
- The viewer **never closes by itself**. When the streamer stops it shows a *paused* card (their
  photo/GIF on a blurred background) and resumes automatically when they stream again. If the
  streamer leaves and comes back with the same name (new identity), the window follows them.
  Connection errors show *Try again*.
- **People strip** under the video, Discord-like: one card per person with the avatar (GIFs
  animate) over a blurred copy of itself, green ring when speaking, mic/deafen icons, LIVE badge;
  clicking another streamer opens their stream. Toggle in the top bar, remembered locally.
  Data comes from the pill's `CallSnapshot` (main forwards it to viewer windows).

## 3. Music room

Research summary (Nov 2026):

- **YouTube**: the IFrame Player API is the allowed path. Developer Policies forbid separating
  audio from video (III.I.7), downloading/caching (III.E.1), background players (III.I.9) and
  modifying the player (III.I.6); the embed needs a viewport of at least 200×200 and the API
  client must identify itself through the HTTP Referer. YouTube sent cease-and-desist letters to
  the Groovy and Rythm Discord bots (2021) for streaming YouTube audio into voice channels.
- **Spotify**: there is no Jam API, and Spotify said it will not come to the Web API. Since
  Feb 2026, Development Mode apps need a Premium owner and allow 5 users; Extended Quota needs a
  registered company and 250k MAU. The Developer Policy forbids one-source-to-many-listeners
  apps and mixing Spotify content with other services. The Web Playback SDK does not support
  Electron. So Accord only shares a **Jam invite link**.
- **No reverse engineering** is used or planned (private Spotify endpoints, librespot, yt-dlp).

Design:

- The server keeps the queue, votes, current song and its clock (`startedAt`, `pausedAt`,
  `duration`) and broadcasts `MusicState` on topic `accord.music`. Nothing audio goes through
  the call.
- Each person listens in the **player window** (`main/music/player-window.ts`, page `music`):
  small, always on top, resizable, content-protected, with the official IFrame player (video
  always visible, `controls: 0`, YouTube ads play normally). It estimates the server clock offset
  (`GET /music`, round trip / 2, every 2 min) and seeks when it drifts more than 1.5 s.
- Next song = most votes, ties by arrival. Skip: owner/admins/whoever queued it skip at once;
  others vote (half of the call, rounded up). Modes: *Everyone* (anyone pauses/seeks) and
  *DJ only*. Ended/unplayable (100/101/150) reports advance the queue; an early "ended" (< 5 s)
  is ignored. The first player to load reports the duration.
- Links: watch, youtu.be, shorts, music, embed, live. Title/thumbnail via public oEmbed; 401/403
  = not embeddable (refused). Without internet on the server the song still enters.
- **Referer**: the packaged app loads pages from `file://` (no Referer → YouTube error 153).
  `main/music/youtube.ts` sets `Referer: https://devsuzarte.github.io/Accord/` on the embed
  sub-frame request only, through `network/request-headers.ts` (Electron allows a single
  `onBeforeSendHeaders` per session; the host-key injection now uses the same module).
  [Hypothesis] confirm in the installed app.
- Permissions now check the requesting frame, so the YouTube iframe gets no mic/screen access.
- **Spotify Jam card**: someone pastes an `open.spotify.com` / `spotify.link` invite; everyone gets
  a *Join the Jam* button that opens their own Spotify. The queue and sync live in Spotify.

## 4. Sounds

- All sounds are synthesized (no third-party files, nothing from Discord). New actions: someone
  started/stopped streaming, message sent, mention (`@you` or a reply to you), reaction to your
  message, song queued, push-to-talk press/release (off by default), reconnecting/reconnected.
- Packs: *Accord* (default), *Soft* (bells), *8-bit*. Volume slider.
- Per action: mute, preview, or replace with your own audio file (≤ 400 KB, first 4 s), stored in
  `sounds.json` in userData. Panel: You → Audio → App sounds.

## 5. New API routes

| Route | Who | Notes |
|---|---|---|
| `POST /chat/react` | call token | toggle; only real emoji or `:server_emoji:` |
| `GET/POST /emojis`, `DELETE /emojis/:name`, `GET /emojis/:file` | call token (file: public) | 10 uploads/min |
| `GET /gifs/status`, `GET /gifs/search` | call token | 40/min |
| `POST /gifs/config` | host app only | key never leaves the server |
| `GET /music`, `POST /music/{queue,vote,remove,control,ended,duration,mode,jam}` | call token | mode: owner/admin |

## 6. Next steps

- Test the player in the packaged app (Referer / error 153) and a real KLIPY key.
- Possible: YouTube playlist import (needs a YouTube Data API key), a soundboard, message
  editing/deleting, emoji migration with the session copy.
