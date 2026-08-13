# Nens

A lighter Lens — a small desktop Kubernetes client. Built with [Wails v2](https://wails.io) (Go + React), so it ships as a single binary instead of an Electron bundle.

## What it does

- Connect to any context in your kubeconfig, add or paste extra kubeconfig files
- Live resource tables backed by informers, virtualized, with Excel-style cell selection
- YAML view, edit and server-side apply; create new objects from templates
- Container logs and an interactive shell as dockable panels
- Port forwarding
- API discovery, so CRDs show up as first-class kinds
- Cluster overview with node/pod metrics from `metrics.k8s.io`
- Helm releases: list, values, history, rollback, uninstall

## Install

Download the asset for your platform from the latest release:

```
https://github.com/khanhsnd/nens-k8s/releases/latest
```

Nothing is signed or notarized yet, so each platform needs one extra step.

### Windows 10/11 x64 — `nens-<version>-windows-x64-setup.exe`

Run the installer. SmartScreen will warn: **More info** → **Run anyway**.

### macOS 12+ universal — `nens-<version>-macos-universal.zip`

Unzip, move `nens.app` to Applications, then clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/nens.app
```

### Linux x64 — `nens-<version>-linux-x64.tar.gz`

Needs GTK3 and WebKit2GTK 4.1. On Debian/Ubuntu:

```bash
sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0
```

Then unpack and run:

```bash
tar -xzf nens-*-linux-x64.tar.gz && ./nens-*-linux-x64/nens
```

Every release ships a `checksums.txt` you can verify a download against.

## Update

**Settings → Updates** checks GitHub Releases on demand — it never polls in the background.

- **Windows** — *Install and restart* downloads and installs the new version in place.
- **macOS / Linux** — the button opens the release page; download the new asset and repeat the install steps above.

## Build from source

Needs Go 1.25+, Node with pnpm, and the [Wails CLI](https://wails.io/docs/gettingstarted/installation).

```bash
wails dev
```

```bash
wails build
```

## Donate 🙏

This is a free side project and I'm shamelessly begging: if Nens saved you some `kubectl` typing, a coffee would be lovely. Ko-fi takes PayPal and cards, so one button covers both.

[![Buy me a coffee on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/khanhsnd)

```
https://ko-fi.com/khanhsnd
```

No paywall, no telemetry, no nagging — the button stays here and that's it.
