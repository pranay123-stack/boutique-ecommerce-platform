#!/usr/bin/env bash
# Timestamped, compressed logical backup.
#   ./backup.sh [output-directory]
set -euo pipefail

OUT_DIR="${1:-$(dirname "$0")/../backups}"
mkdir -p "$OUT_DIR"

: "${DATABASE_URL:?DATABASE_URL must be set}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$OUT_DIR/boutique-$STAMP.sql.gz"

echo "Backing up to $FILE ..."
# --no-owner keeps the dump restorable into a differently-owned database.
pg_dump "$DATABASE_URL" --no-owner --clean --if-exists | gzip -9 > "$FILE"

echo "Done: $(du -h "$FILE" | cut -f1)"

# Keep the 14 most recent backups.
ls -1t "$OUT_DIR"/boutique-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "Retained $(ls -1 "$OUT_DIR"/boutique-*.sql.gz 2>/dev/null | wc -l) backups."
