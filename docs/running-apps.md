# Running the Apps

This monorepo uses **Bun** as the package manager and **Turborepo** as the task
runner. All commands below must be run with `bun`, never `npm` or `pnpm`.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| [Bun](https://bun.sh) | 1.3+ | `curl -fsSL https://bun.sh/install \| bash` |
| [Node.js](https://nodejs.org) | 18+ | Required by some Turbo sub-tasks |
| [Rust + Cargo](https://rustup.rs) | 1.77+ | For desktop (Tauri) only |
| [Android Studio](https://developer.android.com/studio) | Latest | For Android mobile only |
| [Xcode](https://developer.apple.com/xcode/) | 14+ | For iOS mobile only (macOS) |

### Install all dependencies (once)

```bash
bun install
```

---

## Web App — `packages/usfm-editor-app`

The main USFM translation editor. Runs as a React SPA served by Vite.

### Start dev server

```bash
# From monorepo root (recommended)
bun run editor-app

# Or from the package directory
cd packages/usfm-editor-app
bun run dev
```

Opens at **http://localhost:5180**

### Build for production

```bash
cd packages/usfm-editor-app
bun run build
# Output: packages/usfm-editor-app/dist/
```

### Preview production build

```bash
cd packages/usfm-editor-app
bun run preview
# Opens at http://localhost:4180
```

### Type-check

```bash
cd packages/usfm-editor-app
bun run check-types
```

### Key routes

| Route | Description |
|-------|-------------|
| `/` | Home page — open/create projects |
| `/editor` | Standalone USFM editor (DCS mode) |
| `/project/:id` | Local project dashboard |
| `/project/:id/editor` | Editor for a local project |
| `/dcs-project` | DCS-hosted project viewer |

---

## USFM Playground — `packages/usfm-playground`

Browser-based USFM ↔ USJ ↔ USX conversion tool (no React, uses CodeMirror).

### Start dev server

```bash
# From monorepo root
bun run playground

# Or from the package directory
cd packages/usfm-playground
bun run dev
```

### Build

```bash
cd packages/usfm-playground
bun run build
# Output: packages/usfm-playground/dist/
```

---

## Desktop App — `apps/desktop` (Tauri)

A native desktop wrapper for the web app using [Tauri 2](https://tauri.app/).
Supports **Windows**, **macOS**, and **Linux**.

### Additional prerequisites

- Rust toolchain: `rustup install stable`
- Platform-specific Tauri system dependencies:
  - **Linux**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
  - **Windows**: Visual Studio Build Tools with C++ workload
  - **macOS**: Xcode command-line tools (`xcode-select --install`)
- Tauri CLI (installed as a dev dependency, no global install needed)

### Dev mode (hot-reload)

```bash
cd apps/desktop
bun run dev
# Tauri will:
#   1. Build the web front-end (packages/usfm-editor-app)
#   2. Open a native window pointed at http://localhost:5180
```

> **Note:** `tauri.conf.json` sets `devUrl` to `http://localhost:5180`.
> The web dev server in `packages/usfm-editor-app` must be running
> (or Tauri's `beforeDevCommand` will build it automatically).

### Build distributable

```bash
cd apps/desktop
bun run build
# Output: apps/desktop/src-tauri/target/release/bundle/
```

Produces installers for the current OS:
- **Windows**: `.msi` and `.exe` (NSIS) in `bundle/msi/` and `bundle/nsis/`
- **macOS**: `.dmg` and `.app` in `bundle/dmg/` and `bundle/macos/`
- **Linux**: `.deb` and `.AppImage` in `bundle/deb/` and `bundle/appimage/`

### Web-only build (without native window)

```bash
cd apps/desktop
bun run build:web
# Builds just the Vite front-end to apps/desktop/dist/
```

### Platform adapter

The desktop app uses `@usfm-tools/platform-adapters` with the **Tauri adapter**
(`createTauriPlatformAdapter`) which provides:

| Feature | Tauri plugin |
|---------|--------------|
| Key-value storage | `@tauri-apps/plugin-store` (JSON file) |
| File system access | `@tauri-apps/plugin-fs` |
| Network detection | `navigator.onLine` (web) |

Allowed file-system paths (see `tauri.conf.json`):
- `$APPDATA/**` — application data
- `$DOCUMENT/**` — user documents
- `$DOWNLOAD/**` — downloads folder
- `$DESKTOP/**` — desktop

---

## Mobile App — `apps/mobile` (Capacitor)

A native mobile shell using [Capacitor 7](https://capacitorjs.com/).
Supports **Android** and **iOS**.

### How it works

1. The web app (`packages/usfm-editor-app`) is built to a `dist/` folder.
2. Capacitor wraps that `dist/` as the web content inside a native project.
3. Native plugins (SQLite, Preferences, Filesystem, Network) are bridged via
   Capacitor's plugin layer.

### Build web assets first

```bash
cd apps/mobile
bun run build:web
# Vite builds packages/usfm-editor-app → apps/mobile/dist/
```

### Sync web assets to native projects

```bash
# After every web build, sync to both platforms:
cd apps/mobile
bun run sync:android   # copies dist/ → android/app/src/main/assets/public
bun run sync:ios       # copies dist/ → ios/App/App/public
```

### Android

#### Requirements
- Android Studio with Android SDK (API 24+)
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` env var set
- Java 17 (bundled with Android Studio)

#### Open in Android Studio

```bash
cd apps/mobile
bun run open:android
# Opens the android/ project in Android Studio
```

Then use Android Studio to run on an emulator or a connected device.

#### Run directly (requires connected device or running emulator)

```bash
cd apps/mobile
bun run run:android
```

#### Complete Android workflow

```bash
cd apps/mobile
bun run build:web       # 1. Build web front-end
bun run sync:android    # 2. Sync to Android project
bun run run:android     # 3. Deploy & run on device/emulator
```

### iOS (macOS only)

#### Requirements
- Xcode 14+ with iOS SDK
- CocoaPods: `gem install cocoapods` (or `brew install cocoapods`)
- Apple Developer account for device deployment (not needed for simulator)

#### Open in Xcode

```bash
cd apps/mobile
bun run open:ios
# Opens the ios/ project in Xcode
```

Then use Xcode to run on a simulator or connected device.

#### Run directly (requires connected device or running simulator)

```bash
cd apps/mobile
bun run run:ios
```

#### Complete iOS workflow

```bash
cd apps/mobile
bun run build:web    # 1. Build web front-end
bun run sync:ios     # 2. Sync to iOS project (runs pod install)
bun run run:ios      # 3. Deploy & run on device/simulator
```

### Capacitor configuration (`apps/mobile/capacitor.config.ts`)

| Setting | Value | Notes |
|---------|-------|-------|
| App ID | `org.usfmtools.editor` | Bundle identifier |
| App name | `USFM Editor` | Display name |
| Web dir | `dist` | Relative to `apps/mobile/` |
| Android scheme | `https` | Avoids cross-origin issues with IndexedDB |
| SQLite location (iOS) | `Library/LocalDatabase` | Excluded from iCloud backup |

### Platform adapter

The mobile app uses `@usfm-tools/platform-adapters` with the **Capacitor adapter**
(`createCapacitorPlatformAdapter`) which provides:

| Feature | Capacitor plugin |
|---------|-----------------|
| Key-value storage | `@capacitor/preferences` (SharedPreferences / NSUserDefaults) |
| File system access | `@capacitor/filesystem` |
| Network detection | `@capacitor/network` |
| SQLite database | `@capacitor-community/sqlite` |

---

## WebSocket Relay Server — `packages/usfm-relay-server`

Optional Cloudflare Workers service for real-time collaboration across devices.
Not required for offline or single-device use.

### Local development

```bash
# From monorepo root
bun run relay:dev

# Or from the package directory
cd packages/usfm-relay-server
bun run dev
```

Starts a local Wrangler dev server on **http://localhost:8787**.

### Deploy to Cloudflare

```bash
# From monorepo root
bun run relay:deploy

# Or from the package directory
cd packages/usfm-relay-server
bun run deploy
```

Requires `CLOUDFLARE_API_TOKEN` in environment or `wrangler login`.

---

## Running Everything at Once

Turborepo can start all `dev` targets in parallel:

```bash
# Start all packages that have a "dev" script (web app + playground + relay)
bun run dev
```

To start only specific apps, use Turbo's `--filter` flag:

```bash
# Web app only
bun run dev --filter=@usfm-tools/editor-app

# Playground only
bun run dev --filter=@usfm-tools/playground

# Relay server only
bun run relay:dev
```

---

## Running Tests

```bash
# All tests across all packages
bun run test

# Specific package
cd packages/usfm-editor-adapters
bunx jest --no-coverage

# Web platform-adapters only
cd packages/platform-adapters
bunx jest --no-coverage

# door43-rest package
cd packages/usfm-door43-rest
bunx jest --no-coverage
```

---

## Building All Packages

```bash
# Build everything (Turborepo handles dependency order)
bun run build

# Build a specific package and all its dependencies
bun run build --filter=@usfm-tools/editor-app
```

---

## Environment Variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `VITE_DCS_HOST` | Web / Desktop / Mobile | Override default DCS host (`git.door43.org`) |
| `CLOUDFLARE_API_TOKEN` | Relay server | Required for `wrangler deploy` |
| `ANDROID_HOME` | Mobile (Android) | Path to Android SDK |

Create a `.env.local` file in `packages/usfm-editor-app/` for web/desktop
development overrides (Vite loads it automatically, it is git-ignored).

---

## Architecture Overview

```
packages/usfm-editor-app/     ← Shared React SPA (web source of truth)
        ↓ built dist/ copied to
apps/desktop/dist/            ← Tauri wraps this in a native window
apps/mobile/dist/             ← Capacitor wraps this in a WebView

packages/platform-adapters/
  src/web/                    ← WebKeyValueAdapter, WebNetworkAdapter, WebFontAdapter
  src/tauri/                  ← TauriKvAdapter, TauriFileSystemAdapter
  src/capacitor/              ← CapacitorKvAdapter, CapacitorFileSystemAdapter
```

The same React codebase runs on all three platforms. The `PlatformProvider`
(mounted in `main.tsx`) injects the correct adapter set so components access
storage, network status, and fonts through a single unified API regardless of
the runtime.
