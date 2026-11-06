# 14 — Security: what someone could do to the others

Review of 2026-11-05 (version 0.4.0). Accord has no central server: whoever hosts opens an
API (port 7870) and LiveKit (7880) on their own PC, and friends join through the network, Radmin or
Tailscale. This page lists who could attack whom, what was fixed and what remains a risk.

## Who could attack

1. **Someone on the same network or VPN, without the password** (shared house, LAN house, an open Radmin network).
2. **Someone inside the call** (has the password or an invite) who decides to cause trouble.
3. **A website open in the host's browser.** The browser can also reach `127.0.0.1:7870`.
4. **Whoever got a leaked invite link** (a screenshot, the wrong group).
5. **The host.** When you join someone's server, that person sees what passes through it.

## What was open and got fixed in 0.4.0

| Risk | Before | Now |
|---|---|---|
| Posing as the owner | The token let the app itself change the call attributes (`canUpdateOwnMetadata`). Anyone could give themselves the owner crown, change their name to someone else's or announce another IP for migration | The token no longer allows it. Name, photo, "deafened" and addresses go through `POST /me`, which checks everything on the server |
| Same name as someone else | You could join as "Ana" with Ana in the call | A repeated name coming from another PC is refused (`name-taken`). From the same PC it's allowed (it's the person coming back) |
| Watching hidden | Anyone with the password could ask for a "watch only" token, which is invisible in the list, and see streams without showing up | The watch token is only issued to someone already in the call (they send their own token) and carries their name |
| A website becoming the owner | A request from `127.0.0.1` became owner and could change the password. A site in the host's browser could join as owner, disconnect people and remove the password | The app starts the server with a random key (`SHARESCREEN_HOST_KEY`) and only the app's own requests carry it. Without it, there's no owner role, no password change and no ending the session |
| DNS rebinding | A site made its own domain point to 127.0.0.1 | A request from the host's PC with a domain name in `Host` is refused (only IPs, `localhost`, `.local` and `*.ts.net`) |
| Guessing the password | Unlimited attempts | 8 wrong passwords in 5 minutes lock that IP. `/join` also has a per-minute limit |
| Password in plain text | The password sat in plain text in the server's memory, on the disk of whoever keeps the session copy and inside the invite link | The server keeps only the hash (scrypt). The session copy carries the hash. The invite carries an **invite key**, never the password |
| Leaked invite | The link had the password: the only fix was changing it | **Make a new link** (Host tab) invalidates old invites without affecting anyone in the call. Changing the password also creates a new key |
| "Disconnect" with no effect | The person joined again right away and the old token still read the chat for 6 hours | Disconnecting revokes the token in the API, drops the person's watch connections and blocks the IP for 15 minutes (never the server PC's own) |
| Viruses through chat | Any file went through | Programs and scripts (`.exe`, `.bat`, `.ps1`, `.lnk`, `.msi`, `.js`, `.vbs`, `.scr`, `.iso` and others) are refused by the app and the server |
| Flooding the chat or the disk | No rate limit; profile photos stayed on the host's disk forever | Per-person limits (8 messages every 10 s, 12 attachments per minute, 3 markers per second). Photos now live in the session folder, capped at 150 MB, and disappear at the end |
| Migration to any IP | The migration queue followed whatever address each person announced | Only home network or VPN addresses (10.x, 172.16–31.x, 192.168.x, 100.64–127.x, 26.x, 25.x), and the new server must belong to **the same session** (`session` in `/info`) |
| Who is in the call, without the password | `/info` showed everyone's name and photo to anyone on the network | On a locked channel, `/info` shows only how many people are there |
| Fake messages in the room | Participants could publish data to the room | Nobody publishes data (`canPublishData: false`). Chat, session notices and markers only count when they come from the server |
| Leftovers on disk | The session copy could stay behind if the app closed mid-call | It's deleted when the app opens |
| Browser permissions | Any page loaded in a window got the microphone and the screen | Only the app's own pages, and only the permissions it uses (`windows/permissions.ts`) |

Tested with three instances (see docs/10, M11): no password → 401; from the host PC without the app
key → member role; changing the password without the key → 403; `Host: evil.com` → 403; watching
without a token → 401; `.exe` → 415; invite with the right key → 200, wrong key → 401; a repeated
name from another IP → 409; guessed password → 429 after 8 attempts; disconnected → old token 401
and joining again 403.

## What remains a risk

- **The API and the voice signaling don't use their own encryption (HTTP and `ws://`).** The voice
  and screen themselves are encrypted (WebRTC always uses DTLS-SRTP). But the password on `/join`,
  the tokens, the chat and the attachments travel in plain text. On **Tailscale** the tunnel is
  encrypted (WireGuard). On **Radmin VPN** [Hypothesis] the tunnel is too, according to the vendor.
  **On a shared local network** (shared house, LAN house, public Wi-Fi), someone capturing the
  traffic can read the chat and get the password. A possible next step, free: the host generates
  its own certificate and the invite carries its fingerprint (the app checks it).
- **The host sees everything that passes through the server**: each person's IP, the chat, the
  attachments, who is streaming. They could record it. That's the price of not having a central
  server: only join servers run by people you trust.
- **Your IP is visible to people in the call** (the network or VPN address, for migration), and to
  the host.
- **Files that aren't programs can also be dangerous**: Office documents with macros, PDFs, `.zip`
  files with something inside. The block only catches what runs directly.
- **Links in the chat** open in the browser. Link scams are still possible.
- **Attachments are reachable by their address** `/chat/files/<id>` during the session, without a
  token. The id is random and long (144 bits): only someone who saw the message knows it. They
  disappear when the session ends.
- **Disconnecting blocks the IP, not the person.** Behind the same IP (CGNAT, same house) other
  people are also locked out for 15 minutes. With another IP, the person comes back.
- **A server started outside the app** (`accord-server.exe` by hand): without the app key, the old
  rule applies (owner = a request from the host's own PC).
- **Global shortcuts** are read with `GetAsyncKeyState`, which sees the whole Windows keyboard. The
  app only compares it with the chosen keys and neither stores nor sends anything.

## Where it lives in the code

- API: `apps/api/src/services/security.ts` (limits, bans, app key, `Host`),
  `services/auth.ts` (token), `routes/me.ts`, `routes/pointer.ts`, `services/session.ts`
  (password hash, invite key).
- App: `main/network/host-service.ts` (app key, end/hand over), `main/windows/permissions.ts`,
  `renderer/pill/call/callStore.ts` (`updateMe`, session notices), `pill/call/migration.ts`.
