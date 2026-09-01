# Zephyr Health beta privacy behavior

Zephyr Health is a demonstration dashboard. Displayed health-themed values are
fictional sample data. The app does not provide medical advice, diagnosis,
treatment, or real health monitoring.

## App behavior

- No login or user account is required.
- The app does not request HealthKit, location, camera, microphone, contacts, photos, advertising, or tracking access.
- The host requests Zephyr Cloud manifests and JavaScript bundles over HTTPS.
- Downloaded modules and cache metadata are stored in the app container.
- The diagnostics panel displays module cache and update state to the tester.
- The app does not make a third-party connectivity probe. In particular, it does not poll Google.

Standard HTTPS delivery can expose IP address, request path, user-agent/network
metadata, timestamps, and delivery diagnostics to Zephyr Cloud and its CDN.
Server-side fields and retention must be confirmed by the service owner before
App Store Connect privacy answers are finalized. Do not claim `Data Not
Collected` solely because the app privacy manifest declares no client-side
collected-data types.

Remote updates are governed by `docs/remote-release-policy.md` and may not add
permissions, identifiers, analytics, tracking, or data collection. The final
public privacy-policy URL must be recorded in each release record.

Before upload, capture traffic for clean launch, cached launch, manual update,
restart, offline launch, and rollback. Compare observed hosts and request data
with this document, the aggregate Xcode archive privacy report, CocoaPod privacy
manifests, and App Store Connect answers.
