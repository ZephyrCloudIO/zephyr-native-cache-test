# MF Core Submodule Workflow

This repo consumes published npm packages by default. The `vendor/mf-core` git submodule is available for Module Federation R&D when you need to build and test local MF package changes before a canary is published.

## Default Setup

For normal app development, use npm dependencies only:

```bash
pnpm install
pnpm dev
```

The app manifests pin:

- `@module-federation/metro`, `@module-federation/metro-plugin-rnef`, and `@module-federation/runtime` to `0.0.0-main-20260508022256`
- `zephyr-native-cache` and `zephyr-metro-plugin` to `0.0.0-canary.60`

Root `pnpm.overrides` keeps transitive `@module-federation/*` packages aligned to the same canary.

## Initialize The Submodule

The submodule is tracked at `vendor/mf-core` and follows `feat/native-cache-hashes`.

```bash
git submodule update --init --recursive
git submodule status vendor/mf-core
```

To update it to the configured branch tip:

```bash
git submodule update --remote --recursive vendor/mf-core
```

If the submodule pointer changes and you want that exact commit shared with the repo, commit the `vendor/mf-core` gitlink change in the parent repo.

## Build Local MF Tarballs

Use the submodule only when intentionally producing local MF package tarballs:

```bash
pnpm build:mf-core
```

This runs `scripts/build-mf-core.sh`, which installs/builds the MF packages inside `vendor/mf-core` and writes generated tarballs to `tarballs/`:

- `module-federation-error-codes.tgz`
- `module-federation-sdk.tgz`
- `module-federation-runtime-core.tgz`
- `module-federation-runtime.tgz`
- `module-federation-metro.tgz`
- `module-federation-metro-plugin-rnef.tgz`

`tarballs/*.tgz` is ignored by git. These artifacts are local experiment outputs, not committed release assets.

## Consume Local Tarballs Temporarily

The repo does not consume `tarballs/` by default. To test a local MF build, temporarily change the relevant package specs to `file:` tarballs.

For app-level dependencies, update `apps/*/package.json` as needed:

```json
"@module-federation/metro": "file:../../tarballs/module-federation-metro.tgz",
"@module-federation/metro-plugin-rnef": "file:../../tarballs/module-federation-metro-plugin-rnef.tgz",
"@module-federation/runtime": "file:../../tarballs/module-federation-runtime.tgz"
```

For transitive internals, update root `package.json` `pnpm.overrides` as needed:

```json
"@module-federation/error-codes": "file:./tarballs/module-federation-error-codes.tgz",
"@module-federation/sdk": "file:./tarballs/module-federation-sdk.tgz",
"@module-federation/runtime-core": "file:./tarballs/module-federation-runtime-core.tgz",
"@module-federation/runtime": "file:./tarballs/module-federation-runtime.tgz"
```

Then refresh dependencies and start Metro with a cache reset:

```bash
pnpm install
pnpm dev:raw
```

`.pnpmfile.cjs` strips integrity hashes for `file:tarballs/` resolutions so pnpm re-extracts rebuilt tarballs after each local pack.

## Return To Published Packages

After the experiment, switch package specs and overrides back to published versions, then reinstall:

```bash
pnpm install
pnpm dev:raw
```

Before opening or updating a PR, verify the repo is back on published packages unless the PR explicitly needs local tarball specs:

```bash
pnpm -r list @module-federation/metro @module-federation/metro-plugin-rnef @module-federation/runtime --depth 0
```

## Practical Rules

- Use npm canaries for normal app work.
- Use `vendor/mf-core` only for local MF source experiments.
- Commit the submodule gitlink only when the repo should pin a new R&D commit.
- Do not commit generated `tarballs/*.tgz` files.
- Do not leave `file:./tarballs` or `file:../../tarballs` specs in a PR unless that PR is explicitly about local tarball consumption.
