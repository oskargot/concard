#!/usr/bin/env bash
# Applies the migrations to a scratch Postgres database and runs the schema
# tests. Needs a reachable Postgres; set PGHOST/PGPORT/PGUSER as usual.
# Not for use against a real Supabase project: it installs a fake auth schema.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${CONCARD_TEST_DB:-concard_test}"
dropdb --if-exists "$DB"
createdb "$DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/dev/auth_shim.sql
for f in supabase/migrations/*.sql; do
	case "$f" in *_storage.sql) continue ;; esac
	psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/dev/test_schema.sql
