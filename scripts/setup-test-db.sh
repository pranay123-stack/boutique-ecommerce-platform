#!/usr/bin/env bash
# Create and migrate the isolated test database.
#
# `npm run db:migrate` only touches the development database, so a fresh
# checkout (or a fresh Postgres volume) has no boutique_test and the whole
# integration suite fails to connect. This script is idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."

TEST_DB="${TEST_DB:-boutique_test}"
SOURCE_URL="${DATABASE_URL:-postgresql://boutique:boutique_dev_pw@localhost:5470/boutique_dev?schema=public}"

# `?schema=public` is a Prisma-only parameter; psql rejects it as an invalid
# URI query parameter, so strip the query string for the psql connections.
BASE_URL="${SOURCE_URL%%\?*}"
ADMIN_URL="$BASE_URL"
TEST_URL="${BASE_URL%/*}/$TEST_DB"

echo "Ensuring database '$TEST_DB' exists..."
if psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname='$TEST_DB'" | grep -q 1; then
  echo "  already present"
else
  psql "$ADMIN_URL" -c "CREATE DATABASE $TEST_DB" > /dev/null
  echo "  created"
fi

echo "Applying migrations to '$TEST_DB'..."
# Prisma does want the schema parameter.
DATABASE_URL="$TEST_URL?schema=public" npm --prefix backend run prisma:deploy 2>&1 | tail -2

echo "Test database ready: $TEST_DB"
