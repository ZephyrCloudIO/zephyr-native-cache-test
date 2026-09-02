# TestFlight remote release policy

The `testflight` environments serve only the predefined Zephyr Health sample
cards reviewed with the host. Every move requires artifact-hash verification,
approval, and a known-good rollback target in Zephyr deployment history.

| Allowed after approval without a host build | Requires a new host build and Beta App Review |
| --- | --- |
| Bug fix inside an existing card | New card, module, screen, or route |
| Copy or non-material visual correction | New native permission or capability |
| Performance fix preserving behavior | Authentication, account, payment, or data collection |
| Existing module-contract compatibility fix | Material purpose or health-functionality change |
| Rollback to an approved retained version | New third-party executable integration |

Remotes must not add medical claims, real monitoring, HealthKit access, native
capabilities, payments, authentication, tracking, or undisclosed data
collection. Release owners must not move either environment during Apple review.

Required approval evidence:

- Application UID and immutable version ID.
- Selector and immutable manifest URLs.
- HTTPS and public reviewer reachability.
- Declared hashes and independently calculated artifact hashes.
- Change summary and test evidence.
- Approver and UTC timestamp.
- Previous known-good rollback ID.

This policy reduces operational risk but does not remove Apple App Review
Guideline 2.5.2 risk for downloaded executable JavaScript.
