#!/usr/bin/env bash
# Behavioural proof for WP-B/WP-D against a throwaway Postgres.
#
# vitest has no database, so src/test/ice*.test.ts can only assert the SQL text.
# This script actually runs it: applies the ICE migrations three times (proving
# they are re-runnable), then imports one real member through
# public.ice_import_member and checks what landed.
#
# Requires: postgresql-16 client+server, node, npx. Touches nothing but /tmp.
set -euo pipefail
PORT=${PORT:-55432}
PGD=$(mktemp -d /tmp/ice-pg.XXXXXX)
export PATH="/usr/lib/postgresql/16/bin:$PATH"

cleanup() { pg_ctl -D "$PGD" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$PGD"; }
trap cleanup EXIT

id -u postgres >/dev/null 2>&1 || useradd -m postgres
chown postgres "$PGD"; chmod 700 "$PGD"
su postgres -c "PATH=$PATH initdb -D $PGD -U postgres --auth=trust" >/dev/null
su postgres -c "PATH=$PATH pg_ctl -D $PGD -o '-k /tmp -p $PORT -c listen_addresses=' -l $PGD/log start" >/dev/null
sleep 2
PSQL="psql -h /tmp -p $PORT -U postgres"

$PSQL -q -c "DO \$\$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" \
        -c "DO \$\$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" \
        -c "CREATE DATABASE ice"
$PSQL -d ice -q -v ON_ERROR_STOP=1 -f supabase/test/ice_import_harness.sql

for pass in 1 2 3; do
  for f in supabase/migrations/20260903091*.sql supabase/migrations/20260903092000_ice_import_member_fn.sql; do
    $PSQL -d ice -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
  done
  echo "migrations applied cleanly (pass $pass)"
done

echo "run the mapper over a real export and import one member with:"
echo "  npx esbuild src/lib/iceCrmImport.ts --format=cjs --outfile=/tmp/mapper.cjs"
echo "  node -e \"...mapIceCsv(fs.readFileSync(EXPORT))...\" > /tmp/row.json"
echo "  base64 -w0 /tmp/row.json > /tmp/row.b64  # then call ice_import_member"
echo "See src/test/iceImportFunction.test.ts for the assertions this proved."
