# 13 — Ideas to make Accord different (nothing paid)

Discord solves "talk to anyone, anywhere". Accord can win in a smaller, more loyal niche:
**a small group of friends who play together**, want high quality and don't want to depend on
anyone's server. The ideas below lean that way. Everything fits at no cost: it runs on the user's
PC, on (public) GitHub or on Windows' own APIs.

Effort: S (days), M (one to two weeks), L (more than that).

## What already sets it apart (and is worth saying out loud)

- **1080p at 60 fps for free.** On Discord that's paid. Here the limit is the host's internet,
  not a plan. It's the line for the README and the invite page.
- **The call has no single owner.** If the host drops, the session moves to the next one in line,
  chat included. That's rare among voice apps.
- **Nothing is kept.** Chat and attachments disappear when the session ends, and nothing goes
  through a company's server.
- **Overlay-first.** It isn't a window you Alt+Tab to: it's the pill on top of the game.

## Ideas that only make sense in an overlay app

| Idea | Why it stands out | Effort |
|---|---|---|
| ✅ (0.4.0) **Point at the streamer's screen.** A viewer clicks the stream and a marker (or a scribble that fades in 3 s) appears in the streamer's overlay, on top of the game | "Look there on the minimap" becomes a click. It's the feature that best matches how friends actually share screens | M |
| ✅ (0.4.0) **Mini stream over your game.** The viewer becomes a small overlay window (non-focusable, click-through), to watch your friend's screen while you play | Today, to watch, you leave your own game | M |
| **Lower the game's volume when someone speaks.** Windows lets you control per-app volume (`ISimpleAudioVolume`, through the koffi we already use) | Discord has "attenuation", which lowers every other app together; here it could be just the game, by as much as you choose. A small difference, but daily comfort | M |
| ✅ (0.4.0) **Global shortcuts for mute and push to talk** (back then only Ctrl+Shift+O and Ctrl+Shift+G existed) | A missing basic, and even more missed in an overlay | S |
| **Automatic "Playing…".** Reads the name of the full-screen game (foreground process) and shows it in the people list and the pill | Gives context with zero setup. It stays in the session only, no history | S |

## Quality and network (building on M10)

| Idea | Why it stands out | Effort |
|---|---|---|
| **Viewers warn the streamer.** Viewers send their diagnosis (already computed in M10) through the room; the streamer sees "2 people freezing — switch to Light & smooth?" | Answers "smooth for some and bad for others" without anyone opening stats | S |
| **Network test before hosting.** Measure the upload to a friend and say how many people fit at each quality | The host is the bottleneck (their upload is multiplied by viewers). Showing that avoids frustration | M |
| **Connection assistant** (what's left of M4): check the firewall, the port and whether Radmin/Tailscale is up, with what to do in each case | Today it's the part that requires the most networking knowledge | M |
| **Light spatial audio.** Each voice slightly to the left or right (WebAudio `PannerNode`) | With 5+ people talking, it's much easier to tell who's who | S |

## Gaming session

| Idea | Why it stands out | Effort |
|---|---|---|
| **Replay of the last 30 s.** A shortcut saves the last 30 s of the stream you're watching (or of your screen) and posts it in the chat | The play just happened and everyone wants to see it again. Discord has clips for whoever records; here **viewers** can save too. All local, with `MediaRecorder` | M |
| **Quick rooms inside the channel.** "Team A / Team B" with a drag, and a button to bring everyone back together | In team games it's the thing people do most on Discord, and here it could be instant | M |
| **Watch together.** A YouTube video playing in sync for everyone (the host sends play/pause/position through the room) | A break between matches, without having to share a screen | M |
| **Export the chat at the end** (optional, one click before ending) | Keeps "nothing is kept" as the default and still lets you keep it when you want | S |
| **Captions and a call summary on your own PC** (Whisper running locally) | Private, no cloud. Useful for whoever arrives late. It's heavy; later | L |

## Distribution without spending

- **SmartScreen warning:** open source projects can apply for free code signing from the
  SignPath Foundation. [Hypothesis] check the current requirements before applying. Meanwhile,
  also publishing on **winget** (a free manifest, through a pull request) gives people an install
  route they trust more.
- **The invite page is a showcase.** Whoever gets an invite and doesn't have the app yet lands on
  the GitHub Pages page. It's worth it saying in one line what Accord is, with the download button.
- **Bug reports with diagnostics.** A GitHub issue template that asks for the "Copy diagnostics"
  text. Without telemetry, that's how we learn what breaks.

## What I'd do first

1. Mute and push-to-talk shortcuts (S): a missing basic. ✅
2. Viewers warn the streamer (S): closes the loop on the quality indicator.
3. Point at the streamer's screen (M): the feature nobody has, and it shows why the overlay exists. ✅
4. Mini stream over your game (M). ✅

## What can't be done without paying (for now)

- **Watching from the browser, without the app:** the invite page is HTTPS and the host's server is
  HTTP on an IP. The browser blocks that mix, and fixing it requires a certificate with a domain
  (Tailscale Funnel or a tunnel would solve it, but they change the "nobody's server" model).
- **Friends without Radmin/Tailscale and without an open port:** it would need a TURN server on
  the internet, which has bandwidth costs.
