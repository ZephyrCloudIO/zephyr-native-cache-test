# TestFlight release records

Create one committed JSON record for every uploaded host version/build by
copying `release-record.example.json`. Never overwrite or reuse a build number.

Records contain immutable remote IDs, public URLs, hashes, approval, rollback,
test, upload, and expiration evidence. They must not contain tokens,
authenticated URLs, signing credentials, provisioning profiles, or personal
secrets.

Create an append-only event from `promotion-record.example.json` for every
post-upload promotion or rollback. Never rewrite prior events. Pair each event
with the host build, before/after immutable IDs, manifest hashes, approval,
timestamps, and verification evidence.
