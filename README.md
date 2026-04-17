# zephyr-native-cache-test

Test repo for validating the `zephyr-native-cache` integration with React Native Module Federation (Metro).

Validates two draft PRs together:

- **mf-core** [#4576](https://github.com/module-federation/core/pull/4576) — SHA-256 manifest hashes + ICacheLayer runtime contract
- **zephyr-packages** [#412](https://github.com/ZephyrCloudIO/zephyr-packages/pull/412) — native cache package (Kotlin/ObjC)

### Why submodules + tarballs

Both PRs are in-flight drafts that need to be iterated on locally before upstreaming. Rather than `pnpm add`-ing published versions, `vendor/` pins the PR branches as git submodules; `scripts/build-*.sh` packs them into `.tgz` tarballs on change; and `pnpm.overrides` in `package.json` redirects every transitive MF dependency at those tarballs. Editing a file in `vendor/` → restart `pnpm dev` → rebuild → reinstall → ready, all automated.

## Architecture

Three React Native apps using Module Federation over Metro:

| App          | Port | Role                                    |
| ------------ | ---- | --------------------------------------- |
| `host`       | 8081 | Host app, loads mini + nested-mini      |
| `mini`       | 8082 | Remote, exposes `./info`                |
| `nested-mini`| 8083 | Remote, exposes `./nestedMiniInfo`, consumes mini |

The host app registers the native cache layer via `register({ forceCacheInDev: true })` in `index.js`, which enables disk caching of remote bundles through the `ICacheLayer` interface.

## Setup

### Prerequisites

- Node.js >= 20
- pnpm 10.x
- Xcode (for iOS)
- Ruby + Bundler (for CocoaPods via rnef)

### Clone

```bash
git clone --recurse-submodules <repo-url>
cd zephyr-native-cache-test
```

If you already cloned without submodules:

```bash
git submodule update --init
```

### Checkout PR branches in submodules

The submodules need to be on the PR branches (not main):

```bash
cd vendor/mf-core
git fetch origin pull/4576/head:pr/4576-metro-cache
git checkout pr/4576-metro-cache

cd ../zephyr-packages
git fetch origin pull/412/head:pr/412-native-cache
git checkout pr/412-native-cache
```

## Development

### Start everything

```bash
pnpm dev
```

This is the smart default. It checks vendor submodule state, decides whether a rebuild is needed, and launches all three Metro dev servers. On a cold start or after changing vendor code it runs the full build pipeline and resets Metro's transformer cache. On subsequent runs with unchanged vendors it skips straight to launching Metro with a warm cache.

The full pipeline (when a rebuild is needed):

1. `build:mf-core` + `build:native-cache` — builds and packs tarballs from vendor submodules (parallel)
2. `refresh` — `pnpm install` to unpack updated tarballs into node_modules
3. `dev` — starts all three Metro servers with `--reset-cache`

Turbo caches the build tasks based on submodule state (commit SHA + uncommitted changes). When nothing changed, builds resolve instantly from cache and Metro reuses its transformer cache — saving significant startup time.

Explicit subcommands:

| Command | What it does |
| --- | --- |
| `pnpm dev:v1` / `dev:v2` / `dev:v3` | Pin the remotes to a specific version bundle (via `REMOTE_VERSION`) and always reset Metro's cache. Use these when demoing OTA updates locally without going through the Zephyr e2e flow. `mini` falls back to v2 for v3 since it has no v3 content. |
| `pnpm dev:cached` | Skip builds entirely, launch Metro with warm cache. |
| `pnpm dev:raw` | Force the full build pipeline + Metro cache reset (what `pnpm dev` runs when vendor source changed). |

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

Edit source directly in the submodules:

- `vendor/mf-core/` — metro-core plugin, asyncRequire, cache interface
- `vendor/zephyr-packages/` — BundleCacheLayer, CacheManager, native modules

After editing, restart `pnpm dev` — it detects the changes, rebuilds tarballs, reinstalls, and resets Metro's cache automatically.

Key files:

| File | What it does |
| ---- | ------------ |
| `vendor/zephyr-packages/libs/zephyr-native-cache/src/BundleCacheLayer.ts` | Core cache layer — loadBundle, hash verification, dev-mode path |
| `vendor/zephyr-packages/libs/zephyr-native-cache/src/register.ts` | Sets up `__FEDERATION__.__NATIVE__.__CACHE_LAYER__` and `__CACHE__` globals |
| `vendor/mf-core/packages/metro-core/src/modules/metroCorePlugin.ts` | afterResolve hook — extracts hashes from manifest, registers with cache layer |
| `vendor/mf-core/packages/metro-core/src/modules/asyncRequire.ts` | Routes bundle loading through cache handler when registered |
| `apps/host/index.js` | Entry point — calls `register()` before app startup |

## Project structure

```
zephyr-native-cache-test/
├── vendor/
│   ├── mf-core/              # git submodule → module-federation/core PR #4576
│   └── zephyr-packages/      # git submodule → ZephyrCloudIO/zephyr-packages PR #412
├── scripts/
│   ├── dev.sh                 # smart entrypoint — port check, vendor state, mode selection
│   ├── check-ports.sh         # detects busy Metro ports and prompts to kill
│   ├── vendor-state.sh        # generates submodule state hashes for turbo cache keys
│   ├── build-mf-core.sh       # builds + packs 6 @module-federation/* tarballs
│   └── build-native-cache.sh  # builds + packs zephyr-native-cache tarball
├── tarballs/                  # .tgz artifacts (gitignored, built from vendor)
├── apps/
│   ├── host/                  # port 8081
│   ├── mini/                  # port 8082
│   └── nested-mini/           # port 8083
├── turbo.json                 # pipeline: build → refresh → dev
└── package.json               # pnpm overrides for transitive MF deps
```
