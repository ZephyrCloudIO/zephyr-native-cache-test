# zephyr-native-cache-test

Test harness for `zephyr-native-cache` — the native caching layer for Module Federation on Metro/React Native.

## Dependency model

Federated dependencies are consumed directly from npm:

| Package                                                                   | Version                       |
| ------------------------------------------------------------------------- | ----------------------------- |
| `@module-federation/metro` / `metro-plugin-rnef` / `runtime` (and overrides for `error-codes`, `sdk`, `runtime-core`) | `2.9.0` |
| `zephyr-native-cache`                                                     | `1.2.2` |
| `zephyr-metro-plugin`                                                     | `1.2.2` |

The `@module-federation/*` overrides live in `package.json` `pnpm.overrides` so transitive resolutions stay aligned with the direct dependencies.

To bump any of these: edit the version in the root `package.json` (overrides) and the app `devDependencies` / `dependencies`, then run `pnpm install` followed by `pnpm dev:raw` (Metro cache reset).

`vendor/mf-core` is an optional Module Federation R&D submodule. It is not used by default app installs or dev commands. Use `git submodule update --init --recursive` and `pnpm build:mf-core` only when intentionally producing local MF tarballs for an experiment.

## Test Apps

Host and remote apps live in `apps/`. Use them to verify cache behavior end-to-end (cache-hit, downloaded, skipped, polling).

## E2E OTA Test

The OTA E2E flow is orchestrated by `scripts/e2e-ota.tsx` with two frontends:

- `pnpm e2e` — ink TUI dashboard (default for interactive terminals)
- `CI=1 pnpm e2e` — plain sequential logs, no TUI

**Use CI mode (`CI=1 pnpm e2e`) when debugging.** The TUI captures and buffers output which makes it harder to see errors in real time. CI mode streams all task and server output directly to stdout — easier to spot failures, copy stack traces, and pipe to files.
