#!/usr/bin/env bash
# Nightly backup: dump, check the size, encrypt to the backup public key, upload.
# The job holds only the public key, so it can write backups but never read them.
# Runbook: docs/runbooks/backup-and-restore.md
set -euo pipefail

: "${MONGODB_URI_BACKUP:?read-only user on the production database}"
: "${BACKUP_AGE_RECIPIENT:?age public key of the backup key pair}"
: "${BACKUP_BUCKET_URL:?for example s3://siliconbox-backups/mongo}"
min_bytes="${BACKUP_MIN_BYTES:-10240}"
# Override to run mongodump from a container; left unquoted on purpose so it can hold arguments.
mongodump_cmd="${MONGODUMP:-mongodump}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
archive="$work/siliconbox-$stamp.archive.gz"

$mongodump_cmd --uri="$MONGODB_URI_BACKUP" --archive="$archive" --gzip --quiet

size="$(wc -c <"$archive" | tr -d ' ')"
if ((size < min_bytes)); then
  echo "Backup is only $size bytes; expected at least $min_bytes. Not uploading." >&2
  exit 1
fi

age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$archive.age" "$archive"
aws s3 cp "$archive.age" "$BACKUP_BUCKET_URL/$(basename "$archive").age" --only-show-errors \
  ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"}
echo "Uploaded siliconbox-$stamp ($size bytes before encryption)."
