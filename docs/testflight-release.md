# Zephyr Health TestFlight release

This runbook covers repository actions for the iOS host in `apps/host`. The
`mini` and `nested-mini` applications are Zephyr Cloud remotes, not TestFlight
applications.

## Release blockers

Do not publish or upload while any of these conditions is true:

- `IOS_BUNDLE_ID` has not been reserved in the correct Apple Developer team.
- The two Zephyr applications or their `testflight` environments are not confirmed.
- Either environment follows a branch, tag, workspace, or mutable development release.
- The baseline and previous known-good versions are not retained and rollback has not been rehearsed.
- `zephyr-native-cache` can execute an unverified fallback or displace known-good code before successful evaluation.
- A fresh offline launch, cached offline launch, integrity failure, or rollback has not passed on the release candidate.
- The archive privacy report and observed network traffic have not been reconciled with `docs/testflight-privacy.md`.

The installed `zephyr-native-cache@1.2.4` currently fails the integrity and
known-good requirements above. External TestFlight remains blocked until an
upstream version fixes those behaviors and this repository is updated and
retested.

## Prerequisites

- Xcode 26 or later selected by `xcode-select`.
- Node and pnpm versions accepted by `package.json`.
- Active Apple Developer membership, accepted agreements, reserved App ID, and an App Store Connect app record.
- Automatic signing access for the intended `APPLE_TEAM_ID`.
- Both Zephyr `testflight` environments pinned to retained immutable baseline versions.
- Public HTTPS support and privacy URLs.

Create the local release environment without printing its contents:

```bash
cp .env.testflight.example .env.testflight
chmod 600 .env.testflight
```

Set `ZE_SECRET_TOKEN`, the reserved `IOS_BUNDLE_ID`, and `APPLE_TEAM_ID` in
that ignored file. Never put the token in an Xcode scheme, plist, xcconfig,
release record, command argument, or committed file.

## Sequence

1. Confirm the worktree and intended commit are understood.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm test:release-config` and `pnpm testflight:preflight`.
4. Publish approved iOS remote candidates with `REMOTE_VERSION=v1 pnpm testflight:publish-remotes`, replacing `v1` with the explicitly approved source version.
5. In Zephyr Cloud, record the immutable version IDs and manifest URLs, then pin both `testflight` environments.
6. Fetch every public manifest and executable artifact without the build token; require HTTPS and verify every declared hash.
7. Copy `docs/releases/testflight/release-record.example.json` to a version/build-specific record and fill only non-secret evidence.
8. Run `pnpm --filter cache-test-host lint` and `pnpm --filter cache-test-host test -- --runInBand`.
9. Run applicable mocked OTA tests with `CI=1 pnpm e2e ios` and the installed-candidate smoke with `pnpm testflight:e2e`.
10. Run `pnpm testflight:settings`.
11. Increment `CURRENT_PROJECT_VERSION` and the matching `.env.testflight` `IOS_BUILD_NUMBER` before every upload, including rejected or replacement uploads.
12. Create the signed archive with `pnpm testflight:archive`.
13. Verify it with `pnpm testflight:verify-archive -- <archive-path>`.
14. Validate and upload through Xcode Organizer or the approved App Store Connect upload workflow.
15. Install the processed build from internal TestFlight on physical devices and complete the matrix below.
16. Add upload date, 90-day expiration date, test evidence, and approval to the release record.

`pnpm testflight:xcode` is a convenience launcher. The command-line archive is
authoritative because it passes the release environment and signing overrides
directly to `xcodebuild`.

## Device matrix

| Scenario | Required evidence |
| --- | --- |
| Small iPhone on iOS 15.x | Install, portrait layout, launch, cards, largest Dynamic Type |
| Current standard iPhone | Smoke, update, restart, cache, offline behavior |
| Pro Max-size iPhone | Safe areas, layout, toast, diagnostics |
| Fresh install offline | Local shell and bounded unavailable/retry state |
| Populated cache offline | Last known-good approved cards |
| Poor/high-latency network | Bounded actions, no duplicate operation or crash |
| VoiceOver and Reduce Motion | Ordered controls, meaningful labels, no essential animation |

`apps/host/e2e/flows/first-launch-offline.yaml` can exercise the local shell
after an operator has stopped the fixture servers and installed the Release
app. The flow does not establish that precondition and is not a substitute for
disabling all device networking; complete the fresh-install and cached-install
offline rows manually on the release candidate.

## Rollback

1. Stop all remote promotion and notify the release owner.
2. Move both `testflight` environments back to the previous known-good immutable IDs recorded for the host build.
3. Fetch both selector manifests from a clean network and verify they resolve to the rollback IDs and hashes.
4. Relaunch the internal TestFlight build, apply/restart as required, and run the smoke flow.
5. Record the operator, approval, timestamps, before/after IDs, and verification evidence.

Environment changes are not atomic across the two applications. If both cannot
be restored and verified as one rehearsed release operation, disable external
testing or use a new host build that bundles executable card implementations.

TestFlight builds expire 90 days after upload. The release owner must schedule
a replacement before the expiration recorded in the release record.
