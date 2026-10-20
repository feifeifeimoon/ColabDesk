---
version: alpha
name: colabdesk-design-system
description: ColabDesk's design language — a restrained grey scale built to carry a lot of machine state on a desktop console: a light engineering surface for the shell, one saturated blue that means "action or link", every value the machine reports in mono, and a terminal panel with an axis of its own.
colors:
  # Brand and accent
  primary: "#171717"          # the single ink primary: affirmative actions, the active nav indicator
  on-primary: "#ffffff"
  link: "#0070f3"             # inline links, and the "info / healthy" semantic
  link-deep: "#0761d1"
  link-bg-soft: "#d3e5ff"
  success: "{colors.link}"    # deliberately the same value as link: there is no green in this system
  # Surface ladder, back to front
  chrome: "#ffffff"           # page frame (top bar, tab strip, panel heads)
  page: "#fafafa"             # the plane content sits on (body)
  canvas: "#ffffff"           # cards, panes, dialogs, inputs
  canvas-soft: "#f5f5f5"      # wells and insets (table header rows, empty states, inline code) — never a card
  canvas-soft-2: "#efefef"    # the second inset step (raw-output blocks, progress tracks)
  hairline: "#ebebeb"         # every 1px divider and border
  hairline-strong: "#a1a1a1"  # hover borders, focus rings, resize handles
  # Text
  ink: "#171717"
  body: "#4d4d4d"
  mute: "#888888"
  # Semantics (each has a -soft background and a -deep readable text colour, used in pairs)
  warning: "#f5a623"
  warning-soft: "#ffefcf"
  warning-deep: "#ab570a"
  error: "#ee0000"
  error-soft: "#f7d4d6"
  violet: "#7928ca"
  violet-soft: "#d8ccf1"
  cyan-deep: "#29bc9b"
  cyan-soft: "#aaffec"
  # The terminal has an axis of its own: its palettes live in terminal-themes.css, not in this table

typography:
  font-sans:
    fontFamily: Geist, Inter, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif
    note: "weights 400 / 500 / 600; 600 is the ceiling, 700 is never used"
  font-mono:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    note: "everything the machine reports: paths, times, bytes, percentages, exit codes, raw output"
  display: { fontSize: 26px, fontWeight: 600, letterSpacing: -0.96px }
  title: { fontSize: 19px, fontWeight: 600, letterSpacing: -0.6px }
  title-sm: { fontSize: 16px, fontWeight: 600, letterSpacing: -0.4px }
  copy: { fontSize: 14px, fontWeight: 400, letterSpacing: -0.28px }
  label: { fontSize: 13px, fontWeight: 400 }
  caption: { fontSize: 12px, fontWeight: 400 }
  micro: { fontSize: 11px, fontWeight: 400 }

rounded:
  xs: 4px      # code snippets, keycaps, status badges
  sm: 6px      # every control in the app: buttons, inputs
  md: 8px      # callouts, raw-output blocks, empty-state boxes
  lg: 12px     # cards, panes, table containers, work surfaces
  xl: 16px
  full: 9999px # badges, status dots

spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 24px
  "6": 32px
  "7": 40px
  "8": 48px

elevation:
  "1": "inset 0 0 0 1px #00000014"
  "2": "Level 1 + 0 1px 1px #00000005, 0 2px 2px #0000000a"   # the default card
  "3": "Level 1 + 0 2px 2px #0000000a, 0 8px 8px -8px #0000000a"  # hover and drag
  "4": "Level 1 + 0 2px 2px #0000000a, 0 8px 16px -4px #0000000a"  # floating layers
  "5": "Level 1 + 0 1px 1px #00000005, 0 8px 16px -4px #0000000a, 0 24px 32px -8px #0000000f"  # dialogs

components:
  button:
    variants: [default, primary, secondary, outline, ghost, destructive, link]
    sizes: [md 32px, sm 28px, lg 36px, icon 32px]
    rounded: "{rounded.sm}"
    note: "one primary per flow; ghost for dense rows; destructive only for irreversible actions"
  input: { height: 32px, rounded: "{rounded.sm}", backgroundColor: "{colors.canvas}", borderColor: "{colors.hairline}" }
  card: { backgroundColor: "{colors.canvas}", rounded: "{rounded.lg}", shadow: "Level 2", padding: "{spacing.5}" }
  panel: { note: "one card per section, rows divided by hairlines (not one card per row)" }
  panel-row: { padding: "{spacing.3} {spacing.5}", structure: "left: label + description; right: a mono value or an action" }
  badge: { shape: "pill", backgroundColor: "{colors.canvas-soft}", typography: "caption + mono" }
  badge-off: { note: "what this account cannot get (a machine type it may not request): {colors.mute} + strikethrough. The strikethrough carries the meaning and the colour merely agrees — the same rule as status" }
  status: { structure: "6px dot + a written label", rule: "state is never carried by colour alone" }
  callout: { backgroundColor: "{colors.link-bg-soft}", textColor: "{colors.link-deep}", rounded: "{rounded.md}" }
  metric: { backgroundColor: "{colors.canvas-soft}", rounded: "{rounded.lg}", value: "{typography.display}" }
  empty: { padding: "{spacing.8} {spacing.5}", rounded: "{rounded.md}", textColor: "{colors.mute}" }
  start-page: { layout: "one centred column (760px): brand lockup → claim → next step → actions → four capabilities (auto-fit grid) → star footer", note: "the front door and the empty state are the same screen; the name is a lockup graphic, not type, so the size ladder is unchanged; a capability line names what the user does, the mechanism goes on the description line" }
  pane: { note: "a work surface (terminal, file): chrome head + canvas body", rounded: "{rounded.lg}", shadow: "Level 2" }
  progress: { height: 4px, fill: "{colors.ink}" }
  raw-output: { backgroundColor: "{colors.canvas-soft-2}", typography: "mono", note: "collapsed but always there" }
  chart: { plot: "{colors.canvas-soft} well", bar: "{colors.ink}", unmeasured: "dashed baseline {colors.hairline-strong}", scale: "{typography.caption} + {colors.mute}", note: "bars only, and only for quantity" }
  segmented: { note: "mutually exclusive choice from a small set: a row of Buttons, the active one primary and the rest outline; used for the timeout duration and the trend granularity" }
  settings-page: { nav: "a 260px section rail (same width and colour as the left rail) + one section at a time in the body", entry: "the last row of the left rail", exit: "the rail's first row + Esc", note: "a layer, not a dialog: the terminals underneath stay mounted" }
---

## Overview

ColabDesk is a **desktop SSH console for Google Colab runtimes** — a client for a remote host, not an emulation of a local one: an interactive terminal on the left, that runtime's filesystem on the right, session management and compute-unit quota behind both. Most of its screen time is spent hosting somebody else's interface (xterm, a file listing), so its own shell should **step back and frame the content** rather than compete with it.

The language exists to solve one problem: **carrying a large amount of machine state on restrained greys**. It gives that problem a small set of answers — one ink primary for every affirmative action; a five-step surface ladder so cards *sit on* the page rather than *float above* it; and an unambiguous typographic split so that a glance tells "the product is talking" from "the machine is talking".

Three choices belong to a desktop console in particular:

1. **Regular Geist instead of a display face.** There is no marketing page here, so `display-xl` / `display-lg` are gone and the top of the ladder is the 26px `{typography.display}` — which appears only on quota figures. The start page (see "Start page") later brought back a little brand material, but **not as type**: the name is the lockup graphic from the mark, and the size ladder did not move a step.
2. **The terminal has an axis of its own.** A terminal is a picture of a *machine*, so it should not follow the reader's theme — the conclusion stands; the mechanism changed. A terminal's colours are **a palette the user picks** (`terminal-themes.css`, ten of them; `titanium` is the four old tokens, word for word), not a hard-coded dark. It does not inherit a **colour** from `data-theme`: what `ls`, `git` and `htop` put into the 16 ANSI slots is the far machine's decision, and flipping one set of values would mean having to make that one set readable in both polarities. **It does follow the polarity, by swapping in another palette** (one slot per polarity, following by default — see "Terminal palettes"): the answer to "readable in both" is a complete published palette per polarity.
3. **State semantics, re-ordered for this product.** `{colors.success}` is still the link blue ("Connected"), `{colors.warning}` is "running / connecting", and `{colors.error}` is for failures and irreversible actions only.

## Single source of truth

