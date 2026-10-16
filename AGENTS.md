# ColabDesk engineering conventions

## Design system

All interface work — layout, colour, type, spacing, component choice, interaction behaviour — must follow
[`docs/DESIGN.md`](docs/DESIGN.md). The single source of truth for tokens is
`src/renderer/src/assets/tokens.css`; the UI primitives live in `src/renderer/src/components/ui/`.
**Do not invent new colour values, type sizes or shadow levels** — when the document already covers the role,
use it. When the document is silent, solve it in place following this file's directory conventions and write
the new rule back into DESIGN.md.

## Reuse first

Before writing any new logic (a function, a component, an IPC channel, a piece of state, or a whole flow),
look for an existing implementation; extend it rather than building a parallel one. How deep the search goes
is proportional to the size of the thing: a one-line change does not count, a new panel does.

## Naming

`helpers`, `utils`, `common` and `misc` are banned — they carry no information and inevitably become a junk
drawer. Name files after the **domain concept**: `ssh-config.ts`, not `ssh-utils.ts`;
`transfer-progress`, not `file-helpers`. If it feels like "this should be called helpers", that is usually a
sign the file has two jobs and should be split.

## Directories

- `src/main/` — the main process. `colab/` (CLI and domain state), `ssh/` (connection, identity, SFTP),
  `ipc/` (channel registration and handlers), `e2e/` (the CLI stub and local runtime under
  `COLABDESK_E2E_MOCK`), and `window.ts` / `runtime-paths.ts` with one job each.
- `src/preload/` — the contextBridge implementation; its types come from `@shared/api`.
- `src/renderer/src/` — `app-shell/` (the shell), `features/<domain>/` (pages), `components/ui/`
  (primitives), `store/` (state, one slice per domain), `lib/` (api, formatting, failure copy),
  `assets/` (tokens.css, main.css).
- `src/shared/` — the **contract** between main and the renderer (`types.ts`, `ipc.ts`, `api.ts`).
- `tests/e2e/` — Playwright end-to-end specs; fixtures, the sandbox and the readiness waits live in
  `app-launch.ts`.
- `config/` — tooling configuration (vitest, electron-builder, playwright). `docs/` — the design system and
  reference material.
- Tests sit next to the source they test (`*.test.ts`); there is no `__tests__`. End-to-end specs are the
  exception and all live in `tests/e2e/`.

## State

Renderer state lives in `src/renderer/src/store/`: **one store, with one slice per domain**. New state
prefers a new slice; **only build a second store when coupling it to `AppState` would be actively harmful or
worthless, and write the reason at the top of that file**.

The shell (`App.tsx`) **holds and subscribes to no state of its own** — every part subscribes to the slice it
uses, or one small state change re-renders the entire tree. Always read state through a selector, and take
only the fields actually needed:

```tsx
const tabs = useAppStore((state) => state.tabs);
```

- **Never build a new object or array inside a selector** (`filter` / `map` / `{ ... }`). Every store write
  re-runs all selectors, so returning a fresh reference means re-rendering on unrelated writes. For several
  fields use `useShallow`; for a cross-domain projection put it in `store/selectors.ts` and have it return a
  primitive or a reference the store already holds.
- **High-frequency events do not go into the store**: terminal bytes travel IPC → a pane callback (never
  through the store); transfer progress is throttled/coalesced per session before it goes in, or one upload
  runs through every selector in the app at thousands of ticks per second.
- Outside React (shortcut handlers, events pushed from main) read the store **at call time** with
  `useAppStore.getState()` — do not capture one render's state in a closure.
- Slices call each other through `get()` (that is how `openTab` closes the settings layer); do not build an
  event bus on top for the sake of "decoupling".

## Comments

Write "why", not "what". One line when one line does. Do not restate the code, and do not write "the next
line does X".

## Verification

```bash
npm run typecheck      # tsc --noEmit (two projects: main + renderer)
npm run lint           # oxlint (correctness rules, configured in .oxlintrc.json; the CI lint job runs this)
npm test               # vitest (main-process logic + render assertions, see below)
npm run build          # electron-vite build
npm run e2e            # Playwright end-to-end (builds first; `SKIP_BUILD=1` reuses an existing out/)
npm run gallery        # writes pictures to screenshots/ for a person to look at, not run in CI (`@gallery` tag)
```

CI is three workflows: `ci.yml` runs the same typecheck + unit tests + e2e on **ubuntu / windows / macos**
(the app ships to Windows and macOS, so green on one platform is not verification; lint is a separate job
that runs once). `package.yml` packs on a push to main without publishing and asserts the runtime really
made it into the package — keeping packaging problems ahead of the tag; `release.yml` is still tag-only. The
three runners have different host languages, so **assertions never read the host locale**: the rendered
language is pinned by the fixture's `--lang=zh-CN`.

Interface changes must be verified with `npm run e2e`, not with a desktop screenshot tool: this machine's
VDI compositor makes external screenshots unreliable, while Playwright goes through CDP and the app's own
DOM.

**Design rules become render assertions, not pictures to review.** `renderToStaticMarkup` renders real
components **without needing a DOM**, so rules that are visible but decidable in code — "icons must be
distinguishable from one another", "an empty state must say what the next step is", "a parked panel must be
`hidden` + `inert`" — live in `*.test.tsx` and run under `npm test`: milliseconds, in CI, with no images to
maintain. `npm run gallery` only answers "I want to look at it", and **there is no image baseline**: the
pictures are evidence in a review, not tests. Interaction tests that need a DOM (clicking, focus, loop
regressions) have no precedent yet; write one only after giving vitest a happy-dom environment.

E2E needs no account, session or Python: `COLABDESK_E2E_MOCK=1` makes the main process hand the CLI and the
runtime to the doubles in `src/main/e2e/` (a local `ssh2.Server` behind a WebSocket tunnel, running the same
production code path) and moves HOME into a throwaway sandbox (`COLABDESK_E2E_HOME`, deleted afterwards).
Two rules:

- **Assertions are written only where the user can see them** (DOM text, visibility, status-bar readings).
  The fixture waits for the interface to be ready, not for internal state; a spec that bypasses the UI and
  reads the store directly would still pass if the renderer crashed.
- The doubles **fail outright on any CLI subcommand they do not implement** — deliberately. A new CLI call
  added later goes red here instead of passing silently.

## Cross-platform

The targets are Windows + macOS (Linux incidentally). Platform-dependent behaviour must go through a runtime
check:

- Build paths with `path.join` and never assume `/` or `\`; in SSH configuration the opposite holds and
  forward slashes are mandatory (see `ssh-config.ts`).
- Windows does not know `/dev/null` (it wants `NUL`); there is no SIGHUP; `~` expands through `os.homedir()`.
- External terminals: `cmd /c start` on Windows, `osascript` on macOS, and a list of terminal emulators tried
  in order on Linux.
- `windowsHide: true` is the default for every child process (wrapped in `colab/cli.ts` and `colab/login.ts`).

## Remote and network

Connections to `colab.research.google.com` are reset intermittently (`SSLEOFError`). The rules:

- **Read-only commands retry once** (quota, session sync, the SSH handshake); **commands with side effects
  never retry** (create, stop).
- A failure must say something actionable rather than just "it failed": the HTTP status mapping lives in
  `explainHandshakeFailure` in `ssh/connection.ts`, and the network-flavoured copy in `lib/failure.ts`.
