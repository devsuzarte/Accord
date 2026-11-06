# 01 — Product vision and scope

## Problem

People who play, study or work together want to talk and show their screen without the call app getting in the way. A big call window takes up space and pulls focus. The idea is for the call to live in a **small, hideable overlay**, and for screen sharing (with audio) to take two clicks.

## Value proposition

- **Discreet:** a floating pill with the participants; it disappears when you don't need it.
- **Fast:** join a channel → talk → share the entire screen or one app, with audio.
- **Your server:** whoever runs the session hosts it; the data stays with them. It can move to the cloud later.

## Personas (hypotheses, to validate in the [research](07-user-research.md))

| Persona | Context | What they need |
|---|---|---|
| **Host (session owner)** | Sets up the server for a group of friends/classmates | Start the server without knowing about networking, invite people, control who gets in |
| **Gamer participant** | Plays full screen while talking | An overlay that doesn't get in the way, push to talk, share the game with its audio |
| **Study/work participant** | Shows code, slides, an app | Share one specific window with good sharpness, without exposing the rest of the screen |

## MVP user stories

**Account**
- US01 — As a user, I want to create an account with a username, email and password.
- US02 — As a user, I want to set a display name and profile photo.
- US03 — As a user, I want to stay logged in between app launches.

**Server and channels**
- US04 — As a host, I want to start the server from the app itself and create an invite.
- US05 — As a participant, I want to join the server through an invite link/code.
- US06 — As a host/admin, I want to create, rename, reorder and delete voice channels.
- US07 — As a user, I want to see who is in each channel before joining.

**Voice**
- US08 — As a user, I want to join and leave a voice channel with one click.
- US09 — As a user, I want to mute my mic and deafen, including through a global shortcut.
- US10 — As a user, I want optional push to talk.
- US11 — As a user, I want to see who is speaking (green ring on the avatar).
- US12 — As a user, I want to adjust each person's volume just for me.
- US13 — As a user, I want to choose input and output devices.

**Overlay**
- US14 — As a user, I want to see the participants (photo + name) in an always-visible pill overlay.
- US15 — As a user, I want to hide/collapse the overlay and reopen it by click or shortcut.
- US16 — As a user, I want to click the overlay to open the controls (mic, deafen, share, leave).
- US17 — As a user, I want to drag the overlay and have it remember its position.
- US18 — As a user, I want the overlay **not to show up** in my own stream.

**Screen sharing**
- US19 — As a user, I want to choose between the **entire screen** or **one app/window** (never a browser tab).
- US20 — As a user, I want the **audio** to go along: the system's (entire screen) or only the app's (window).
- US21 — As a user, I want to choose the quality (resolution/FPS).
- US22 — As a participant, I want to see who is streaming and open the stream in its own window (resizable, full screen, stream volume).

## In the MVP

Everything in the user stories above, on **Windows 10 2004+ / 11**, with the server running on the host's machine (LAN or remote access through a mesh VPN/port forwarding).

## Out of the MVP (backlog)

- Text chat, direct messages, friends
- Multiple servers per account (like Discord's server list); in the MVP, **1 instance = 1 server**
- Camera/webcam
- macOS and Linux (the architecture already allows it; see [risks](06-risks.md))
- Advanced noise suppression (RNNoise), voice sensitivity with a gate
- Call recording
- End-to-end encryption (E2EE)
- Managed, multi-tenant cloud hosting
- An overlay injected into exclusive full-screen games (the MVP is an "always on top" window, which works with games in **borderless window** mode)

> Since then, some of these shipped: temporary text chat (M9), RNNoise (M5) and push to talk (M11). See [10-next-steps](10-next-steps.md).

## MVP success metrics

| Metric | Initial target [Decision] |
|---|---|
| Time from "open the app" to "talking in a channel" (user already logged in) | ≤ 10 s |
| Clicks to start sharing a window with audio | ≤ 3 |
| Simultaneous participants per channel without degrading (host on a home network) | 5 (measure) |
| RAM use with the overlay active and in a call | measure in Phase 0 and set a budget |
| Success rate in the overlay usability test | ≥ 80% of tasks without help |
