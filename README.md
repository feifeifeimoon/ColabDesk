<h1 align="center">
  <a href="https://github.com/feifeifeimoon/ColabDesk/releases"><img src="resources/icon.png" alt="ColabDesk" width="72" valign="middle" /></a> ColabDesk
</h1>

<p align="center">
  <a href="https://github.com/feifeifeimoon/ColabDesk/actions/workflows/ci.yml"><img src="https://github.com/feifeifeimoon/ColabDesk/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/feifeifeimoon/ColabDesk/releases"><img src="https://img.shields.io/github/v/release/feifeifeimoon/ColabDesk?color=08C" alt="Latest release" /></a>
  <a href="https://github.com/feifeifeimoon/ColabDesk/releases"><img src="https://img.shields.io/github/downloads/feifeifeimoon/ColabDesk/total?color=08C" alt="Total downloads" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-4493F8" alt="Platforms: Windows and macOS" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-08C" alt="License: Apache-2.0" />
</p>

<p align="center">
  <strong>A desktop SSH console for Google Colab runtimes.</strong><br/>
  SSH in, work in a real terminal, browse the runtime's files over SFTP, and watch the compute units it is spending — in one window.
</p>

<h3 align="center"><a href="https://github.com/feifeifeimoon/ColabDesk/releases"><ins>Download</ins></a></h3>

<p align="center">
  <img src="docs/assets/hero.png" alt="ColabDesk's workbench: the session rail on the left, a Qwen chat running in the terminal, vLLM server logs, an nvidia-smi GPU readout, and the compute-unit status bar along the bottom" width="960" />
</p>

## What it does

- **Terminal** — xterm over one SSH connection: many tabs per runtime, search, clickable links, ten palettes that follow the light/dark theme.
- **Files** — the runtime's filesystem as a tree: drag to upload files or whole folders, download, delete, with progress and cancel.
- **Edit in place** — open a log or a config beside the terminal. Text up to 2 MiB saves with a conflict check; a half-written file never appears.
- **Sessions** — create a runtime, stop it, restart its kernel — and see whether it is still allocated, and what it is costing.
- **Quota** — balance, spend rate, projected hours, and a day/week/month trend built from readings this app records.
- **SSH** — one click writes `colabdesk-<session>` into `~/.ssh/config`, so any SSH client can attach to the same runtime.

## How to use

1. **Download** the installer from [Releases](https://github.com/feifeifeimoon/ColabDesk/releases) and open it.
2. **Sign in** with your Google account — the app opens the browser; paste the code back.
3. **New session** — pick a machine type. The terminal opens at `/content`, and the files panel shows the same directory.

The app bundles its own Python and `google-colab-cli`, so there is nothing else to install.

## Install

| Platform | File |
| --- | --- |
| Windows x64 | `colabdesk-setup-<version>-x64.exe` |
| macOS, Apple silicon | `colabdesk-<version>-arm64.dmg` |
| macOS, Intel | `colabdesk-<version>-x64.dmg` |

The builds are unsigned: Windows SmartScreen asks once — *More info* → *Run anyway*; on macOS, right-click the app → *Open*.

## Build

Requires Node 22.

```bash
npm install
npm run dev
```

`npm run package:win` / `npm run package:mac` build an installer with the runtime bundled. The gates are `npm test`, `npm run e2e` (no account or Python needed), `npm run lint` and `npm run typecheck`.

The interface's rules live in [docs/DESIGN.md](docs/DESIGN.md); the engineering conventions in [AGENTS.md](AGENTS.md).

## License

Apache-2.0. Unofficial, not affiliated with Google.
