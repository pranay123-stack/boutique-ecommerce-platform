#!/usr/bin/env bash
# Restore a compressed dump. DESTRUCTIVE — requires explicit confirmation.
#   ./restore.sh backups/boutique-20260816T040000Z.sql.gz
set -euo pipefail

FILE="${1:?Usage: restore.sh <backup.sql.gz>}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "This will OVERWRITE the database at:"
echo "  ${DATABASE_URL%%\?*}"
read -r -p "Type 'restore' to continue: " CONFIRM
[ "$CONFIRM" = "restore" ] || { echo "Aborted."; exit 1; }

gunzip -c "$FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
echo "Restore complete. Run 'npx prisma migrate deploy' to apply any newer migrations."
