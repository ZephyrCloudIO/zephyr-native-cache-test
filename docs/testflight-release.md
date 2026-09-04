# Zephyr Health TestFlight release

This runbook covers repository actions for the iOS host in `apps/host`. The
`mini` and `nested-mini` applications are Zephyr Cloud remotes, not TestFlight
applications.

## External release blockers

Do not publish or upload while any of these conditions is true:

- Either `testflight` environment is not serving the intended reviewed version.
- Either environment changes during archive creation or Apple review.
- No previous known-good version is available in Zephyr deployment history.
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
- A valid local Apple Distribution identity and the `Zephyr Health App` App
  Store profile selected for the Release configuration.
- Both Zephyr `testflight` environments configured to the intended baseline versions.
- Public HTTPS support and privacy URLs.

Create the local release environment without printing its contents:

```bash
cp .env.testflight.example .env.testflight
chmod 600 .env.testflight
```

Set `ZE_SECRET_TOKEN`, the reserved `IOS_BUNDLE_ID`, `APPLE_TEAM_ID`, and
`IOS_BUILD_NUMBER` in that ignored file. Never put the token in an Xcode
scheme, plist, xcconfig, command argument, or committed file. The public
manifest URLs are optional and are needed only by the strict external-release
verification commands.

## Internal TestFlight sequence

Use this path to upload a build for the App Store Connect team's internal
TestFlight testers. It relies on the Zephyr plugin/runtime and intentionally
skips independent manifest fetching, artifact hashing, environment-drift
checks, and the external native-cache approval gate.

1. Confirm the worktree and intended source commit are understood.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm test:release-config`, `pnpm testflight:verify-assets`, and `pnpm testflight:internal:preflight`.
4. If new remote fixtures are needed, publish them with `REMOTE_VERSION=v1 pnpm testflight:internal:publish-remotes`, replacing `v1` with the intended source version. Otherwise, leave the existing `testflight` selectors in place.
5. Run `pnpm --filter cache-test-host lint`, `pnpm --filter cache-test-host test -- --runInBand`, and the applicable mocked OTA tests with `CI=1 pnpm e2e ios`.
6. Set the next unused App Store Connect build number in `.env.testflight` as `IOS_BUILD_NUMBER`, then run `pnpm testflight:internal:settings`.
7. Create the signed archive with `pnpm testflight:internal:archive`. The archive evidence is explicitly marked `releaseTrack: "internal"` and contains no remote snapshot approval.
8. Run `pnpm testflight:archive-evidence -- <archive-path>` and `pnpm testflight:internal:verify-archive -- <archive-path>` to retain local source, signing, privacy, architecture, and resource checks without remote verification.
9. Run `pnpm testflight:internal:export -- <archive-path>` and `pnpm testflight:internal:verify-ipa -- <ipa-path>`. These commands still require Apple Distribution signing, TestFlight entitlements, an App Store profile, exact identity, and no embedded secrets.
10. Open the archive in Xcode Organizer, select **Validate App**, and resolve every icon, privacy, signing, SDK, or entitlement warning.
11. Select **Distribute App**, **App Store Connect**, and **Upload**. Keep symbol upload enabled.
12. In App Store Connect, add the processed build only to an internal testing group and record its build number and 90-day expiration date.
13. Install the processed build from internal TestFlight and complete the applicable device checks below.

Internal commands still require `ZE_SECRET_TOKEN` and network access because
the Zephyr plugin resolves the two `@testflight` dependencies during the
build. They do not require `ZEPHYR_MINI_MANIFEST_URL` or
`ZEPHYR_NESTED_MINI_MANIFEST_URL`.

Do not promote an internal-track archive to external tester groups. Create a
new strict external-track archive after the external blockers are resolved.

## External TestFlight sequence

1. Confirm the worktree and intended source commit are understood.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm test:release-config`, `pnpm testflight:verify-assets`, and `pnpm testflight:preflight`.
4. Publish approved iOS remote candidates with `REMOTE_VERSION=v1 pnpm testflight:publish-remotes`, replacing `v1` with the explicitly approved source version.
5. In Zephyr Cloud, confirm both `testflight` environments serve the intended versions and do not move them during archive creation or Apple review.
6. Set `ZEPHYR_MINI_MANIFEST_URL` and `ZEPHYR_NESTED_MINI_MANIFEST_URL`, then run `pnpm testflight:verify-remotes`. This creates a private local snapshot under `build/testflight/`, validates the expose sets, and independently hashes every container/exposed/shared executable artifact.
7. Run `pnpm --filter cache-test-host lint` and `pnpm --filter cache-test-host test -- --runInBand`.
8. Run applicable mocked OTA tests with `CI=1 pnpm e2e ios`. Install the exact simulator candidate before running `pnpm testflight:e2e`; the command verifies its bundle ID and version/build before Maestro starts.
9. Set the next unused App Store Connect build number in `.env.testflight` `IOS_BUILD_NUMBER`, then run `pnpm testflight:settings`. The release script passes that value as `CURRENT_PROJECT_VERSION`; it is the archive build-number authority.
10. Create the signed archive with `pnpm testflight:archive`. The command refuses existing output, fails if either environment changes while archiving, and atomically writes per-archive source/remote/archive evidence under ignored `build/testflight/`.
11. Run `pnpm testflight:archive-evidence -- <archive-path>` to inspect that non-secret evidence, then run `pnpm testflight:verify-archive -- <archive-path>`.
12. Run `pnpm testflight:export -- <archive-path>` and then `pnpm testflight:verify-ipa -- <ipa-path>`. The IPA gate requires Apple Distribution signing, TestFlight entitlements, an App Store profile, exact privacy/ATS declarations, and the same local remote/archive snapshots.
13. Open the archive in Xcode Organizer, select **Validate App**, use the intended App Store Connect distribution options, and resolve every icon, privacy, signing, SDK, or entitlement warning before upload.
14. In Organizer select **Distribute App**, **App Store Connect**, and **Upload**. Keep symbol upload enabled and note the processed build number and 90-day expiration date in the release calendar or team release notes.
15. Install the processed build from internal TestFlight on physical devices and complete the matrix below.

`pnpm testflight:internal:xcode` and `pnpm testflight:xcode` are inspection-only
convenience launchers for their respective tracks. The command-line archive is
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
2. Use Zephyr deployment history to move both `testflight` environments back to the previous known-good versions.
3. For an internal build, relaunch the app and verify both card sets after restart. For a strict external candidate, run `pnpm testflight:verify-remotes` first.
4. Relaunch the internal TestFlight build, apply/restart as required, and run the smoke flow.
5. If only one environment moves successfully, stop promotion, restore it, and disable external testing if the pair cannot be restored immediately.

Environment changes are not atomic across the two applications. If both cannot
be restored and verified as one rehearsed release operation, disable external
testing or use a new host build that bundles executable card implementations.

TestFlight builds expire 90 days after upload. The release owner must schedule
a replacement before the expiration tracked in the release calendar or team notes.
