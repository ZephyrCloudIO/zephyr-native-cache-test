# Real-Zephyr OTA demo — dashboard runbook

Companion doc for `pnpm e2e:zephyr <ios|android>`. The orchestrator pauses at
specific steps and expects you to make a change in the Zephyr dashboard before
pressing SPACE to continue.

This doc is a **first-draft reference** distilled from
`docs.zephyr-cloud.io`. Exact UI labels and navigation may differ slightly in
the dev dashboard or after a UI rev — if you hit something that's wrong,
correct it here and push.

> **Docs source:** `/features/tags-environments`, `/features/versions`,
> `/features/version-statuses`, `/features/instant-rollbacks`,
> `/tutorials/metro`, `/features/environment-overrides` on
> https://docs.zephyr-cloud.io

---

## Mental model (5-minute version)

| Concept | What it is | Created by |
|---|---|---|
| **Application** | An app in Zephyr (e.g. `mini`, `nested-mini`, `cache-test-host`). Has a UID of the form `<name>.<project>.<org>`. | Auto-registered on first publish. |
| **Version** | Immutable snapshot of a build. | `rnef bundle-mf-remote` (every publish = new version). |
| **Tag** | Smart pointer that resolves to a version by rules (branch / platform / etc.). | You, in the dashboard. |
| **Environment** | Deployment target. Either pinned to a specific version **or** pointed at a tag. | You, in the dashboard. Auto-created env (often `development`) shows up after first publish. |

Two resolve models exist — same outcome, different mechanism:

- **Tag-based env**: environment references a tag; moving the tag swaps the version served.
- **Version-pinned env**: environment references a specific version; you manually update the pin to switch.

For this demo, **use whichever feels more natural to narrate**. The host
resolves `<appName>@<envName>` at build time via Zephyr, and the native-cache
runtime polls the resolved manifest URL for changes.

---

## Before the first run

1. **Create a personal access token** in the standard production Zephyr
   dashboard. Copy `.env.e2e.example` to `.env.e2e` and set
   `ZE_SECRET_TOKEN`. The flow uses production endpoints by default, so
   `ZE_API_GATE` and `ZE_API` are not required.
2. The host resolves the remotes' **`DEMO` environment** in E2E mode
   (`ZEPHYR_E2E=1`, see `apps/host/zephyr.config.mjs`). Create `DEMO` on both
   remotes, pointing at a version, **before** the host build. If `DEMO` does
   not exist, the resolver silently falls back to each remote's default
   environment and the pins below never reach the app.
3. Using another environment? Change `apps/host/zephyr.config.mjs` and set
   `ZE_E2E_ENV=<name>` for the automated mode below.
