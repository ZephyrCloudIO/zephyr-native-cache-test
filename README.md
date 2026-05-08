# zephyr-native-cache-test

Test repo for validating the `zephyr-native-cache` integration with React Native Module Federation (Metro).

Validates the cache integration using:

- **@module-federation/\*** `0.0.0-main-20260508022256` — canary build with SHA-256 manifest hashes + ICacheLayer runtime contract ([#4576](https://github.com/module-federation/core/pull/4576))
- **zephyr-native-cache** `1.1.0` — published npm release
- **zephyr-metro-plugin** `1.1.0` — published npm release

## Dependency model

Federated dependencies are consumed directly from npm:

- `@module-federation/metro`, `@module-federation/metro-plugin-rnef`, `@module-federation/runtime` (and the `error-codes` / `sdk` / `runtime-core` / `runtime` overrides) are pinned to canary `0.0.0-main-20260508022256`.
- `zephyr-native-cache` and `zephyr-metro-plugin` are pinned to `1.1.0`.

`pnpm install` is the bootstrap step for dependency setup.

The `vendor/mf-core` submodule is available for Module Federation R&D. It is not part of the default dependency resolution path; use `pnpm build:mf-core` only when intentionally producing local MF tarballs for an experiment. See [MF Core Submodule Workflow](./docs/mf-core-submodule.md).

## Architecture

Three React Native apps using Module Federation over Metro (RN 0.80, new-arch / bridgeless enabled on both iOS and Android):

| App          | Port | Role |
| ------------ | ---- | ---- |
| `host`       | 8081 | Health-dashboard UI that loads every exposed remote module. Registers the native cache layer on startup. |
| `mini`       | 8082 | Remote. Exposes `StatsCard`, `DeployCard`, `CalorieCard`. Source lives under `src/` (v1), `src/v2/` (v2). No v3 — falls back to v2 for v3 demos. |
| `nested-mini`| 8083 | Remote. Exposes `ActivityFeed`, `CacheInfo`, `HydrationCard`. Also *consumes* `mini/info` to exercise nested remote loading. Source under `src/`, `src/v2/`, `src/v3/` (only `CacheInfo` has v3 content). |

Version switching is driven by `REMOTE_VERSION=v1|v2|v3` — each remote's `metro.config.js` maps that to the source prefix that gets exposed at build/serve time. See [Development](#development) for the `dev:v*` scripts.

**Cache layer wiring** — `apps/host/index.js` calls `ZephyrNativeCache.register({ forceCacheInDev: true, pollIntervalMs: 15_000 })` before `AppRegistry.registerComponent`, which installs:

- `globalThis.__ZEPHYR__.runtime.nativeCache.refs.cacheLayer` — the `BundleCacheLayer` instance
- `globalThis.__FEDERATION__.__NATIVE__.__CACHE__` — the async bundle loader that `@module-federation/runtime`'s `asyncRequire` routes through
- `globalThis.__ZEPHYR__.runtime.nativeCache.controls` — control helpers (`checkForUpdates`, `startUpdatePolling`, `stopUpdatePolling`, `clearCache`)
- `globalThis.__MFE_CHECK_UPDATES__` / `__MFE_START_UPDATE_POLLING__` / `__MFE_STOP_UPDATE_POLLING__` — backward-compatible global aliases used by the DevTools panel

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
git clone git@github.com:<org>/zephyr-native-cache-test.git
cd zephyr-native-cache-test
```

### First-run bootstrap

Run a standard install:

```bash
pnpm install
```

That's it — every federated dependency is resolved from npm.

**iOS (native builds):** in `apps/host`, one-time Bundler setup, then pods after dependency changes:

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

Checks for busy Metro ports (8081-8083), prompts to free them, then launches all three Metro dev servers via turbo with a warm cache.

Explicit subcommands:

| Command | What it does |
| --- | --- |
| `pnpm dev:v1` / `dev:v2` / `dev:v3` | Pin the remotes to a specific version bundle (via `REMOTE_VERSION`) and always reset Metro's cache. Use these when demoing OTA updates locally without going through the Zephyr e2e flow. `mini` falls back to v2 for v3 since it has no v3 content. |
| `pnpm dev:cached` | Run the port check, then launch Metro directly with a warm cache. |
| `pnpm dev:raw` | Run the full `turbo run dev` pipeline (Metro with `--reset-cache`). Use after `pnpm install` bumps an MF or Zephyr dependency. |

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

MF source for the apps is consumed from published npm packages. To experiment with a different MF build, bump the canary version pinned in `package.json` (root `pnpm.overrides`) and the app `devDependencies`, then `pnpm install` and `pnpm dev:raw`.

For local MF R&D against the submodule:

```bash
git submodule update --init --recursive
pnpm build:mf-core
```

`pnpm build:mf-core` packs the MF packages from `vendor/mf-core` into `tarballs/`. To consume those tarballs, temporarily point the relevant `@module-federation/*` specs or root overrides at the generated `file:` tarballs, run `pnpm install`, then use `pnpm dev:raw`.

Key files:

| File | What it does |
| ---- | ------------ |
| `apps/host/index.js` | Entry point — calls `register()` before app startup |
| `apps/*/metro.config.js` | Wires `withZephyr` + the runtime plugin into Metro |

## Project structure

```text
zephyr-native-cache-test/
├── vendor/
│   └── mf-core/              # optional Module Federation R&D submodule
├── scripts/
│   ├── dev.sh                 # smart entrypoint — port check + turbo dev
│   ├── check-ports.sh         # detects busy Metro ports and prompts to kill
│   ├── check-native-cache.sh  # invalidates rnef build cache on native input changes
│   ├── build-mf-core.sh       # packs optional local MF tarballs from vendor/mf-core
│   ├── build-e2e-versions.sh  # builds v1/v2/v3 remote bundles for OTA fixtures
│   └── e2e-ota*.tsx           # OTA e2e orchestrator (mocked + Zephyr flows)
├── tarballs/                  # generated local MF package tarballs
├── apps/
│   ├── host/                  # port 8081
│   ├── mini/                  # port 8082
│   └── nested-mini/           # port 8083
├── packages/
│   └── zephyr-metro-rnef-plugin/  # local rnef plugin wrapper around zephyr-metro-plugin
├── turbo.json                 # pipeline: refresh → dev
└── package.json               # pnpm overrides pin @module-federation/* canary
```