| Concern | Where it lives |
| --- | --- |
| Design tokens (colour, type, spacing, radius, elevation) | `src/renderer/src/assets/tokens.css` |
| Terminal palettes (ten × 21 channels) | `src/renderer/src/assets/terminal-themes.css`; the contract and clamping in `lib/terminal-appearance.ts`, the reading and resolution in `lib/terminal-theme.ts`, the OSC replies in `lib/terminal-color-reply.ts` |
| Base styles and component classes | `src/renderer/src/assets/main.css` |
| UI primitives | `src/renderer/src/components/ui/` (`Button` / `Card`·`Panel`·`PanelRow` / `Badge`·`Status` / `Field` / `Callout`·`EmptyState` / `Menu` / `PanelDivider` / `ProgressBar` / `RawOutput` / `icons`) |
| Application shell | `src/renderer/src/app-shell/AppShell.tsx` |
| Start page and brand lockup | `src/renderer/src/features/workspace/StartPage.tsx`, `src/renderer/src/app-shell/BrandLockup.tsx` |
| Settings page | `src/renderer/src/app-shell/SettingsPage.tsx` |
| Theme preference | `src/renderer/src/lib/theme.ts` |
| Feature pages | `src/renderer/src/features/*` |
| What the renderer looks like (for a person) | `npm run gallery`: runs the **real app** against the mock backend and writes pictures to `screenshots/`. **There is no image baseline** — pictures are evidence in a review, not tests |
| The regression net for design rules | Render assertions: real components + `renderToStaticMarkup` (no DOM needed, runs under `npm test`). Examples: `components/ui/icons.test.tsx` (icons must be distinguishable from each other), `features/workspace/Workbench.test.tsx` (a parked panel must be `hidden` + `inert`) |

