# Backup and restore

## Nightly (Atlas free has no backups)

1. Scheduled job (`.github/workflows/nightly-backup.yml`, script `infra/scripts/backup-mongo.sh`) runs `mongodump` against the production database with a read-only user.
2. Archive is encrypted with `age` to a public key (the job cannot decrypt) and goes to private S3-compatible storage. Set a 30-day lifecycle rule on the bucket.
3. Alert if the job fails or the archive is smaller than expected.

## Quarterly restore drill

1. Create an empty staging database.
2. Restore the latest archive with `infra/scripts/restore-mongo.sh` (decrypts, then `mongorestore` with a namespace rename).
3. Check: entitlements count, latest orders, a sample lesson, unique indexes present.
4. Record date, duration and result here or in `docs/roadmap/`.

A backup never restored is a hope, not a backup. On a paid Atlas tier, also use point-in-time backups.

## Drill log

| Date | Where | Duration | Result |
| --- | --- | --- | --- |
| 2026-10-01 | Local replica set, unencrypted dump of the dev database | 2 s | Pass: 17 collections, all counts and indexes match, unique entitlement index present. Encryption and upload not yet exercised (storage not chosen). |
