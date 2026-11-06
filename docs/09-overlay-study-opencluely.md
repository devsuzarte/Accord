# 09 — Study: how OpenCluely builds its overlay and what we took for sharescreen

**Source studied:** [TechyCSR/OpenCluely](https://github.com/TechyCSR/OpenCluely), commit `0a9da75` (2026-07-29), Apache-2.0 license, Electron 29.
**Scope:** only the overlay mechanics (windows, transparency, clicks, position, shortcuts, capture). None of OpenCluely's features (LLM, OCR, transcription) enter the project, and no code is copied: the study is a reference to reimplement things our own way, in TypeScript.

Files read: `src/managers/window.manager.js` (1824 lines, the heart of the overlay), `main.js` (global shortcuts and IPC), `index.html` + `src/ui/main-window.js` (the bar), `preload.js`, `src/core/config.js`.

Legend: **[Verified]** = confirmed in Electron's documentation · **[Observed]** = it's in OpenCluely's code · **[Decision]** = our choice.

---

## 1. How OpenCluely builds the overlay

### 1.1 The bar is a window exactly the size of its content
**[Observed]** The main window is a 28 px tall bar, frameless and transparent. The renderer measures the bar element (`getBoundingClientRect`) and asks main, through IPC (`resize-window`), to adjust the size with `setContentSize(width, height)`. When a popover opens, the height grows to fit it.

That leaves **almost no transparent area**: the window is the bar itself. It doesn't need click-through most of the time, because there's no "empty space" for the click to pass through.

### 1.2 Window options
**[Observed]** The combination used for the bar:

| Option | Value | What for |
|---|---|---|
| `frame` | `false` | no title bar |
| `transparent` + `backgroundColor` | `true` + `'#00000000'` | 100% transparent background |
| `hasShadow` | `false` | no system shadow around the transparent area |
| `thickFrame` | `false` (Windows) | **[Verified]** removes the shadow and animations of a frameless window on Windows |
| `skipTaskbar` | `true` | doesn't show in the taskbar |
| `minimizable`, `maximizable`, `fullscreenable` | `false` | doesn't turn into a "regular window" |
| `resizable` | `true`, but `will-resize` locks the height | only the width can change with the mouse |
| `backgroundThrottling` | `false` | the renderer stays active even when hidden |
| `type: 'panel'` | macOS only | floating panel behavior |

It also cancels the `minimize` event (`event.preventDefault()`), so nothing minimizes the overlay.

### 1.3 Dragging
**[Observed]** CSS: `-webkit-app-region: drag` on the bar container and `no-drag` on the buttons. The system itself moves the window, with no JavaScript, and the drag is smooth. As an alternative, `Ctrl+arrows` moves the window 20 px when interactive mode is off.

### 1.4 Interactive mode × click-through
**[Observed]** A global mode switches all windows between:
- **interactive:** `setIgnoreMouseEvents(false)`;
- **pass-through:** `setIgnoreMouseEvents(true, { forward: true })`. Clicks go to the app behind, but mouse move events still reach the renderer.

The switch is through a shortcut (`Alt+A` / `Ctrl+Shift+I`), and a colored dot on the bar shows the current mode. The renderer is told through the `interaction-mode-changed` event.

**[Verified]** Per Electron's documentation, `forward: true` **temporarily stops working when the active window runs at a higher integrity level** (e.g. an app or game opened as administrator).

### 1.5 Always on top
**[Observed]** On Windows, it calls `setAlwaysOnTop(true)` without a level and **reinforces it repeatedly**: on `blur`, `show`, `focus` and `restore` (with 50/200/500 ms delays) and in a `setInterval` every 3 s. On macOS, it tries the levels `screen-saver` → `pop-up-menu` → `floating` in order.

**[Verified]** Per the documentation: on Windows, levels from `floating` up to `status` sit **below the taskbar**; from `pop-up-menu` up, **above the taskbar**. `setAlwaysOnTop(true)` without a level uses `floating`. That's why OpenCluely has to keep reinforcing it.

### 1.6 Hiding from capture
**[Observed]** `setContentProtection(true)` on every window.
**[Verified]** On Windows, this calls `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`. On Windows 10 2004+ the window disappears from capture; on older versions, a black rectangle shows up. It doesn't work on Linux.

**[Observed]** There's also a "sharing mode" that hides the windows and throws them to `(-10000, -10000)`. But the code itself notes that `desktopCapturer.getSources()` **can't detect whether another app is sharing the screen**, so this detection doesn't really work.

### 1.7 Several pre-created windows "attached" to each other
**[Observed]** All windows (bar, chat, answer, settings) are created at startup and stay hidden; showing and hiding is instant. The answer window is **"attached" right below the bar**, with a 10 px gap (`positionBoundWindows`): when the bar moves, both move together, always kept within the monitor's `workArea`.

### 1.8 Showing without switching desktops
**[Observed]** `showOnCurrentDesktop()`: turns on `setVisibleOnAllWorkspaces(true)`, calls `show()` + `focus()` and then turns "all desktops" off.
**[Verified]** `setVisibleOnAllWorkspaces` **does nothing on Windows**.

### 1.9 Global shortcuts
**[Observed]** `globalShortcut.register` with `CommandOrControl+Shift+<key>` and `Alt+<key>`, all registered in one place. `unregisterAll()` on quit.

### 1.10 Process disguise
**[Observed]** It renames the process and the app to "Terminal ", swaps the Dock icon and the window titles. It's so the app **passes itself off as another program**.

---

## 2. What we take, adapt and drop

| # | Technique | Decision | How it works in sharescreen |
|---|---|---|---|
| 1 | Window sized to content (`setContentSize` from the DOM) | **Take** | The pill measures itself with `ResizeObserver` (not with `setTimeout`, like OpenCluely) and asks for the size over IPC. State changes (collapsed → compact → expanded) just resize |
| 2 | `frame:false`, `transparent`, `#00000000`, `hasShadow:false`, `thickFrame:false`, `skipTaskbar` | **Take** | The same. The shadow comes from CSS inside the container, not from the system |
| 3 | `-webkit-app-region: drag` | **Take** | The pill's handle is `drag`; avatars and buttons are `no-drag`. On release, it snaps to the nearest edge and saves the position per monitor. (Later replaced by an IPC drag, see M8 in [10-next-steps](10-next-steps.md).) |
| 4 | Moving with the keyboard | **Adapt** | An optional shortcut to send the pill to a corner (after the MVP). It doesn't take `Ctrl+arrows`, which games use |
| 5 | Global pass-through mode through a shortcut | **Adapt** | See 3.2: the default is always clickable, because the window is small. Full click-through comes as an optional "ghost mode", through a shortcut, with a visual cue |
| 6 | `forward:true` to detect hover | **Use with care** | We don't depend on it, because of the limitation with apps running as administrator (common in games). See risk R14 |
| 7 | `setAlwaysOnTop(true)` + reinforcing every 3 s | **Replace** | `setAlwaysOnTop(true, 'screen-saver')`, which sits above the taskbar per the documentation. Reinforced **only on events** (`blur`, `show`, `display-metrics-changed`), no `setInterval`. Measure in Spike S1 whether that's enough over borderless-window games |
| 8 | `setContentProtection(true)` | **Take, with the opposite purpose** | For us it isn't about "hiding" the app: it's so **the pill doesn't show up in your own stream** (US18). It goes on the pill and panels, not on the viewer |
| 9 | Detect sharing and hide | **Drop** | It doesn't work (the code itself admits it). And we know when the user streams, because the stream is ours |
| 10 | Pre-create every window | **Adapt** | Pre-create only the **pill** and the **panel** (opening fast matters). The viewer and screen picker are created on demand (saves RAM) |
| 11 | Windows attached to each other (`positionBoundWindows`) | **Take** | The panel opens attached to the pill, on the side with room (below/above/left/right, depending on the edge the pill is on), and moves along when dragging |
| 12 | `show()` + `focus()` | **Replace** | Pill with `showInactive()` and `focusable: false`: it **never takes focus from the game**. **[Verified]** On Windows, `focusable:false` also implies `skipTaskbar`. The panel is focusable, because it has text fields (login, channel name) |
| 13 | `backgroundThrottling:false` | **Take, only where needed** | On the pill, because it holds the call session (the LiveKit `Room`) and can't be frozen while hidden. The other windows keep the default |
| 14 | `setVisibleOnAllWorkspaces` | **Ignore on Windows** | It does nothing there; it only comes in when there's macOS |
| 15 | Blocking `minimize` | **Take** | On the pill and the panel |
| 16 | Centralized shortcuts + `unregisterAll` | **Take** | A `HotkeyService` with a user-configurable list; a shortcut conflict shows a warning instead of failing silently |
| 17 | Process disguise ("Terminal") | **Drop** | sharescreen shows up with its own name and icon in Task Manager. We don't want anything that passes itself off as another program |
| 18 | GPU off on Linux | **Doesn't apply now** | Noted for when there's a Linux version |
| 19 | `contextIsolation` without `sandbox` | **Keep ours** | We keep `sandbox: true` + an IPC allowlist |

---

## 3. Overlay architecture in sharescreen

### 3.1 Surfaces (replaces the 3-column main window)

The app becomes **overlay-first**. There's no Discord-style "app window" anymore: everything happens in small surfaces attached to the pill.

```
                      ┌────────────────────────────┐
  PILL (always)       │ ⋮  ◉ ◉ ◎ +2   🎤  🔴         │  ← window 1: overlay, non-focusable
                      └────────────────────────────┘
                      ┌────────────────────────────┐
  PANEL (on click)    │  Channels · Controls · You │  ← window 2: attached to the pill, focusable
                      │  ...                        │
                      └────────────────────────────┘
  SCREEN PICKER (modal on demand)  ·  VIEWER (normal window on demand)  ·  TRAY
```

| Window | Created | Focus | Top | Capture | Size |
|---|---|---|---|---|---|
| **Pill** | at startup, stays alive | `focusable:false`, `showInactive` | `screen-saver` | protected | from content |
| **Panel** | at startup, hidden | focusable | `screen-saver` | protected | from content, attached to the pill |
| **Screen picker** | on demand | focusable, modal | `screen-saver` | protected (doesn't show up in itself) | fixed |
| **Viewer** | on demand | normal | normal (can pin on top) | **not** protected | resizable |
| **Tray** | at startup | — | — | — | — |

Login, sign-up and creating/joining a server also happen **in the panel**, centered on screen on first run. There's no separate login window.

### 3.2 Click rule
1. **Default: always clickable.** Since the window is the size of its content, there's no dead area to pass through.
2. The small transparent margin of the CSS shadow stays out of the window: the shadow is drawn inside, with minimal `padding`.
3. **"Ghost mode"** (optional, through a shortcut): `setIgnoreMouseEvents(true, { forward: true })` on the pill, with reduced opacity and a lock icon. It's for people who want the pill over the game area. You leave it with the same shortcut (it doesn't depend on hover, because of the `forward` limitation).

### 3.3 Position
- Anchors: 4 corners + the middle of the top and bottom edges. On drag release, it snaps to the nearest anchor within 24 px, or stays free.
- Saves `{ displayId, anchor | x,y }`. If the monitor goes away, it returns to the top-left corner of the main monitor.
- The panel opens toward the side with room: pill at the top, panel below; pill at the bottom, panel above.
- Everything kept within `display.workArea`, which already excludes the taskbar.

### 3.4 Message flow (pill ⇄ main)
```
renderer (pill) ── ResizeObserver ──► ipc 'overlay:resize' {w,h} ──► main: setContentSize + reposition the panel
renderer (pill) ── click ───────────► ipc 'panel:toggle' {tab}   ──► main: position attached to the pill, showInactive/focus
main ── 'overlay:mode' {ghost} ─────► renderer: visual change (opacity, lock)
```
Every channel goes into `packages/shared/src/ipc.ts`, following the project rule.

---

## 4. Design direction (replaces the generic window)

What had been built so far, a 3-column window imitating Discord, **goes away**. What stays from Discord is the **palette**, the **rounded iconography** and the **grammar of voice**: green speaking ring, muted and "live" badges, round avatar.

Overlay principles:
1. **An object, not a window.** The pill is a physical capsule you move around the screen, not a miniature app. No title bar, tabs or menus in the normal state.
2. **Quiet by default.** Nobody speaking = a quiet, faded pill. Someone speaking = green ring and a subtle glow. Someone streaming = a red badge pulsing slowly. Motion only appears when there's information.
3. **Information on the avatar, not in text.** State (speaking, muted, deafened, live, reconnecting) comes through the ring, badge and avatar opacity. The name appears on hover or in "with names" mode.
4. **Controls behind a gesture.** Clicking the avatar group expands the controls in the pill itself. Clicking your own avatar opens the "You" panel (devices, profile). Right-clicking a participant opens volume and mute locally.
5. **The panel is an extension of the pill**, with the same material, border and radius, as if the pill "unfolded".
6. **Dense and readable over any background.** A dark, blurred material (validate in S1), a light 1 px border to stand out over dark games, text never below 12 px.

Measurements and colors stay in the tokens of [04-design-system](04-design-system.md). The next design step is to draw the pill and the panel in all three states, from these principles, before the S1 code.

---

## 5. Impact on the plan

- **[02-architecture](02-architecture.md):** windows become pill, panel, picker and viewer; the "main window" goes away.
- **[04-design-system](04-design-system.md):** the 3-column layout goes away; the pill + panel anatomy comes in.
- **[05-roadmap](05-roadmap.md):** Spike S1 gets the checklist below.
- **[06-risks](06-risks.md):** new risk R14 (`forward` with apps running as administrator).
- **Code (`apps/desktop`): done.** `OverlayManager` (`src/main/overlay/`) creates the pill and the panel; the renderer has `pill/` and `panel/`; `HotkeyService` and the tray (`tray.ts`). The list below still needs validating on Windows.

### Spike S1 checklist (derived from this study)
- [ ] Pill sized to content through `ResizeObserver` → `setContentSize`, with no transparent area left over
- [ ] `setAlwaysOnTop(true, 'screen-saver')` stays above the taskbar and a borderless-window game, **without** `setInterval`
- [ ] `focusable:false` + `showInactive()`: clicking the pill does **not** take focus from the game (the keyboard stays in the game)
- [ ] `setContentProtection(true)`: the pill doesn't show up in OBS or in the app's own capture
- [ ] `-webkit-app-region: drag` on the handle + snapping to anchors + position saved per monitor
- [ ] The panel attached to the pill opens toward the right side on all 4 edges
- [ ] Ghost mode through a shortcut works with an administrator app in focus
- [ ] `backdrop-filter` works in a transparent window on Windows 11 (otherwise, use a solid semi-transparent background)
- [ ] RAM and CPU of the idle pill measured and noted
