# 04 — Design system and overlay

## Guideline

A **dark, dense and rounded look, Discord-style**: layered blue-gray backgrounds, a blue-violet accent, green for "speaking/online" and red for "muted/live/danger".

**Limits (so it doesn't become a copy):** no Discord name, logo or mascot, no proprietary font (gg sans) and none of its icons. The join and leave sounds are our own too. The app has its own name and icon.

> **Source of truth for values:** `packages/ui/src/styles/tokens.css`. The blocks below are the original reference; the code has evolved (Figtree font, overlay material, `--frame-pad`).

## Color tokens (dark theme)

> **Reference values** for a Discord-style dark theme, to adjust freely. Everything is CSS custom properties in `packages/ui/tokens.css`, so swapping the whole palette means touching one file.

```css
:root {
  /* Surfaces (from deepest to lightest) */
  --bg-floating:   #111214;  /* tooltips, menus, overlay */
  --bg-tertiary:   #1E1F22;  /* server bar / window background */
  --bg-secondary:  #2B2D31;  /* channel sidebar */
  --bg-primary:    #313338;  /* content area */
  --bg-modifier-hover:    rgba(78, 80, 88, 0.30);
  --bg-modifier-selected: rgba(78, 80, 88, 0.60);

  /* Text */
  --text-strong:   #F2F3F5;
  --text-normal:   #DBDEE1;
  --text-muted:    #949BA4;
  --interactive:        #B5BAC1;
  --interactive-hover:  #DBDEE1;

  /* Brand and status */
  --brand:         #5865F2;
  --brand-hover:   #4752C4;
  --status-green:  #23A55A;  /* speaking / online / connected */
  --status-yellow: #F0B232;  /* reconnecting / away */
  --status-red:    #F23F43;  /* muted / live / danger */

  /* Overlay */
  --overlay-bg:    rgba(17, 18, 20, 0.82);
  --overlay-blur:  12px;

  /* Shape */
  --radius-sm: 4px;  --radius-md: 8px;  --radius-lg: 16px;  --radius-pill: 999px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px;

  /* Typography */
  --font-sans: "Noto Sans", "Segoe UI", system-ui, sans-serif;
  --font-size-xs: 12px; --font-size-sm: 14px; --font-size-md: 16px; --font-size-lg: 20px;

  /* Motion */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 120ms; --dur-normal: 200ms;
}
```

Font: variable **Figtree** (SIL OFL), bundled with the app, with no network dependency. Geometric and friendly like Discord's, and readable at 12–14 px.

**Accessibility:** normal text ≥ 4.5:1 against the background. Status is never conveyed by color alone: muted also has an icon, and speaking also has a ring.

## Icons

**[Decision] Lucide** (ISC license): rounded strokes that match the style. 20 px in controls and 14 px in badges.

| Action | Lucide icon |
|---|---|
| Mic on / muted | `mic` / `mic-off` |
| Deafen | `headphones` / `headphone-off` |
| Share screen | `monitor-up` |
| Stop streaming | `monitor-x` |
| Leave the call | `phone-off` |
| Settings | `settings` |
| Collapse / expand | `chevrons-left` / `chevrons-right` |
| Drag | `grip-vertical` |
| Voice channel | `volume-2` |
| Watch | `eye` |

## Base components (`packages/ui`)

`Avatar` (sizes 20/24/32/40/80, with speaking ring, status badge, initials fallback) · `UserPill` · `IconButton` (default/active/danger variants and tooltip) · `Tooltip` · `ContextMenu` · `Modal` · `Tabs` · `Slider` · `Toggle` · `Select` · `Toast` · `ChannelItem` · `SourceCard` (screen picker).

Required states on every interactive component: default, hover, active/pressed, focus-visible (`--brand` ring), disabled.

## Overlay — anatomy

```
 COMPACT (default)                 EXPANDED (after a click)           COLLAPSED

 ┌──────────────────────────┐     ┌──────────────────────────┐      ┌───┐
 │ ⋮ (◉ Ana         [LIVE]) │     │ ⋮ (◉ Ana         [LIVE]) │      │ ⋮ │
 │   (◉ Bruno      [muted]) │     │   (◉ Bruno      [muted]) │      │ 3 │ ← count
 │   (◎ You               ) │     │   (◎ You               ) │      │ ● │ ← green pulse if
 │    +2                    │     │    +2                    │      └───┘   someone speaks
 └──────────────────────────┘     ├──────────────────────────┤
                                  │  mic  head  scrn  leave ⚙│ ← control bar
                                  └──────────────────────────┘
  ( … ) = rounded pill per user
  ◉ = 32 px avatar     ◎ = avatar with green ring (speaking)     ⋮ = drag handle
```

**Measurements (size M) [Decision]**
- User pill: height 40 px, `--radius-pill`, padding 4 px 12 px 4 px 4 px, 32 px avatar, 14 px semibold name with `text-overflow: ellipsis` past 140 px.
- Gap between pills: 4 px. Container with `--overlay-bg` + `backdrop-filter: blur(var(--overlay-blur))` (check support in a transparent window in Spike 1), `--radius-lg` and a soft shadow.
- Control bar: 36 px round buttons; active/danger uses a `--status-red` background (muted, leave).
- "No names" mode: avatars only, stacked vertically as a narrow pill, with the name on hover.

**Behavior**
- Enters with a fade and an 8 px slide (`--dur-normal`); expanding animates the height.
- The transparent area outside the container is click-through.
- Hovering a participant shows a tooltip (name + @user); right-click opens the menu (volume, mute locally, watch the stream).
- The "LIVE" badge is clickable and opens the viewer.

## Panel attached to the pill (replaces the main window)

> The Discord-style 3-column window was **dropped**: it made the app look generic. The app is overlay-first. Principles and rules in [09-overlay-study-opencluely](09-overlay-study-opencluely.md#4-design-direction-replaces-the-generic-window).

```
 ┌──────────────────────────────┐
 │ ⋮ (◉ Ana) (◉ Bruno) (◎ You)  │  ← pill
 └──────────────────────────────┘
 ┌──────────────────────────────┐  ← panel: same material, border and radius as the pill
 │  Channels  Controls  You     │     compact tabs (12–14 px text)
 │ ──────────────────────────── │
 │  🔊 General       ◉◉ 2        │  ← current channel highlighted
 │  🔊 Games         ◉ 1         │
 │  🔊 Study                     │
 │ ──────────────────────────── │
 │  + Invite                     │
 └──────────────────────────────┘
   width 280–320 px · height from content · opens on the side with room
```

Panel tabs: **Channels** (list, join/leave, invite), **Overlay** (ghost mode, screen position, shortcuts), **You** (profile, devices, version, quit the app). Call controls (mic, deafen, share, leave) live in the pill itself, in the expanded state. On first run, the panel appears centered with login/sign-up/invite.

> What shipped: tabs Channels, You, Appearance and Overlay; the panel is 360 px wide. See [10-next-steps](10-next-steps.md).

## Screen picker

A 720×520 modal, tabs **Screens | Apps**, a grid of `SourceCard` (16:9 thumbnail, app icon and truncated title), and a footer with Quality (select), "Include audio" (toggle) and the Cancel / **Go live** (`--brand`) buttons.
