# zephyr-native-cache-test

Test repo for validating the `zephyr-native-cache` integration with React Native Module Federation (Metro).

Validates two draft PRs together:

- **mf-core** [#4576](https://github.com/module-federation/core/pull/4576) — SHA-256 manifest hashes + ICacheLayer runtime contract
- **zephyr-packages** [#412](https://github.com/ZephyrCloudIO/zephyr-packages/pull/412) — native cache package (Kotlin/C++/ObjC++)

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

This runs the full pipeline via Turbo:

1. `build:mf-core` + `build:native-cache` — builds and packs tarballs from vendor submodules (parallel)
2. `refresh` — `pnpm install` to unpack updated tarballs into node_modules
3. `dev` — starts all three Metro servers

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

### Making changes

Edit source directly in the submodules:

- `vendor/mf-core/` — metro-core plugin, asyncRequire, cache interface
- `vendor/zephyr-packages/` — BundleCacheLayer, CacheManager, native modules

After editing, restart `pnpm dev` — it rebuilds tarballs and reinstalls automatically.

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
│   ├── build-mf-core.sh      # builds + packs 6 @module-federation/* tarballs
│   └── build-native-cache.sh # builds + packs zephyr-native-cache tarball
├── tarballs/                  # .tgz artifacts (gitignored, built from vendor)
├── apps/
│   ├── host/                  # port 8081
│   ├── mini/                  # port 8082
│   └── nested-mini/           # port 8083
├── turbo.json                 # pipeline: build → refresh → dev
└── package.json               # pnpm overrides for transitive MF deps
```
