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

Set `ZE_SECRET_TOKEN`, the reserved `IOS_BUNDLE_ID`, `APPLE_TEAM_ID`,
`IOS_BUILD_NUMBER`, and `TESTFLIGHT_RELEASE_RECORD` in
that ignored file. Never put the token in an Xcode scheme, plist, xcconfig,
release record, command argument, or committed file.

## Sequence

1. Confirm the worktree is clean and record the intended source commit SHA.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm test:release-config`, `pnpm testflight:verify-assets`, and `pnpm testflight:preflight`.
4. Publish approved iOS remote candidates with `REMOTE_VERSION=v1 pnpm testflight:publish-remotes`, replacing `v1` with the explicitly approved source version.
5. In Zephyr Cloud, record the immutable version IDs and manifest URLs, then pin both `testflight` environments.
6. Copy `docs/releases/testflight/release-record.example.json` to a version/build-specific record, fill the immutable IDs, allowed exposes, public manifest hashes, and every container/exposed/shared artifact URL and hash, then commit only that record. Its `host.gitSha` is the source commit from step 1.
7. Set `TESTFLIGHT_RELEASE_RECORD` to that committed record and run `pnpm testflight:verify-remotes`. This fetches without authentication, follows HTTPS-only redirects, verifies both manifest hashes, validates the expose sets, and hashes every recorded executable artifact.
8. Run `pnpm --filter cache-test-host lint` and `pnpm --filter cache-test-host test -- --runInBand`.
9. Run applicable mocked OTA tests with `CI=1 pnpm e2e ios`. Install the exact simulator candidate before running `pnpm testflight:e2e`; the command verifies its bundle ID and version/build before Maestro starts.
10. Set the next unused App Store Connect build number in `.env.testflight` `IOS_BUILD_NUMBER`, then run `pnpm testflight:settings`. The release script passes that value as `CURRENT_PROJECT_VERSION`; it is the archive build-number authority.
11. Create the signed archive with `pnpm testflight:archive`. The command refuses an existing archive path and re-verifies the remote pair before and after archiving.
12. Run `pnpm testflight:archive-evidence -- <archive-path>`, copy its non-secret archive/app plist digests, executable/resource hashes, UUIDs, signing identity, team, and timestamp into the release record, and commit that record. Then verify with `pnpm testflight:verify-archive -- <archive-path>`. Archive inspection does not pass the publishing token to child tools.
13. Run `pnpm testflight:export -- <archive-path>` and then `pnpm testflight:verify-ipa -- <ipa-path>`. The IPA gate requires Apple Distribution signing, TestFlight entitlements, an App Store profile, exact privacy/ATS declarations, and the approved remote pair.
14. Open the archive in Xcode Organizer, select **Validate App**, use the intended App Store Connect distribution options, and record the successful validation timestamp and any warnings in the release record. Resolve every icon, privacy, signing, SDK, or entitlement warning before upload.
15. In Organizer select **Distribute App**, **App Store Connect**, and **Upload**. Keep symbol upload enabled and record the processed App Store Connect build ID.
16. Install the processed build from internal TestFlight on physical devices and complete the matrix below, then add upload date, 90-day expiration date, device evidence, and final approval to the release record.

`pnpm testflight:xcode` is an inspection-only convenience launcher. The command-line archive is
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

After installing the local Release app, run
`pnpm e2e:release-failures:ios`. The command refuses to start while either
remote fixture port is listening, then verifies the unavailable-remote shell,
an isolated card fallback, local content, and confirmed cache clearing. It is
not a substitute for disabling all device networking; complete the
fresh-install and cached-install offline rows manually on the release
candidate.

## Rollback

1. Stop all remote promotion and notify the release owner.
2. Move both `testflight` environments back to the previous known-good immutable IDs recorded for the host build.
3. Fetch both selector manifests from a clean network and verify they resolve to the rollback IDs and hashes.
4. Relaunch the internal TestFlight build, apply/restart as required, and run the smoke flow.
5. Record the operator, approval, timestamps, before/after IDs, and verification evidence.

Create an append-only promotion or rollback event from
`docs/releases/testflight/promotion-record.example.json` for every environment
move. A partial move is an incident: stop promotion, restore the application
that moved, verify both selectors against the previous pair record, and disable
external testing if the pair cannot be restored immediately.

Environment changes are not atomic across the two applications. If both cannot
be restored and verified as one rehearsed release operation, disable external
testing or use a new host build that bundles executable card implementations.

TestFlight builds expire 90 days after upload. The release owner must schedule
a replacement before the expiration recorded in the release record.
