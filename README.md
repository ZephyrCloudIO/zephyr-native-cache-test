# zephyr-native-cache-test

Test repo for validating the `zephyr-native-cache` integration with React Native Module Federation (Metro).

Validates the cache integration using:

- **mf-core** [#4576](https://github.com/module-federation/core/pull/4576) — SHA-256 manifest hashes + ICacheLayer runtime contract
- **zephyr-native-cache** `0.0.0-canary.55` — published canary package
- **zephyr-metro-plugin** `0.0.0-canary.55` — published canary package

### Dependency model

`zephyr-native-cache` and `zephyr-metro-plugin` are consumed directly from npm canary versions. `mf-core` is still iterated locally through the `vendor/mf-core` submodule and packed into local MF tarballs.

## Architecture

Three React Native apps using Module Federation over Metro (RN 0.80, new-arch / bridgeless enabled on both iOS and Android):

| App          | Port | Role |
| ------------ | ---- | ---- |
| `host`       | 8081 | Health-dashboard UI that loads every exposed remote module. Registers the native cache layer on startup. |
| `mini`       | 8082 | Remote. Exposes `StatsCard`, `DeployCard`, `CalorieCard`. Source lives under `src/` (v1), `src/v2/` (v2). No v3 — falls back to v2 for v3 demos. |
| `nested-mini`| 8083 | Remote. Exposes `ActivityFeed`, `CacheInfo`, `HydrationCard`. Also *consumes* `mini/info` to exercise nested remote loading. Source under `src/`, `src/v2/`, `src/v3/` (only `CacheInfo` has v3 content). |

Version switching is driven by `REMOTE_VERSION=v1|v2|v3` — each remote's `metro.config.js` maps that to the source prefix that gets exposed at build/serve time. See [Development](#development) for the `dev:v*` scripts.

**Cache layer wiring** — `apps/host/index.js` calls `register({ forceCacheInDev: true, pollIntervalMs: 15_000 })` before `AppRegistry.registerComponent`, which installs:

- `globalThis.__FEDERATION__.__NATIVE__.__CACHE_LAYER__` — the `BundleCacheLayer` instance (implements the `ICacheLayer` contract consumed by mf-core's `asyncRequire`)
- `globalThis.__FEDERATION__.__NATIVE__.__CACHE__` — the async bundle loader that mf-core's `asyncRequire` routes through
- `globalThis.__MFE_CHECK_UPDATES__` / `__MFE_START_UPDATE_POLLING__` / `__MFE_STOP_UPDATE_POLLING__` — manual polling controls for the DevTools panel

The runtime plugin registered in each Metro config (`withZephyr` + `zephyr-native-cache/src/runtime-plugin.ts`) hooks MF's `afterResolve` and `beforeInit` to extract bundle hashes from manifests and feed them to the cache layer for integrity verification and background polling.

## Setup

### Requirements

Exact versions listed are what the repo has been tested against; stated minimums are the floor.

| Tool | Minimum | Tested with | Notes |
| --- | --- | --- | --- |
| **Node.js** | 20.x | 24.14.1 | `>=20` enforced in `package.json` `engines` |
| **pnpm** | 10.x | 10.33.0 | Enforced via `packageManager` field; use `corepack enable` to auto-install |
| **Watchman** | any recent | 2025.x | Required for Metro's file watcher on macOS |
| **Java JDK** | 17 | 17 | Required by Android Gradle Plugin 8.x / RN 0.80 |

**iOS (native builds + e2e):**

| Tool | Minimum | Notes |
| --- | --- | --- |
| **Xcode** | 15 | Repo tested with 26.3. Install full Xcode, not just CLT. |
| **Ruby** | 2.6.10 | See `apps/host/Gemfile`. Ruby 3.4 works too — the Gemfile already pins the extra stdlib gems that 3.4 removed. |
| **Bundler** | 2.x | `gem install bundler` or via rbenv/asdf |
| **CocoaPods** | 1.13+ (not 1.15.0/1.15.1) | Installed via `bundle install` in `apps/host` |

**Android (native builds + e2e):**

| Tool | Notes |
| --- | --- |
| **Android SDK** | `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) must be exported |
| **Platform tools + emulator** | Add `$ANDROID_HOME/platform-tools` and `$ANDROID_HOME/emulator` to `PATH` so `adb` and `emulator` resolve |
| **An AVD** | Create one in Android Studio → Device Manager. The e2e preflight will offer to boot the first listed AVD if none is running; override via `ZE_ANDROID_AVD=<name>`. |
| **Compile SDK 35, min SDK 24** | Matches `apps/host/android/app/build.gradle` |

**e2e flow (both mocked and Zephyr-backed):**

| Tool | Notes |
| --- | --- |
| **Maestro** | Install via [maestro.mobile.dev](https://maestro.mobile.dev). Verify with `maestro --version`. |
| **Zephyr token** *(Zephyr flow only)* | Copy `.env.e2e.example` → `.env.e2e` and fill in `ZE_SECRET_TOKEN` from the Zephyr dashboard. See [ZEPHYR_OTA_DEMO.md](./ZEPHYR_OTA_DEMO.md) for the full dashboard walkthrough. |

### Clone

```bash
git clone --recurse-submodules git@github.com:<org>/zephyr-native-cache-test.git
cd zephyr-native-cache-test
```

If you cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

`.gitmodules` pins `mf-core` to the working branch (`feat/native-cache-hashes`) — no manual branch checkout needed.

### First-run bootstrap

Run a standard install:

```bash
pnpm install
```

`scripts/dev.sh` still handles `mf-core` tarball rebuilds when that submodule changes. Zephyr packages are resolved from npm canary versions, so no local Zephyr tarball bootstrap is needed.

**Explicit (for debugging setup issues):**

```bash
pnpm build:mf-core         # pack 6 @module-federation/* tarballs from vendor/mf-core
pnpm install               # refresh workspace dependencies
```

**iOS (native builds):** in `apps/host`, one-time Bundler setup, then pods on every vendor rebuild:

```bash
cd apps/host
bundle install             # first time only
pnpm pods                  # installs / updates CocoaPods
```

**Android (native builds):** no pre-step needed — Gradle resolves everything on first `pnpm run:android` / `rnef run:android`.

## Development

### Start everything

```bash
pnpm dev
```

This is the smart default. It checks `vendor/mf-core` state, decides whether an MF rebuild is needed, and launches all three Metro dev servers. On a cold start or after changing `mf-core` it runs the build pipeline and resets Metro's transformer cache. On subsequent runs with unchanged `mf-core` it skips straight to launching Metro with a warm cache.

The full pipeline (when a rebuild is needed):

1. `build:mf-core` — builds and packs MF tarballs from `vendor/mf-core`
2. `refresh` — `pnpm install` to unpack updated tarballs into node_modules
3. `dev` — starts all three Metro servers with `--reset-cache`

Turbo caches the MF build task based on submodule state (commit SHA + uncommitted changes). When nothing changed, builds resolve instantly from cache and Metro reuses its transformer cache — saving significant startup time.

Explicit subcommands:

| Command | What it does |
| --- | --- |
| `pnpm dev:v1` / `dev:v2` / `dev:v3` | Pin the remotes to a specific version bundle (via `REMOTE_VERSION`) and always reset Metro's cache. Use these when demoing OTA updates locally without going through the Zephyr e2e flow. `mini` falls back to v2 for v3 since it has no v3 content. |
| `pnpm dev:cached` | Skip builds entirely, launch Metro with warm cache. |
| `pnpm dev:raw` | Force the full MF build pipeline + Metro cache reset (what `pnpm dev` runs when `mf-core` changed). |

If any Metro ports (8081-8083) are already in use, the dev script will show which processes hold them and prompt to kill before continuing.

### End-to-end OTA demo

For the full Zephyr-backed OTA demo (publish → pin in dashboard → verify with Maestro), see [`ZEPHYR_OTA_DEMO.md`](./ZEPHYR_OTA_DEMO.md). Kick it off with `pnpm e2e:zephyr ios` or `pnpm e2e:zephyr android`.

### Run on iOS

In a separate terminal:

```bash
pnpm run:ios
```

### Verify cache is working

In Metro/device logs, look for:

- `[MFE-Cache] initialized` — cache layer registered
- First load: `downloaded` status (fetched + cached to disk)
- Reload (Cmd+R): `cache-hit` status (served from disk)

### Gotchas

- **The disk cache is not HMR-friendly.** Once a remote bundle is cached (status: `downloaded` or `cache-hit`), edits to that remote's source won't show up after a normal Metro reload — the host keeps serving the already-cached bundle. To see new code, tap the **red ✕** button in the bottom-right dev overlay to drop the cache, then reload. The next load will hit Metro fresh and cache the updated bundle.
- **`REMOTE_VERSION` only changes which source files Metro *bundles*; the cache keys on URL, not version.** If you switch between `dev:v1` / `dev:v2` / `dev:v3` without clearing the cache, you may still see the previously-cached bundle for that URL. Same fix: ✕ button, then reload.

### Making changes

Edit MF source directly in the submodule:

- `vendor/mf-core/` — metro-core plugin, asyncRequire, cache interface

After editing, restart `pnpm dev` — it detects the changes, rebuilds MF tarballs, reinstalls, and resets Metro's cache automatically.

Key files:

| File | What it does |
| ---- | ------------ |
| `vendor/mf-core/packages/metro-core/src/modules/metroCorePlugin.ts` | afterResolve hook — extracts hashes from manifest, registers with cache layer |
| `vendor/mf-core/packages/metro-core/src/modules/asyncRequire.ts` | Routes bundle loading through cache handler when registered |
| `apps/host/index.js` | Entry point — calls `register()` before app startup |

## Project structure

```
zephyr-native-cache-test/
├── vendor/
│   └── mf-core/              # git submodule → module-federation/core PR #4576
├── scripts/
│   ├── dev.sh                 # smart entrypoint — port check, vendor state, mode selection
│   ├── check-ports.sh         # detects busy Metro ports and prompts to kill
│   ├── vendor-state.sh        # generates submodule state hashes for turbo cache keys
│   ├── build-mf-core.sh       # builds + packs 6 @module-federation/* tarballs
├── tarballs/                  # .tgz artifacts for MF packages (gitignored)
├── apps/
│   ├── host/                  # port 8081
│   ├── mini/                  # port 8082
│   └── nested-mini/           # port 8083
├── turbo.json                 # pipeline: build → refresh → dev
└── package.json               # pnpm overrides for transitive MF deps
```