4. **Have a device/simulator ready** (or don't — see below). Preflight will
   verify that at least one Android emulator / iOS simulator is booted. If
   nothing is booted, it pauses and offers to boot one for you:
   - Android: picks the first AVD from `emulator -list-avds`. Override with
     `ZE_ANDROID_AVD=<name>` if you have several.
   - iOS: picks the first iPhone from the newest installed iOS runtime.
     Override with `ZE_IOS_SIMULATOR=<name>`.
   - Press SPACE at the `▶ BOOT DEVICE` prompt to accept, or Ctrl+C to
     abort and boot manually.

> **Note:** The `zephyr:dependencies` block may need to be added after the
> *first* publish so the apps exist and you can see their exact names in the
> dashboard. If the e2e flow fails at the "Build host" step because the
> resolve returns nothing, this is almost certainly the cause.

### Automated mode (`ZE_E2E_AUTO=1`)

`CI=1 ZE_E2E_AUTO=1 pnpm e2e:zephyr <ios|android>` runs the whole flow without
a person at the keyboard:

- Each **Manual** step pins `DEMO` (or `ZE_E2E_ENV`) to the version the
  previous publish created, through the Zephyr API
  (`POST /v2/application/{org}/{project}/{app}/environment[/{env}]` with
  `applicationVersionId` and a `version` condition). It then waits until the
  environment hostname serves that version's `mf-manifest.json`, and another
  30 s so no edge server still holds the previous manifest.
- The "press SPACE" gates continue on their own; the update-toast gates run
  `ota-wait-update-toast.yaml` (waits up to 240 s).
- Needs `ZE_API` and `ZE_SECRET_TOKEN` (and `ZE_API_GATE` off production) in
  `.env.e2e`. Boot the device first; the boot prompt still waits for a key.
- For Android, set `ZEPHYR_TARGET=android` so the publishes and the host
  resolve the Android versions.

---

## Per-pause walkthrough

The orchestrator has **seven pauses** — four **Manual** (dashboard work
required, detailed below) and three automated "press SPACE to run" gates
(pre-publish-v2, pre-publish-v3, and the final Success hold). An
**eighth, conditional** pause appears during Preflight if no device is
booted and you want the orchestrator to boot one for you.

### Pause A — "Tag v1 as default for both remotes"

**Triggered after**: `Publish v1 (mini + nested-mini)` task.
**Dashboard goal**: both apps' chosen environment points at v1.

1. Navigate to **Applications**.
2. Find `mini` (auto-registered). Open it.
3. Go to the **Versions tab**. You should see one version (the v1 publish).
4. Go to **Tags & Environments** (or equivalent menu — docs mention this
   section exists but don't spell the exact nav).
5. Either:
   - **Tag model**: create/move a tag (e.g. `latest`) to point at v1, and
     ensure your demo env references that tag.
   - **Version-pin model**: set the demo env (`development`) to point at v1.
6. Repeat for `nested-mini`.
7. **Verify**: the `development` env for both apps says it's serving v1
   (status: **Live**).
8. Press SPACE in the orchestrator.

### Pause B — "Tag v2 as default for both remotes"

**Triggered after**: `Publish v2 (mini + nested-mini)` task.
**Dashboard goal**: `mini` default → v2, `nested-mini` default → v2.

1. For each app:
   - Go to Versions tab → find v2.
   - Via the tag or env pin, switch the default to v2.
2. Verify both `development` envs show v2 as **Live**.
3. Press SPACE.

### Pause C — "Rollback nested-mini to v1" (mini stays on v2)

**Triggered after**: `Phase 2 — update + crash` task.
**Dashboard goal**: mini stays on v2, nested-mini rolls back to v1.

Per the [Instant Rollbacks docs](https://docs.zephyr-cloud.io/features/instant-rollbacks),
there's an explicit **Rollback** button in the deployment view:

1. Navigate to `nested-mini` → deployment view.
2. Find the current deployment (v2).
3. Click the **Rollback** button next to it.
4. Confirm the popup (it'll show v1 as the target).
5. Verify `nested-mini`'s status shows v1 as **Live** and v2 as **Rolled back**.
6. **Don't touch `mini`** — it should stay on v2.
7. Press SPACE.

### Pause D — "Tag nested-mini v3 as default"

**Triggered after**: `Publish nested-mini v3` task.
**Dashboard goal**: nested-mini default → v3, mini still on v2.

1. Navigate to `nested-mini` → Versions. You should see v1, v2, v3.
2. Move the default (tag or env pin) to v3.
3. Verify v3 shows **Live**; v2 remains **Rolled back** (or **Available**);
   v1 remains **Available**.
4. Press SPACE.

---

## What the resolve pipeline actually looks at

After each dashboard change, the next step in the flow either:
- Runs a Maestro phase (polling picks up the new manifest URL content and
  downloads the new bundle), or
- Triggers another publish.

If Maestro fails immediately after a dashboard change, the most likely causes:

1. **Resolve not propagated yet** — give it ~2 seconds and retry.
2. **Wrong env name in `zephyr:dependencies`** — the `<env>` in
   `zephyr:<app>@<env>` must match the env you changed in the dashboard.
3. **App registered under unexpected UID** — check the app's full UID in the
   dashboard. If it's not bare `mini` / `nested-mini`, you may need to
   override via `ZEPHYR_MINI_UID` / `ZEPHYR_NESTED_MINI_UID` env vars (see
   `apps/host/metro.config.js`).

---

## Version statuses reference

Each version has one of these statuses, visible in the **Versions tab** status
column:

| Status | Meaning |
|---|---|
| **Live** | Currently serving traffic in one or more environments. |
| **Available** | Ready to deploy, not currently active. |
| **Rolled back** | Was live, manually or programmatically reverted. |
| **Failed** | Failed a testing stage. |
| **Deprecated** | Outdated but temporarily deployable (auto-transitions to Unavailable). |
| **Unavailable** | No longer deployable. |

For the demo, phases 1–4 should produce a clean sequence of Live transitions
plus one Rolled back for `nested-mini`.

---

## First-run corrections

If any of the labels / paths above are wrong, edit this file in place. The
orchestrator's pause messages intentionally stay one-liners — full instructions
live here so they can be corrected without code changes.