The rules: **no hex colours in component code.** A new token goes into `tokens.css` first (both the light and the dark block), then gets referenced; its role is described in this file. **Look for a primitive before writing custom CSS.** The one exception is the terminal palette line above: that is **data** (other projects' colour tables, checkable entry by entry), its own file is full of hex, and no component writes one. `lib/terminal-theme.ts` holds a single fallback foreground colour for "the variable could not be read" — that is not a colour decision, it is the way out of a failure.

## Colors

### Surface ladder

Five steps, back to front. A card (`{colors.canvas}`) sits on the page (`{colors.page}`) and is framed by the chrome (`{colors.chrome}`) — which is why a card looks lifted without a border having to say so.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `{colors.chrome}` | `#ffffff` | `#0a0a0a` | Top bar, tab strip, panel heads |
| `{colors.page}` | `#fafafa` | `#0f0f0f` | The plane content sits on (body) |
| `{colors.canvas}` | `#ffffff` | `#171717` | Cards, panes, dialogs, inputs |
| `{colors.canvas-soft}` | `#f5f5f5` | `#0a0a0a` | Wells and insets: header rows, empty states, metric blocks |
| `{colors.canvas-soft-2}` | `#efefef` | `#262626` | The second inset step: raw-output blocks, progress tracks |
| `{colors.hairline}` | `#ebebeb` | `#ffffff14` | Every 1px divider |
| `{colors.hairline-strong}` | `#a1a1a1` | `#ffffff2e` | Hover borders, focus rings |

In dark, a border becomes translucent white (`#ffffff14`) so that "a hairline on a card" and "a hairline on the page" read the same way.

### Text

`{colors.ink}` for headings and primary text; `{colors.body}` for secondary text and table cells; `{colors.mute}` for hints, field descriptions and table headings; `{colors.on-primary}` appears only on the ink primary button.

### Accent and semantics

- **Ink** (`{colors.primary}`, light `#171717` / dark `#ededed`): every affirmative action and the active navigation indicator. In dark it flips to "light fill, dark text" by itself — the direct result of the polarity flip, not a second token.
- **Link** (`{colors.link}`): inline links, the "info" tone, and **success** — `{colors.success}` is this same blue; there is no green in this system.
- **Warning** (`{colors.warning}`): in progress, awaiting confirmation, timed out. **Error** (`{colors.error}`): failures and destructive actions.
- Every semantic colour comes as a pair: `-soft` (the fill) and `-deep` (the readable text). Callouts and badges use them together; no second palette is needed.

### Dark theme

Dark is **a polarity flip of the same ladder**: `lib/theme.ts` writes the resolved theme to `:root[data-theme]`, from the system preference (the default) or from the choice the user made (see "Theme preference"). `tokens.css` no longer holds any terminal colour: those four old tokens moved into `terminal-themes.css` as `titanium`, unchanged. **The terminal follows that flip, but what it swaps in is another palette from its own axis** (see "Terminal palettes"): flipping the interface's values is not the same thing, because the 16 ANSI slots are chosen by the far-side program for a given background.

**Hard rule: any colour a component uses must have a value in both the light and the dark block.** A colour defined on one side only is a bug waiting for "the system theme changed".

### Theme preference

- **Three states**: `system` (the default, follow the OS) / `light` / `dark`, kept in localStorage (`lib/theme.ts`). An explicit choice **beats the system**.
- **The one entry point is Settings → Appearance** ("Follow system / Light / Dark", a `segmented` control). The top bar's right end no longer carries that "the opposite of the current theme" icon button — an earlier version put it there, which made an app-wide preference a copy of itself inside the workbench, and gave one fact two entry points while settings was open.
- **How it lands**: `data-theme` is written to `<html>`, with one light and one dark block in `tokens.css`; `color-scheme` is written alongside it, so scrollbars and native controls do not stay light in the dark theme.

### Terminal palettes

The terminal is the **only surface in this product whose content somebody else draws**: what goes into the 16 ANSI slots is decided by the far-side program (`ls`, `git`, `htop`, `tmux`). Its colours are therefore not a "follow the theme" question but a **need for a complete palette** — xterm falls back to its own built-in set (light Tango) for any channel the theme does not name, which is how ANSI black and dark blue end up smeared on a dark background. That is why this axis exists. Both polarities have a palette: **ten**, seven dark and three light.

- **One axis, one attribute**: `data-terminal-theme` on `<html>` (written before the first frame in `main.tsx`, and rewritten by `setTerminalAppearance`, `setTheme` and `applySystemTheme`). Each palette is one `:root` / `[data-terminal-theme="…"]` block with 21 variables: 5 surfaces (`bg` / `fg` / `cursor` / `cursor-accent` / `selection`) plus the 16 ANSI slots. **What gets written is the resolved id**, not a field of the user's record.
- **Two slots and a switch**: settings offers "Follow the app's light/dark" plus "While dark" and "While light". Following is on by default — a light window with a light terminal is the feature — and turning it off means "always the dark slot", which is the one honest way to say "I want a dark terminal in a light window" (so a light slot holding a dark palette is a combination that does not need to exist: each slot lists its own polarity). The resolution is one pure function, `resolveTerminalThemeId(appearance, appTheme)`.
- **The resolved id is a field of the store** (`terminalThemeId`): flipping the app's polarity leaves the terminal's **record** untouched, so a pane subscribed to that record hears nothing. It subscribes to the resolved id instead, which is how it learns the palette moved. This is the easiest thing in this layer to miss.
- **Light palettes get a contrast floor**: yellow and green printed on white is the light-terminal failure, so the light palettes set `minimumContrastRatio: 4.5` (WCAG AA). The dark ones keep xterm's default of 1 — those seven are published values, and "checkable entry by entry" is their contract, which correcting them at paint time would undo.
- **The canvas and the frame come from one source**: `.terminal-area`'s background *is* `var(--terminal-bg)`, and xterm's `theme` is read from the same variables by `lib/terminal-theme.ts`. The two cannot disagree — an earlier "the canvas changed but the ring around it did not" was exactly the bug of two blacks side by side. **The same rule reaches xterm's own boxes inside the pane** (`.xterm`, `.xterm-viewport`, `.xterm-scrollable-element`): the grid is a whole number of rows and the box it sits in is not, so a sliver of whatever is painted underneath is always exposed along one edge, and xterm's own default for that is black — a colour no palette here uses.
- **`titanium` is the dark default, and it is the old look**: its five surface values are word for word the four tokens from before this axis existed (`#0a0a0a` / `#ededed` / `#aaffec` / `#262626`), so nobody who has never opened settings sees a different screen. The other nine are each project's **officially published** terminal palette, checkable entry by entry; where upstream repeats a colour on the bright row, this file repeats it too and does not "improve" it. Each of the three light ones is the light half of a family already here (Catppuccin Latte ↔ Mocha, One Half Light ↔ One Dark, Tokyo Night Day ↔ Tokyo Night).
- **`black` and `brightBlack` have different jobs**: `black` sits close to the background, and dim text is `brightBlack`'s job. **On the three light palettes that reads backwards** — `black` is the near-white slot, and Tokyo Night Day sets it all but equal to the background — which is what the contrast floor above is for: there it is not a nicety, it is what makes `black` readable at all.
- **OSC 10/11 are answered**: `bat` / `delta` / `eza` / `gh` / `fzf` ask which background they are drawing on, and xterm 6.0.0 **does not answer** (it fires the query at the host; the library ships the formatter, `toRgbString`, with no caller at all), so all of them draw for a dark one. That is the whole failure of a light terminal. `lib/terminal-color-reply.ts` hooks in through the public `parser.registerOscHandler` (handlers for one identifier run newest first and stop at the first that returns `true`, so this gets in front of xterm's own), and replies through `terminal.input(reply, false)`: the same `onData` path a keystroke takes, so the answer lands on that channel's shell and a parked tab answers correctly too.
- **What is still unanswered**: OSC 4 (indexed-palette queries, asked by `chafa` and some `fzf --color` uses) and DEC mode 2031 (a palette flip announcing itself to applications) are both missing. The first needs 16 more reply strings, the second does not exist in xterm 6.0.0 at all (it would mean intercepting `?2031h` ourselves). Both wait for someone to be affected by them; they are written down here as gaps, not as a plan.
- **Padding is a preference, not a decision of this layer**: the ring around `.terminal-host` comes from `[data-terminal-padding]`, and all three steps land on the `--space-*` scale (4 / 8+12 / 16); `normal` is the ring the terminal always had (8 by 12, slightly wider than tall). Changing it recomputes the column count — that is the terminal's own business and needs no new rule. **It is a `margin`, and that is not a style preference**: `FitAddon` sizes the grid from the **parent's** computed height and width and subtracts only the **terminal element's own** padding, while `.xterm` is `height: 100%` of the host's *content* box — so a padding on the host is measured by neither half, and the grid ends up one row taller than its box (see the invariant under "Middle: the terminal").
- **The regression net**: `lib/terminal-theme.test.ts` parses `terminal-themes.css` directly and requires all 21 channels per palette with plain hex values — `color-mix()` and friends do not evaluate inside custom properties, and xterm would silently fall back to its own light palette. It also requires the palette filed as `light` to *have* a light background (luminance, not the table's word for it), `lib/terminal-color-reply.test.ts` pins the reply strings, and an e2e case has the far side run `bg` — a fixture command that asks the question and reports the answer, so the reply is watched landing inside the program that asked.

## Typography

| Role | Size / weight | Use |
| --- | --- | --- |
| `{typography.display}` | 26px / 600 / -0.96px | Quota figures — the only large type in the product |
| `{typography.title}` | 19px / 600 | Page-level headings |
| `{typography.title-sm}` | 16px / 600 | Card and pane headings, the brand name |
| `{typography.copy}` | 14px / 400 | Body text, table cells, button labels |
| `{typography.label}` | 13px / 400 | Field labels, panel titles, file rows |
| `{typography.caption}` | 12px / 400 | Hints, descriptions, badges, table headings |
| `{typography.micro}` | 11px / 400 | Card meta: file sizes, path fragments |

Principles:

- **Mono is the machine's voice.** Endpoints, token expiry, byte counts, transfer percentages, paths, exit codes, raw CLI output, and **table headings** (mono uppercase is the tone of "this is an identifier"). Sentences a person wrote for a person are always sans.
- **Weight stops at 600.** Half of the interface's quietness comes from this.
- **Numbers use tabular-nums.** Quota values, file sizes, percentages — a figure that changes should not make the layout jump.
- **Do not shrink type to express hierarchy.** Hierarchy is carried by size + colour + weight together, and two adjacent steps differ by at least two rungs.

## Layout

### Spacing

A 4px base, `--space-1` … `--space-8` (4/8/12/16/24/32/40/48). Siblings get `--space-2`, inside a card `--space-3`–`--space-4`, between page blocks `--space-4`. **Do not stack evenly**: the gap between groups is one step larger than the gap inside one.

### The shell: one workbench, not a set of pages

The interface is organised the way terminal tools are (Orca / Termius / PyCharm as references): **there are no pages to navigate to**, everything is present at once; the app **draws its own window title bar**, and **there is only this one bar at the top** — it is the title bar, the tab strip, the toolbar and the window controls in one, and a desktop app should not stack another row above it.

```
┌ window title bar = top bar ── [▭] │ tabs… + │ [▥] [☾] │ − □ × ─────────────┐
├─ left rail ────┬──────────────────────────────────┬─ right rail ──────────┤
│ sessions       │                                  │ files (SFTP)          │
│ ● name     + ⋯ │   terminal (middle, fills the    │ file tree (from       │
│   A100 · cloud │   remaining space)               │ /content)             │
│ ● name     + ⋯ │                                  │ upload / download /   │
│   T4 · 2 shells│                                  │ delete                │
│ ─────────────  │                                  │                       │
│ ⚙ settings     │                                  │                       │
├────────────────┴──────────────────────────────────┴───────────────────────┤
│ status bar: [progress · compute units] · spend rate · active sessions ─ open terminals │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Top bar (40px, the only bar on top, and the window title bar as well)**: the far left is the **brand symbol** (`app-shell/BrandMark.tsx`, 18px, `--ink`). **There is no wordmark** — an app that draws its own title bar does not need a line of text repeating the window title; the symbol is there and the wordmark is not, and that has not been overturned. The symbol is the **small-size cut**, not the master: the master's floor is 24px and this bar is 40px (see the minimum-size table in `brand/guidelines.md`). It is the one non-control element on the bar that does **not** declare `no-drag` — it carries no action, so the drag region should not be interrupted there. **The bar is split into three sections that line up with the layout below**: the left section is **as wide as the session rail** (brand symbol + rail toggle), so the tab strip in the middle **starts exactly above the terminal**. **Beside the brand there is exactly one control**: the rail toggle while there is a rail, and — while nobody is signed in, when the rail is not drawn and its foot cannot carry the gear — **the way into settings**, in the same seat. The two never appear together, so this is a seat rather than a second entry point, and settings is where the language is chosen: a first-run user who cannot read the interface must be able to reach it without a keyboard shortcut. That section's width is **measured from the rail** (`Sidebar.tsx` publishes its rendered width as `--rail-width`) rather than recomputed here — the rail is what gives way when the window narrows, and measuring it is what lets this follow; a second algorithm would drift on the first change to either. When the rail is collapsed the variable disappears and the section shrinks back to its two controls. **A 1px vertical line is drawn at each seam** (`{colors.hairline}`), the same line as the divider below: the left one is this section's own `border-right` — its width *is* the rail's width, so the border lands exactly on the rail's `border-right` column; the right one lands on the files panel's left edge (`--files-width`, also measured, published by `FilePane.tsx`). When the rail is collapsed the left line is not drawn: there is no seam there, so the line would have no subject. The middle is the tab strip — **it is "the selected session's workbench"**: one terminal per tab (`Terminal 1`, `Terminal 2`, …), **one file per tab** (the file name is the tab name, the full path lives in its tooltip), with a `+` at the end for another terminal (files open from the files panel on the right). With one session in the rail, this strip is that runtime's whole set of shells and files; change sessions and the whole strip changes with it. **No status dot on a tab**: the tabs in one strip share one SSH connection, the connection state is already written out on the rail's row and again in the status bar, and a third copy would be the same fact said three times. The right end is the **files-panel toggle** and the **theme toggle**, and the far right is the **window controls** (minimize / maximize-restore / close) — this group does not move with the right rail's width, because a toggle far from the window controls becomes two places. On Windows and Linux the system frame is not drawn at all (`frame: false`); on macOS the inset traffic lights stay (`titleBarStyle: "hiddenInset"`, 78px reserved on the left). The whole bar is a drag region (`-webkit-app-region: drag`) and every **control** in it declares `no-drag` in return; double-clicking the same area maximizes, like a system title bar. **"Every control is no-drag" is not "every container is no-drag"**: the tab strip spans the middle with `flex: 1` and must stay draggable, with only the tabs themselves (the `+` included) opting out — make the container `no-drag` as a whole and there is nothing left to grab between the controls at its ends, and the window cannot be dragged at all. The window controls are ours, so they must be `<button>` + IPC rather than something that looks like a button. **While the settings page is open the two panel toggles stand down** (they act on a layout that is not on screen at that moment) and the tab strip and theme toggle stay: the tabs are the way back to a terminal, and the theme is the whole window's business.
- **Left rail (260px by default, draggable 180–420, `chrome` ground + right hairline, can be collapsed entirely)**: the session list — **this is a host list, not a menu**. **Each row is a two-line card**: the first line is "status dot + name" and nothing else, the second is the machine's facts — **the name owns its line outright**, which is what makes the rail narrowable at all. The facts read, in the order they survive a narrow rail: the machine type (mono), what the **server** says about this record (`云端运行中` / `云端已无`, or nothing at all when the server was not asked), how **this window** is getting on with it (a non-resting connection state, in words), and `N terminals` last (only above one). An earlier version put the state words and the machine-type badge on the name's line, and the name — the one thing somebody opens this list to read — paid for both: with a long machine type and a live connection it was down to three characters. **Clicking the card selects that session** — if it has no terminal, one opens; if it has one, the last is focused, and the tab strip follows. **Row actions hide in an action strip at the first line's right**: `+` (New terminal) and a `⋯` menu (Focus terminal · **New terminal** · Restart kernel · Configure SSH · Copy ssh command · **Close all tabs** · **Stop session**) — actions take no ink at rest and appear when pointed at; `Stop session` is destructive, coloured with `{colors.error}` and confirmed first. **"Close all tabs" is the one action that hangs up**: closing a tab closes one shell (or one file view), while a runtime's other tabs keep running on that same connection (a runtime accepts one SSH connection, and closing one shell should not take somebody else's work with it); **a file tab counts as a tab** — it is reading files over that connection, so closing the terminals alone will not take it away, and hanging up means closing both. **When a different account has signed in since the rows were made, the rail says so** — a box above the list naming the previous address and offering the sync that prunes them. The records carry no owner (the CLI's store has none), so this sentence can only be said from what the app remembers; and nothing is deleted on its own, because those rows are the only copy and switching back is legitimate. The foot of the rail is the app's own corner: **Settings** (a real button with a gear icon, tooltip `Ctrl+,`). It sits at the very bottom because it is this tool's edge, not part of the workbench (quota and spend rate have moved into the always-present status bar).
- **Middle: the terminal.** It takes the **entire** remaining space, with no extra border or heading — a terminal tool's screen belongs to the terminal. When no terminal is on screen, that area becomes the **start page** (see "Start page"). The terminal's **content area** is a fixed `{colors.terminal-bg}` (the only region in the page darker than canvas, which is what tells "machine" from "interface" at a glance); when the connection drops, a thin bar with only "Reconnect" appears at the bottom, because the reason is already written in the terminal. **A pane clips: it paints its own surface and nothing else** (`overflow: hidden`). xterm asks for its grid in whole rows of a fixed height against a box it measures for itself, so "the grid is one row taller than the pane" is a mistake this layer can make; unclipped, its last row lands on the status bar, which is chrome that has nothing to do with the terminal. Clipping turns that whole class of mistake into a row that is visibly cut, inside the surface that owns it. **One session can have several terminals** — each is a shell on that one SSH connection with its own PTY size, so "one tab for training, another to look at files" needs no second connection (and the runtime would only grant one anyway). The selected session's terminals are stacked on the same area: only the current one is in the layout, the rest park but **keep running**, and switching terminals or sessions reconnects nothing — that is the floor for a terminal tool, and the reason `Workbench.tsx` has two levels of parking (one per session, one per tab).
- **Right rail (340px by default, draggable 220–560, can be collapsed entirely)**: the runtime's filesystem. It **shares the terminal's SSH connection**, which is why it has to be on the same screen — and why it is not a page of its own. There is one per **session**, not per terminal: a runtime has one filesystem, and its two shells see the same one.
- **The border between the two rails is the resize handle** (`components/ui/PanelDivider.tsx`): it rides on the panel's own hairline (9px wide, reaching 4px out on each side) and **draws nothing at rest** — the seam is the hairline that was already there — and **on hover, focus or drag that line becomes `{colors.hairline-strong}`**. The seam is drawn by the panel's hairline, so the handle takes no layout width and nothing "jumps" while dragging. The keyboard adjusts too: `role="separator"` + arrow keys (`Shift` for a large step), with `aria-valuemin` / `aria-valuemax` reported to assistive technology. **Under a narrow window the two rails narrow first and the terminal's floor is 360px**: a dragged width is a preference, not a guarantee (`lib/panel-width.ts` is the only source of truth).
- **With both rails collapsed** the terminal owns the row: focus mode.
- **Status bar (26px, mono)**: on the left is the compute cockpit — a capsule micro progress bar (step-adaptive scale: full-width basis at ≤100 CU / ≤500 CU, a warning below 15%), the current compute-unit balance (`42.50 CU`), the estimated spend rate (`~1.25/h`) and the count of cloud sessions being billed (`<ActivityIcon />` + a bare number), with projected time remaining on hover; the middle is elastic whitespace; on the right is the total number of open terminals (`<TerminalIcon />` + a bare number). The hover popover lists each session as `name · machine type · state · rate`, and its third column is **a state, never a countdown**: the only expiry a local record holds is the runtime proxy token's own (an hour, renewed in passing whenever the CLI runs a command, and this app deliberately never runs one), so a countdown built on it freezes and then reads "expired" for a runtime that is perfectly alive. **There is no clock for a runtime's remaining life** — the session backend does not publish one, and the rail says what the server does know (`云端运行中` / `云端已无`). Copying the SSH alias lives in the rail's `⋯` menu and no longer takes up the bottom bar.
- **Settings**: a **page**, entered with `Ctrl+,` or the gear at the foot of the rail. It is not a dialog: no backdrop, no click-outside-to-close, and the workbench is **not unmounted** — the terminals under it are live SSH sessions, and tearing them down to read a setting is wrong. See "Settings page" below.

Icons are always inline SVG (`components/ui/icons.tsx`): glyphs like `▤` / `▥` / `⚙` land on different shapes from different fonts on different platforms, and the whole top bar is icons. **Icons must be distinguishable from one another**: the gear is "ring + teeth + hub", not "circle + radial lines" — the latter is the same shape as the theme toggle's sun at 15px (learned the hard way). **An icon-only button must be given a name**: `IconButton`'s `label` lands on both `aria-label` and `title` — a glyph cannot supply that name.

### Settings page

Settings is **a layer over the workbench**, not a place outside it (`app-shell/SettingsPage.tsx`):

```
┌ Back to Workbench ──────────┬───────────────────────────────────────────┐
│ Account                     │  ✎ Account & Quota                        │
│  · Account & Quota  ← here  │  Authorization, balance and spend rate…   │
│  · Usage Trend              │ ───────────────────────────────────────── │
│ Workbench                   │  ┌ Metrics · Sign-in ────────────────────┐│
│  · Appearance               │  └───────────────────────────────────────┘│
│  · Terminal                 │                                           │
│ Runtime                     │                                           │
│  · Environment              │                                           │
│  · External Tools           │                                           │
│ App                         │                                           │
│  · About                    │                                           │
└─────────────────────────────┴───────────────────────────────────────────┘
```

- **Section rail (260px)**: the **same width, same ground, same hairline, same row style** as the left rail, so entering settings reads as "this rail changed its contents" rather than "a new window opened". The first row is **Back to Workbench** (a left-chevron like `PanelLeft` + text, a full-width ghost button), then grouped sections: a `{typography.micro}` uppercase group name (Account / Workbench / Runtime / App), and under it "icon + title" rows, the active one on `{colors.canvas-soft}` with a hairline and ink at weight 500 — the same treatment as an active session row in the left rail.
- **Body: one section at a time.** Rather than stacking every setting into one scrolling column, the section the rail has selected owns the body (`max-width: 760px`, centred). Each section brings its own `{typography.title}` heading + one `{typography.mute}` line + a hairline, and only then the content (`Card` or `Panel`). **There is no "Settings" page title** — every section talks about its own subject.
- **In and out**: in — the gear at the foot of the rail, `Ctrl+,`; out — the rail's first row, `Esc`, or clicking any session tab in the top bar (a tab is the way back to a terminal; clicking it returns to the workbench and focuses that terminal).
- **Focus handoff**: opening the page takes focus up from the terminals below, and closing it gives focus back to the element it came from. Otherwise the user types into settings and the characters land in a terminal they cannot see. **Changing the terminal's appearance must not touch focus either**: the terminal pane is still alive under this layer, and calling `focus()` on it hands the keyboard back to an invisible pane — which is why the hot-update path does not focus, and only a real click on the terminal does.
- **A section may contain a picture**: the "Terminal" section puts a read-only sandbox at the top (`features/workspace/TerminalPreview.tsx`) built from **the same xterm, the same options and the same palette**, not an imitation. It is still **one column**: the 760px body width and the one-section-at-a-time rule do not bend for a preview, and a two-column side-by-side layout would be a different page shape.
- **Motion**: entry is 180ms `ease-out` (opacity 0→1 plus an 8px rise), disabled under `prefers-reduced-motion`. **This entry is the product's only "a layer changed" motion** — it is what tells "a layer changed" apart from "the interface flickered". The one other motion is the toast's 120ms fade-and-rise (also off under `prefers-reduced-motion`): it marks "this just appeared", not "a layer changed".
- **Log**: the app's own log lives in `userData/logs/colabdesk.log` — **not in the install directory**: that may be Program Files (administrator-only writes), or a signed bundle on macOS (not writable), and an uninstall would take the log with it, while this one has to survive an uninstall, like the usage history beside it. A line is `timestamp [scope] text`, one per call: the CLI's argv, exit code, duration and raw output (`colab/`), every step of the sign-in flow, the main process's uncaught exceptions and unhandled rejections (`process-guards.ts`), plus one line at startup with version / platform / install directory / CLI source — a pasted log should be able to explain which build it is and where it is installed. **Everything is redacted before writing** (OAuth `code` / `state`, `token` / `secret` / `password` style key-values, `Bearer`), because this file is meant to be sent to somebody; write failures are swallowed (fail-open), and at 2 MB it rotates one `.1`. There is exactly one user entry point: the **Run log** row in **Settings → About**, showing the path + "Open log" — the path itself stays visible because it usually has to be quoted in a bug report. **But the interface never points at the log**: nobody goes digging in an install directory to find out why a button did nothing. A failure states its cause **on the spot** — the CLI's own last human sentence (`failureReason`), with a "Copy details" that hands the full output over; the log is for whoever maintains this later, not homework for the user.

### Keyboard

Terminal first: application shortcuts always carry `Shift` and never take a combination a shell wants (`Ctrl+C` is SIGINT, always).

| Shortcut | What it does |
| --- | --- |
| `Ctrl/Cmd+Shift+C` / `Cmd+C` | Copy the selection |
| `Ctrl/Cmd+Shift+V` / `Cmd+V` | Paste (through the terminal's bracketed paste; multiple lines are one unit) |
| Right-click | Copy if there is a selection, otherwise paste |
| `Ctrl/Cmd+Shift+F` | Find in the terminal |
| `Ctrl+Shift+=` / `-` | Terminal font size (remembered in localStorage) |
| `Ctrl/Cmd+Shift+T` | New terminal in the current session (the `+` on the tab strip) |
| `Ctrl/Cmd+Shift+N` | New session (request a runtime) |
| `Ctrl/Cmd+Shift+W` | Close the current tab (the last tab is what hangs up SSH; a file tab counts; unsaved edits are asked about first) |
| `Ctrl/Cmd+Shift+1…9` | Switch tabs of the current session (terminals and files share one strip) |
| `Ctrl/Cmd+Shift+E` | Show / hide the session rail |
| `Ctrl/Cmd+Shift+B` | Show / hide the files panel |
| `↑/↓` `→/←` `Home/End` | Walk the file tree (a row must have focus: `→` expands, `←` collapses or returns to the parent row) |
| `Enter` (in the file tree) | Open this row: a folder expands/collapses, a file opens as a tab (the same action as a double-click; a button's native keyboard activation) |
| `Ctrl/Cmd+,` | Open settings |
| `Esc` | Close settings (with settings closed, `Esc` belongs to the terminal and is not intercepted; inside a file tab it belongs to the find panel; on the front door it leaves the sign-in flow) |

### Start page (when no terminal is on screen)

With no terminal in the middle, the area is not blank — it is this app's **front door** (`features/workspace/StartPage.tsx`):

```
              brand lockup: symbol + name (graphic, 200px)
        A desktop SSH console for Google Colab runtimes
                 Pick a session, or create a runtime.      ← the next step
                    [ New session ]   [ Expand sidebar ]
   GPU Runtimes   Training & Inference   File Management   Usage Monitoring
       ───────────────────────────────────────────────
                    ☆ Star on GitHub                       ← footer
```

- **This screen is both a marketing page and an empty state.** The top half is the product's claim (the lockup + one sentence); the bottom half still obeys the old empty-state rule: it says what **this step** is. Decoration without directions is a worse empty state than a plain one.
- **The name is a graphic, not type.** The lockup comes from the brand kit (`app-shell/BrandLockup.tsx`: the master symbol + outlined lettering; `brand/` is not in the repo, so the geometry is inlined). This screen therefore has **no larger type** — the ladder still tops out at the 26px `{typography.display}`. The lockup goes through `currentColor`: ink in light, automatically reversed in dark.
- **Two situations share one column.** **No session selected yet** (the state at launch): the lockup + the claim + "Pick a session, or create a runtime" ("Create a runtime to get started" when there are no local sessions), the action is **New session**, plus **Expand sidebar** when the rail is collapsed. **A session is selected but has no terminal**: the same container keeps only "&lt;session&gt; has no active terminals + New terminal" — whoever arrives wants a terminal, not a brand story, so this screen **draws no lockup and shows no star**.
- **Nobody signed in is a third state, and it takes the column's action.** The next-step line becomes "sign in to create a runtime" and the action slot holds the sign-in panel itself (`features/login/LoginPanel`, the same component Settings mounts — one implementation, two places it is needed), in a **440px column of its own with its contents centred**: a form left-aligned inside a centred page reads as a layout accident. **The rail is not drawn at all while signed out** — its rows belong to another account and every action in it would fail — and the top bar's rail toggle and `Ctrl/Cmd+Shift+E` stand down with it, the same rule the toggles follow while settings is open. An **unread** environment is not "signed out": only a known `false` changes the screen, so no action flashes while the first read lands.
- **While the flow is running the screen keeps the lockup and the step, and nothing that is selling** — the claim, the capability lines and the star ask are for somebody deciding whether to use the app, not for somebody in the middle of signing in; they come back when the flow ends. **The flow is one sentence, one field and one quiet line.** While `colab login` waits: a sentence saying the browser has the page; the paste field with its single primary (disabled until something is typed) — the code itself in mono, its placeholder in sans, because one is a machine value and the other is a sentence; and under them **one quiet line of text links** — *Open in browser · Copy link* — separated by dots. Bordered buttons there competed with the field, which is the only thing being asked for. **Leaving is not a third link**: three equal-weight links read as three equal choices, and the flow has no field to fill in on the way out — so **Escape** leaves it, on the front door only (in settings Escape already means "close settings"), and nothing is drawn for it. **The URL itself is never printed**: it is a few hundred characters of query string, and a textarea of it made the middle of an authorization flow read like raw output.
- **One primary per screen.** It is **New session** (or **New terminal**); the star is a small `outline` pill and never competes with it.
- **The star asks once.** The footer pill points at the source repository (`lib/star-prompt.ts`). The app cannot verify that anyone actually starred it (there is no GitHub account here, and no `gh`), so opening it counts as the answer: after that the pill becomes the repository address in mono — the link stays, the pleading stops. The copy says "Star on GitHub" and never claims one was given.
- **Every line says what you can do, not how it works inside.** Icon + title + one description line, no fill and no shadow, in a row — a row of lifted boxes on the front door would be the loudest thing in the app. Titles are **verb + object** (*GPU Runtimes · Training & Inference · File Management · Usage Monitoring*), one thing each; mechanisms like "one session holds several terminals" or "files and terminals share one connection" belong on the description line, which is where facts get added — **a mechanism rephrased as a title is jargon**. The number of lines follows the content and the layout gives way: `.startpage__features` is an `auto-fit` grid (each ≈160px), and a narrow rail drops it to two or three per row.
- **"Training & Inference" is about that machine, not about this app.** There is no Run button here, so the icon is a terminal and not a play button — a play button promises a feature that does not exist. Anything "the machine can do, and the app only hands the machine to you" is written this way: the title lands on what the user does, and the description line says where it happens.

**An empty state may not claim "there is nothing."** When a list has two sources (the local record, the server), and only the local half could be read, it says "no local sessions yet" and nothing more; when the server half could not be read, it adds a line saying so and where to retry — "there is nothing" is a sentence that is only true when both halves were read and both were empty.

**A loading state may not claim a value.** While a reading is on its way the slot holds a **skeleton** — a `{colors.canvas-soft-2}` block the width of the number it will become, pulsing, `aria-hidden`, with `aria-busy` on the group — never a zero. `0.00/h` is a *reading* ("nothing is being spent"); an unread rate rendered as one tells the person their account is idle when the truth is that nobody has asked yet. The same rule as the empty state, from the other side: unknown is drawn as unknown. A read that **finished without a number** (a failure, or a backend that omits the field) is not pending any more — it gets an em dash and, where there is room, the reason; it does not pulse forever. The skeleton's motion follows the ordinary motion rule (`prefers-reduced-motion` stills it). The status bar is the first place this applies: balance, rate and the billed-session count are skeletons until the first reading, and the meter reports no `aria-valuenow` meanwhile, because an unknown balance is not 0%.

### Runtime setup (creating a session)

`Ctrl/Cmd+Shift+N`, the rail's header `+` and the start page's action all open **a console in the middle column**, not a dialog (`features/sessions/RuntimeSetup.tsx`).

```
┌ rail ─────────┬─────────────────────────────────────────────────┐
│ ● runtime     │ ColabDesk · New runtime                          │
│               │ This account can request: G4 · A100 · L4 · T4    │
│               │ ? Machine type                                   │
│               │   1  CPU (no GPU/TPU)                            │
│               │ ▸ 2  T4                                          │
│               │   6  H100      not available to this account     │
│               │ ? High-RAM  [x]  Requires Colab Pro/Pro+         │
│               │ ? Session name  ______________                   │
│               │ [ Create ]                                       │
│               │ ↑/↓ or a number · Enter next · Esc back          │
│               │ $ colab new --gpu T4                             │
│               │ [colab] Creating session '…'...                  │
│               │ ⟳ requesting a T4 runtime… · 1:12               │
└───────────────┴─────────────────────────────────────────────────┘
```

- **The palette is the terminal's** (`--terminal-*`), so it follows the app's polarity and the palette the reader picked for terminals. This column is a machine from beginning to end, and the hand-off to the terminal at the end changes no colour. The workbench stays mounted underneath (its terminals are live SSH sessions); the console covers it.
- **One screen, not a wizard.** Three answers do not deserve three screens; the "installer" feeling comes from the console and the log, not from extra clicks. **Enter is "next", not "submit"**: it walks the three answers — the list, the high-memory option, the name — and only the last one creates (a machine with one shape has no high-memory step, so it is skipped), which is how an installer behaves and how a person expects a form of steps to behave. **↑/↓ choose the machine from anywhere on the screen**, including while the name is focused (a single-line input has no other use for those keys) and after a click on the panel's empty space — the handler sits on the window, because that click lands on `body` and a listener on the form would go quiet. A number key jumps to that machine; inside the name field a digit is a digit. Every step still has a button, so the mouse is never second class.
- **The options are a list, one machine per line**, numbered for the keyboard, the chosen one marked with `▸` and a wash — a terminal says "this is the one" with a cursor. **What the account cannot get is struck through with the reason in place**, and the line above says what *is* left, because a row of strikethroughs does not. When the backend did not answer, everything stays selectable: `colab new` is the only place that really decides.
- **A terminal has no checkbox widget**: `[x]`, with the native input hidden underneath (`visually-hidden`) so the row stays the click target and the keyboard still works.
- **The form stays; the log is appended below it.** Pressing Enter does not clear the screen: the three answers remain at the top, locked while the request is in flight (the rows stop inviting clicks and the primary action drops to a wash), and the command — from the same `createSessionArgs` the main process runs, so "here is the command" is the command — plus **the CLI's own output as it arrives** (`role="log"`, `aria-live="polite"`) and a spinner with the elapsed clock grow underneath. **The log scrolls inside its own cap**, so the answers never leave the screen, and a request that just went out is brought into view once. A failure is the same screen with the fields unlocked and the red line under the log; the next move is an edit and Enter, not a "back" button. **Nothing here is invented**: no progress bar the CLI never reported and no fabricated lines. A failure's red line is the **status only** (″Command failed (exit 1)″) when the last streamed line already gave the reason; it repeats the sentence only when the log could not (a timeout, no output).
- **Leaving does not cancel.** Escape, or "Keep it in the background", closes the view; the request lives in the store and keeps running, and a failure that lands while the view is closed surfaces as a toast. The CLI cannot be cancelled safely, and this screen does not pretend it can. The wake-up is deliberate: `setup → provisioning → failed` is app state, not component state, which is also what lets reopening mid-request show the true elapsed time.
- Motion follows the ordinary rule: the spinner stills under `prefers-reduced-motion`.

### Density and hit areas

A desktop console wins by being compact: table rows get `--space-3` above and below, buttons are 32px and small ones 28px. **A click target shorter than 28px counts as a defect**, except inline icon buttons (they come in groups with enough spacing) — the tab's `×` is one of those: 24px, the same metrics as the rail's `⋯` (`.menu__trigger`), because it is the same kind of control.

## Elevation & Depth

Five levels, all built as **stacked small offsets plus an inset hairline** (see `elevation` in the frontmatter). Level 2 is the default card; level 3 is hover and drag; levels 4/5 are for layers that genuinely float (popovers, dialogs).

**Never use a single large blur.** That makes the workbench look like a dashboard; "sitting on the page" rather than "floating above it" is where this system's sense of weight comes from. **Never put a shadow on a table row either** — rows are expressed by hairlines and the `{colors.canvas-soft}` hover fill.

## Shapes

| Token | Value | Use |
| --- | --- | --- |
| `{rounded.xs}` | 4px | Keycaps, the inside of a badge |
| `{rounded.sm}` | 6px | **Every control in the app**: buttons, inputs, controls inside a callout |
| `{rounded.md}` | 8px | Callouts, raw-output blocks, empty-state boxes |
| `{rounded.lg}` | 12px | Cards, panes, table containers, work surfaces |
| `{rounded.full}` | 9999px | Badges, status dots |

Two scales with distinct jobs: **controls are 6px, containers are 12px**. Do not use two radii for the same kind of thing on one screen. A status dot is a 6px circle; the progress bar is 4px tall and fully rounded.

## Components

### Button

`components/ui/Button.tsx`, seven variants and four sizes (md 32 / sm 28 / lg 36 / icon 32).

- `primary` — ink fill + `on-primary` text. **One per flow** (create, open a workbench, upload, sign in, submit).
- `secondary` — canvas fill + a Level 1 shadow; the non-committal action paired with a primary (re-read, sync, refresh, connect).
- `outline` — canvas fill + a visible hairline border; for dense toolbars (SSH configuration, write `~/.ssh/config`, download).
- `ghost` — no fill and no border, `{colors.canvas-soft}` on hover; the secondary actions of a table row or a file row (restart kernel, disconnect, delete a file).
- `destructive` — `{colors.error}` fill with white text; irreversible actions only (stop session).
- `link` — link-blue text, underlined on hover; inline jumps like "view environment".

Every button sinks 1px on `active`, uses `--focus-ring` (a 3px translucent hairline-strong) for `:focus-visible`, and is 45% opacity when disabled but **stays visible** — the user needs to know an action is there.

### Field / Input / Select / Checkbox

Controls are 32px tall, canvas-filled, `{rounded.sm}`. The label sits above the control (13px/500 ink), an optional description follows it in `{typography.caption}` + `{colors.mute}`; inline cases use `field--inline`. The focus state is a `{colors.hairline-strong}` border plus a 3px translucent ring — no hard outline.

### Card and Panel

- **`Card`**: the content container of a page (new session, session list, quota). Its head is the three-piece "title + description + actions", and the description is always one sentence, at most 62ch.
- **`Panel` + `PanelRow`**: **one card per section, rows divided by hairlines** — this is the shape of facts and settings. The left column is "what is this" (a label plus an optional description), the right column is "how to read it / change it" (a mono value or an action). The environment page is this shape end to end; one card per row would turn four facts into four screens.

### The shortcut table

The table in Settings → Terminal is a `.table`: **no outer border**, hairlines between `td`s, no line on the last row, and cells do not wrap. The left column is the key, drawn as a `.kbd` cap (mono on `{colors.muted}` with `{rounded.xs}`); the right column says what the step does. It is **not the general list shape** — no header, no actions, nothing clickable; the session list is `.session-row` (see "Functional components").

### Callout / EmptyState / Metric / ProgressBar / RawOutput

- **`Callout`**: a soft block of `-soft` fill with `-deep` text, the level told by the fill (info = link-bg-soft, warn = warning-soft, danger = error-soft). Explanations, warnings and failures are stated here, **not in a dialog**.
- **`EmptyState`**: every list that can be empty has one; the title says "there is nothing here", the body says what the next step is.
- **`Metric`**: a KPI block — a `{typography.display}` value + a `{typography.caption}` label on `{colors.canvas-soft}`. On the free tier a `—` is a legitimate display, not an error.
- **`ProgressBar`**: 4px, ink fill, and only while a transfer is running.
- **`RawOutput`**: collapsed raw text, `{colors.canvas-soft-2}` fill + mono, collapsed by default. It exists **only for "the user may want to read this"** — today its one use is the configuration block written into `~/.ssh/config`. **The CLI's raw output neither goes here nor surfaces in the interface**: it goes to the log (see "Log" under "Settings page"); what the user wants is "why did it fail", which the failure copy answers on the spot, with "Copy details" handing over the full output.
- **`CopyButton`**: copies a piece of text, and its label turns into "Copied" for two seconds. A clipboard write is silent, and raising another message for a copy would be heavier than the act itself — **the label is the whole confirmation**. It exists because handing evidence to somebody should not require the user to go find a file first.

### Functional components

- **Session row (left rail)**: **two lines, and the split between them is the rule.** Line one is the status dot and the name; line two is every fact about the machine, at `{typography.micro}`, in `{colors.mute}`, on **one line that never wraps** — it ends in a single ellipsis when the rail cannot hold everything, and the facts are ordered so that the ellipsis eats the least important last (machine type → what the server says → this window's connection state → terminal count). **The facts line owns the card's whole width**, which is the reason the action strip floats over the first band instead of sitting in the flow beside it: a strip in the flow takes its 64px from every line of the row, and at a 180px rail that was the difference between three facts and two. The name carries no badge beside it either: a machine type is an identifier and identifiers are mono, but mono text is not a pill, and a pill on the name's own line is what pushed the name down to an ellipsis. `session-row--active` marks the current tab with a `{colors.muted}` fill; hover brings `{colors.canvas-soft}`. **One dot, one state**: the row's dot takes the connection's tone and the words sit on line two — the earlier layout drew the state twice (`● name ● Connected`) and paid for the second dot out of the name's width. The resting "disconnected" is still not written at all, while connecting / connected / failed are written *and* coloured (`{colors.warning-deep}` / `{colors.body}` / `{colors.error}`), so the words carry the meaning and the colour only agrees. **The action strip (`+` and `⋯`) is revealed on hover or keyboard focus, and the name reserves its width whether or not it is drawn** — a name that reflowed on hover would move the very word being read. At rest the strip takes no clicks either (`pointer-events: none` with the ink): there is nothing to aim at, and a click meant for the row used to land on a button nobody could see. Destructive items come last in the menu, coloured with `{colors.error}`.
- **Untracked row (left rail, `.session-row--untracked`)**: a runtime the server has that no local record mentions — `colab sessions` prints these as one `[?]` line — listed after the session rows. It has no name, so the row writes the endpoint in **mono**; its state is a `status--warn` dot plus the words "Not in local records" in the facts line. **No action strip, no hover fill, and the pointer is not a hand** — this app can do nothing about it, and a row should not look clickable when it is not. "Manage it from the Colab web console" lives in the tooltip, not in the row.
- **Menu (`Menu`)**: a small popover on `canvas` with a Level 4 shadow and an 8px radius, aligned to the trigger's bottom-right; `Escape` or a click elsewhere closes it. It carries "belongs to this row, but is not used often", so it **never occupies space in the resting layout** — with one deliberate exception, **inside a session row's action strip**, where the trigger's width is reserved even while its ink is hidden: the strip shares a line with the session name, and a width that appeared on hover would reflow the name under the cursor. A trigger does not disappear while its own menu is open (that would read as a broken control).
- **Chart (bars, `.trend__*`)**: quantity only, never multiple series. The plot area is a `{colors.canvas-soft}` well (1px `{colors.hairline}` + `{rounded.lg}`) and the bars are `{colors.ink}` — **no second colour appears in the chart**, semantics are carried by words. Three rules:
  - **A magnitude needs a reference**: a `{typography.caption}` line above the plot states the range and the peak, or the bar heights cannot be read.
  - **"Not measured" is not "no spend"**: a span with no reading gets a `1px dashed {colors.hairline-strong}` on the baseline, its bars still drawn (spend is apportioned from the neighbouring readings), and the note under the chart says that span was inferred. **Do not** draw an empty bar to mean zero.
  - Axis labels are `{font-mono}` + `{typography.micro}` + `{colors.mute}`; with many buckets, label every Nth — never wrap, never rotate.
- **Segmented choice (`.row` + `Button`)**: a mutually exclusive choice from a small set (terminal font size, the trend's day/week/month) is a row of `Button`s, the active one `primary` and the rest `outline`, `size="sm"`. It is not one of the "one primary per screen" action buttons; it is a state indicator, and is therefore not bound by that rule.
- **Toast**: the result of an inline action lands in the **bottom-right**, a layer in the `Callout`'s three tones (Level 4 shadow, `rounded.md`, 400px wide) that **walks away by itself** (info 4s / warn 8s / danger 12s), with an `IconButton` `×` (which has an accessible name), **replacing the same text rather than stacking a second copy**, at most 3 at once, and no entry animation under `prefers-reduced-motion`. It is `role="status"` + `aria-live="polite"` — **it reports, it does not interrupt**. Its split from the banner is the whole of that rule: a message belongs to **an action** ("Copied", "Stopped"), a banner belongs to **a state** (an update waiting to install, an environment that cannot be read) — a state is waiting to be dealt with, so it cannot walk away, and therefore cannot be a toast. **Success never uses a dialog.**
- **Terminal tab**: name + `×`; the active tab is a `canvas` fill with an ink underline; middle-click to close is muscle memory for terminal users and must work. The `×` is an **inline icon button** (24px, `--radius-sm`, the rail's `⋯` metrics and token chain): `--mute` at rest, **on the active tab one notch under its own title (`--body`)**, and on hover or focus a `--canvas-soft-2` chip behind `--ink` — `--hairline` over the tab's own `--canvas-soft` hover wash is 2.5% apart, which is no feedback at all. **Double-clicking the name renames it in place**: Enter commits, Escape cancels, losing focus commits, all without leaving the strip; blank, or unchanged, goes back to the derived `Terminal 1`. A name is stored as an **override**, not as text (`customTitle: string | null`) — the default is produced by `t()`, so storing the string a user happened to leave untouched would freeze that tab into the language of the moment. A file tab cannot be renamed: its name is the file. **The button that closes it announces the same name** (`aria-label`): one tab, one name as far as a screen reader is concerned. No connection dot is drawn on a tab (the strip's tabs share one connection, and the rail and the status bar each already say it); the dot on a dirty file tab is a different thing, and not a state.
- **File tree**: **a tree, not "a list behind a breadcrumb"**. Folders open in place and their siblings stay on screen, so "where am I" is read off the indent — a screen-replacing enter/back throws that information away at every step, and this panel exists to answer "how is that file related to this one". The tree's **first row is the root's own name** (a mono `/content`, following the shell's landing point); it is both the default drop target for a dragged upload and the only statement of where the tree is rooted. **No breadcrumb**: the hierarchy is already in the tree, and saying it again says one thing twice; jumping to a deep directory would want an editable path bar, not a breadcrumb.
  - **Row**: a `▸/▾` triangle (**on folder rows only**; file rows keep the column empty so names line up) + a 14px stroked icon (closed folder / open folder / file / link; a directory being read swaps in a spinning sync icon and the row reports `aria-busy`) + the name (taking the remaining width) + a mono size (micro, right-aligned). **No action buttons in the row**: the whole row is one `<button>` (**a single click only selects**: a folder's row expands/collapses in place, a file's **double-click** opens it as a tab), and **open, download and delete all live in the `⋯` menu at the row's end** that appears on hover (the same `Menu` as a session row, destructive items last and coloured `{colors.error}`) — two buttons on every row is exactly what makes a full directory unreadable, so actions belong in the menu; a single click no longer downloads, because a double-click necessarily fires two clicks first, which would pop two native save dialogs. **Icons are always `--mute` stroked shapes, never emoji**: emoji look different on every platform and carry their own colours, which fights this system's restraint; on hover or focus the icon turns `--ink`, and the name always stays the place the eye lands. Row height **28px** (the density floor, the same rule as the minimum click target). **No lines between rows** — forty files with forty hairlines reads the folder as a table; position comes from the indent, and pointing at a row uses the `{colors.canvas-soft}` fill, the same treatment as a session row.
  - **Indent**: 16px per level, capped at 6. The panel's narrowest is 220px, and a tree too deep to show names is no tree at all.
  - **Read on open**: a directory is read the first time it is opened and kept when it closes — **closing does not clear the cache**, and reopening a folder nobody touched should not cost a round trip. A failed read writes its reason in place (the other branches keep working).
  - **The focused row**: `file-row--focused` marks where the keyboard is with a `{colors.muted}` fill — **the same expression as the selected session row**, not a second one invented for the tree; it is also the only row with `tabIndex=0`: the tree is one keyboard-walkable whole, not dozens of tab stops.
  - **Semantics**: the container is `role="tree"` and rows are `role="treeitem"`; folder rows report `aria-expanded` and `aria-level`, and file rows report **no** `aria-expanded` (there is nothing to expand; reporting one would be a lie).
  - **Keyboard**: `↑/↓` move, `→` expands (or drops to the first child when already open), `←` collapses (or returns to the parent row when already closed), `Home/End` jump to the ends — the same as a file manager, so there is nothing new to learn.
- **File tab** (double-click a file row, `Enter`, or "Open" in the row's menu): a file opens as **a tab beside the terminal**, not a dialog — it is reading the very machine the terminal is writing to (a training log should be readable while it runs), and a tab puts both on one screen where switching is only bringing one forward. It is **a work surface**: a `chrome` head (mono full path + "Copy path" + state + actions) over a `canvas` body, the same shape as the files panel's head. **The actions, left to right**: a "Read-only" badge (when there is a reason), a one-line state (`LF · 12.3 KB`; **it does not wrap** — the path truncates instead, because a fact broken over two lines reads as two facts), "Copy path", **"Save"** (only for a writable file; enabled only once it is dirty, and the single primary on this screen), "Reload", "Download". When the read failed, that slot becomes a single primary "Retry". `Ctrl/Cmd+S` is save and **works only inside a file tab** (in a terminal that key is XOFF). **Parking is exactly a terminal's**: not the current tab means `hidden` + `inert` (content, scroll position and undo history all stay), and it parks with its whole slot when the session changes; **it also counts as a tab that needs the connection** — the last tab is what hangs up SSH, and closing the terminals alone will not take a file you are reading with it.
  - **There is exactly one size rule, and it lives in the main process**: ≤ 2 MiB is read whole; anything larger sends **256 KiB of the head and 256 KiB of the tail**, each cut to whole lines, joined by a line of text reading "⋯⋯ X omitted ⋯⋯" — copying includes that sentence, because a missing stretch has to travel with the text. **A truncated tab shows no line numbers and cannot be edited**: numbers stitched across the gap would be fiction, and the half that could be edited should not be written back.
  - **Each refusal gives its reason and a way out**, never a blanket "cannot open": **binary** (a NUL in the first 8 KiB — it is not even read; "Download" is the only path), **not UTF-8** (shown with replacement characters, viewable only), **not writable** (no write bit in the mode — it displays normally but offers no save). A binary file gets no "Read-only" badge: it has no text to read, so the label would be describing something that does not exist.
  - **The save's promises, kept one by one**: the text lands in a **staging file** beside the target and is renamed on top (a half-written file can never appear under the target's name, the `sftp-ops` way), and **the mode comes back with it** (a `.sh` should not lose `+x` because one line changed); before writing, the **mtime/size it was read at is compared**, and if the far side moved on it **does not write** — instead it puts up three choices (`Overwrite` (destructive) / `Discard edits and reload` / `Cancel`), where `Overwrite` takes the destructive colour because it destroys a copy somebody else left on the server, while "Don't save" throws away a choice the user just made and is therefore only `outline`. **A failed save states its reason in place and the buffer does not move** — edits are not lost to one failure.
  - **The head has to fit in the narrowest column**: this pane's floor is 360px, so (a) the facts line shrinks to an ellipsis rather than wrapping — wrapping reads as two facts, and **a button pushed past the pane's edge slides under the files panel beside it** (a real CI failure: the button could not be pressed, and the thing hit was the neighbouring panel's title); (b) while a question occupies the head, "Copy path" steps aside and only the facts line and the answers remain — the facts cannot be hidden, because `● Unsaved` is the premise the question rests on. The answers' copy is short for the same reason (`Discard edits and reload`, not "my edits").
  - **Unsaved is a dot plus a word**: the state line reads `● Unsaved` (briefly `Saved` after a write lands, then back to the facts), and a small dot on the tab says which one. **Closing a tab asks first** (`×`, middle click and `Ctrl/Cmd+Shift+W` all go through the same question): "Save and close" (primary) / "Don't save" / "Cancel"; choosing "Don't save" writes not one byte. The question appears **in the pane's head** and hands the keyboard straight to "Save and close" (`autofocus`), and the whole thing goes out through `role="status"` — a question raised from somewhere else (the tab strip, a shortcut) must not rely on being seen. **When the far side has already moved on and the user clicks close**, the first button becomes "Overwrite and close": a plain save would only conflict again, and the two questions would take turns hiding each other. **"Close all tabs" and "Stop session" each ask once** (when the session has a dirty tab; the latter folds the fact into the confirmation it already asks), one question for the whole batch rather than one per tab. After a save lands, that row in the files panel is re-read (its size changed).
  - **Debts**: there is no file watcher — a change made elsewhere on the far side only surfaces at the moment of saving; follow-refresh (tail) and ANSI stripping are not here either; and there is no global unsaved-changes guard when the app quits.
- **Drag upload**: dragging onto the panel's empty area lands in the **root** (the row at the top of the tree); dragging onto a folder row lands in that folder (the row gets a `file-row--drop` border and fill, so the destination is visible before the mouse is released). **A pointer resting on a closed folder for 600ms opens it**: otherwise "drop into a folder that is not open yet" means release, expand, drag again. A folder uploads as a whole tree and **symbolic links are skipped**: a link pointing outside would drag along files that were never selected, and one pointing back inside would make the walk never finish. The skipped count goes into "N skipped" at the transfer row's right end.
- **Transfer row**: one line of `↑/↓ + file name` (a folder adds `(done/total)` after the name), with a mono percentage at the right end, and while running a 4px progress bar plus a "Cancel" — **cancel really stops**: the channel is closed, the half-written remote file is cleaned up, and the row says "Cancelled". The end states, in order: failed (the reason written in place in `{colors.error}`), cancelled, N skipped, done. The number of transfers in flight appears in the status bar.
- **No half-written file ever appears**: a transfer first lands on a staging name beside the target (`.name.part-xxxx`) and is renamed on top, so the listing either has nothing or the complete thing. A file of the same name is **never silently overwritten**: one question before an upload starts (see "Dialogs").
- **Find bar (terminal)**: the terminal's only floating control, opened with `Ctrl/Cmd+Shift+F`, pinned **above** the terminal grid (not floating on it), and `Esc` closes it and gives the keyboard back to the terminal. Matches are marked with the terminal's own selection colour rather than an invented highlight — that would have to work across ten terminal palettes. The control is the app's own (the same stock as the "Connection closed" notice bar), because the terminal's colours are an axis of their own and the control is not.
- **Collapsing the files panel is "hiding it", not "folding it away"**: the panel stays mounted (`hidden` + `inert`), and how far it was expanded and which directories were read all stay — the same reasoning as parking the terminal. "Refresh" re-reads **the root and every open directory**; subtrees that were never opened are not touched.
- **Status**: `Status` is always "dot + words" (Connected / Connecting… / Running / Not authorized). **Colour never carries semantics alone.**
- **Dialogs**: `Dialog` = `canvas` fill + a Level 5 shadow + a translucent backdrop; clicking the backdrop or the `×` in the top right leaves (`IconButton` + `CloseIcon`, the same glyph as closing a terminal tab). **Only for a genuine mid-way fork**: an upload meeting a file of the same name (a question only the user can answer, whose answer covers the whole batch — `Replace` / `Keep both` / `Skip`). **Creating a session is not one**: it is a console in the middle column (see "Runtime setup"), because it is a machine being commissioned and the CLI narrates it. **A file is not a fork**: it is a tab (see "File tab") — a dialog would put it on the other side of the terminal that produces it, and being read against that terminal is the point. Settings is not a dialog either; it is a page (see "Settings page"). **A hairline separates the footer from the body** (the top border of `.dialog__footer`): the footer does not reuse the header's class — that draws the line under the footer's bottom edge, adding one between the buttons and the dialog's edge while leaving the body and the footer unseparated. The account and its machine types live in Settings → "Account & Quota", one per row: the email on one row, the available machine types on another (the unavailable ones in `badge-off`).

## Do's and Don'ts

### Do

- Use `{colors.primary}` (ink) for every affirmative action; in dark it flips by itself.
- Express hierarchy with the `{colors.page}` → `{colors.canvas}` → `{colors.canvas-soft}` ladder, with a Level 2 shadow on cards.
- Put every value the machine reports in mono: paths, times, bytes, percentages, exit codes.
- Make every state "dot + words"; give every list that can be empty an `EmptyState`.
- Use `Panel` + `PanelRow` for facts and settings; `.session-row` (left rail) for lists; `Callout` for explanations; a bar chart (`.trend__*`) to compare quantities.
- Convert timestamps to a short local format and keep the raw value in a tooltip.
- Land a new token in `tokens.css` (light + dark) before using it in a component.
- Keep settings as one whole surface (a page, a layer) with **a section rail and one section at a time**; app-wide preferences like the theme live in settings too ("Appearance") rather than on a top-bar button.

### Don't

- Don't introduce a second saturated colour; there is no green either — `{colors.success}` is the link blue.
- Don't use a single large blur, and don't put shadows on table rows.
- Don't put body text or labels in mono uppercase (that is the tone of "an identifier"; `Token expiry` is not an identifier, `ENDPOINT` is).
- Don't express a state with colour alone.
- Don't "brighten one channel" of a terminal palette: the values are upstream's published ones, the three light palettes included — to brighten something, swap in a palette that has a source. Readability on a light ground comes from `minimumContrastRatio` (4.5 there), which is a rendering-time decision and stays separate from the palette itself.
- Don't let the terminal's light/dark following become "one set of values flipped": following swaps in another complete palette (see "Terminal palettes").
- Don't put two primary buttons on one screen, and don't let a click target go below 28px.
- Don't stack facts one card per row; divide them with a `Panel`'s hairlines.
- Don't hard-code a hex colour in a component — not even "temporarily".
- Don't unmount the workbench (terminals, files panel) to show one screen of settings; settings is **a layer on top**.
- Don't give the top bar a second icon of a similar shape: the theme toggle is a sun/moon, so the gear must be a different shape.
- Don't write a bare `<button>` without a `type`: HTML's default is `submit`, and inside a form it submits on the user's behalf — "commands with side effects are never retried" holds in the interface too. The gate is `react/button-has-type`, with the `Button` primitive (which forwards `type`) as its one exception.

## Provenance

The visual language here descends from the language of Vercel's marketing site: the surface ladder, the ink primary, the five stacked elevations, the Geist family and the "mono is the machine's voice" split, the `-soft` / `-deep` semantic pairs, "status is a dot plus words", "dark is a polarity flip rather than a second palette", and "one card per section, rows divided by hairlines". **ColabDesk did not invent its colours or its elevation**; it applies that system to the console of a remote machine, with the three adjustments the Overview records (no display sizes, a terminal axis of its own, state semantics re-ordered for this product).

The terminal line later grew into an axis of its own: the nine foreign palettes in `terminal-themes.css` each carry their source (the official terminal colours of Tokyo Night, Catppuccin, One Dark, Dracula, Nord and Monokai, plus the light half of three of those families: Catppuccin Latte, One Half Light and Tokyo Night Day), and only `titanium` belongs to this system — its surfaces are the four tokens this file used to hold, its hues come from the semantic colours in `tokens.css`, and its bright row is lightened for "readable on `#0a0a0a`". The reasoning behind the axis is the one that has always been there: a terminal is a **picture of a machine**, so it should not follow the reader's theme — while the mechanism changed from a single pinned dark to palettes the user can pick, and then from one palette to one per polarity, which suits "the terminal is a machine" better than one fixed answer each time.
