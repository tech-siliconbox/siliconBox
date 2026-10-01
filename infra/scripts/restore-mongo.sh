#!/usr/bin/env bash
# Restore an encrypted backup into an EMPTY database, for the quarterly restore drill.
# Usage: restore-mongo.sh <backup.archive.gz.age> <age-identity-file>
# Never point RESTORE_URI at production.
set -euo pipefail

backup="${1:?encrypted backup file}"
identity="${2:?age identity (private key) file}"
: "${RESTORE_URI:?connection string of the empty target database}"
: "${RESTORE_NS_FROM:?source namespace pattern, for example siliconbox.*}"
: "${RESTORE_NS_TO:?target namespace pattern, for example siliconbox_restore.*}"

age --decrypt --identity "$identity" "$backup" |
  mongorestore --uri="$RESTORE_URI" --archive --gzip \
    --nsFrom="$RESTORE_NS_FROM" --nsTo="$RESTORE_NS_TO"
echo "Restored. Now run the checks in docs/runbooks/backup-and-restore.md."
