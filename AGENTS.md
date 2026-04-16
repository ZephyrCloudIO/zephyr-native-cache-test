# zephyr-native-cache-test

Test harness for `zephyr-native-cache` — the native caching layer for Module Federation on Metro/React Native.

## Submodules

This repo includes two git submodules under `vendor/`:

| Submodule            | Path                     | Purpose                                                    |
| -------------------- | ------------------------ | ---------------------------------------------------------- |
| `zephyr-packages`    | `vendor/zephyr-packages` | Contains `libs/zephyr-native-cache` — the cache package    |
| `mf-core`            | `vendor/mf-core`         | MF runtime fork with Metro cache layer compatibility (PR)  |

## Working in Submodules

**Edit submodules directly** — do NOT create separate worktrees for `zephyr-packages` or `mf-core` when working on cache-related changes. The submodules are the working copies:

- `vendor/zephyr-packages/libs/zephyr-native-cache/` — cache package source
- `vendor/mf-core/packages/metro-core/` — MF runtime Metro integration

Changes to these submodules are committed within this repo's context, then synced upstream via their respective PRs.

## Test Apps

Host and remote apps live in `apps/`. Use them to verify cache behavior end-to-end (cache-hit, downloaded, skipped, polling).

## E2E OTA Test

The OTA E2E flow is orchestrated by `scripts/e2e-ota.tsx` with two frontends:

- `pnpm e2e` — ink TUI dashboard (default for interactive terminals)
- `CI=1 pnpm e2e` — plain sequential logs, no TUI

**Use CI mode (`CI=1 pnpm e2e`) when debugging.** The TUI captures and buffers output which makes it harder to see errors in real time. CI mode streams all task and server output directly to stdout — easier to spot failures, copy stack traces, and pipe to files.
