#!/bin/sh
# Database + photograph backup.  Usage: DATABASE_URL=... UPLOAD_DIR=... BACKUP_DIR=./backups scripts/backup.sh
set -e
BACKUP_DIR="${BACKUP_DIR:-./backups}"; STAMP=$(date +%Y%m%d-%H%M%S); mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$BACKUP_DIR/fives-db-$STAMP.dump"
[ -d "${UPLOAD_DIR:-./uploads}" ] && tar -czf "$BACKUP_DIR/fives-files-$STAMP.tar.gz" -C "${UPLOAD_DIR:-./uploads}" .
find "$BACKUP_DIR" -name 'fives-*' -mtime +"${KEEP_DAYS:-30}" -delete
echo "Backup written to $BACKUP_DIR ($STAMP)"
