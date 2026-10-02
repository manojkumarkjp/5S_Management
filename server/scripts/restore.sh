#!/bin/sh
# Usage: DATABASE_URL=... scripts/restore.sh backups/fives-db-YYYYMMDD-HHMMSS.dump [backups/fives-files-....tar.gz]
set -e
[ -z "$1" ] && echo "usage: restore.sh <db.dump> [files.tar.gz]" && exit 1
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" "$1"
[ -n "$2" ] && mkdir -p "${UPLOAD_DIR:-./uploads}" && tar -xzf "$2" -C "${UPLOAD_DIR:-./uploads}"
echo "Restore complete"
