#!/usr/bin/env bash
#
# EXPLAIN ANALYZE, before and after the RLS InitPlan rewrite, on the same rows.
#
#   DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
#     ./scripts/perf/rls-explain.sh [rows]
#
# WHY THIS EXISTS. "Wrapping auth.uid() in a sub-select makes RLS faster" is a
# claim, and a migration that ships on a claim is a migration nobody can check.
# This runs the same query, against the same rows, on the same server, with the
# policies rewritten and not rewritten, and prints both plans.
#
# It builds TWO throwaway databases from the real migration set — one WITHOUT the
# initplan migration, one with — rather than rewriting and reverting in place.
# Reverting would leave the planner's statistics and the shared buffers warmed by
# the first run, and the second number would flatter itself.
#
# It deliberately does NOT boot a server: `scripts/rls/run.sh` already owns that
# and a second copy would be a second thing to keep working. Point DATABASE_URL at
# any PostgreSQL 16 — a `postgres:16` service, or a cluster from initdb.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
BOOTSTRAP="$REPO_ROOT/scripts/rls/bootstrap.sql"
SEEDER="$REPO_ROOT/scripts/perf/rls-explain.sql"
ROWS="${1:-20000}"
INITPLAN_MIGRATION="20260911180000_rls_initplan.sql"

# The same four pg_cron files scripts/rls/run.sh skips, for the same reason: the
# extension cannot be installed on a stock PostgreSQL and they define no policy.
SKIP=(
  "20260122103824_ff8a9c0f-3584-4c0d-9cf4-24b56beedff3.sql"
  "20260301100000_ev07b_offline_cron.sql"
  "20260716120000_sos_escalation_cron.sql"
  "20260723120000_fix_cron_url_and_auth.sql"
  "20260911150100_billing_migration_cron.sql"
)
NEUTRALISE_PG_NET='s/^[[:space:]]*CREATE[[:space:]]+EXTENSION[^;]*pg_net[^;]*;/-- neutralised/I'

[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL is required." >&2; exit 2; }
[[ -f "$MIGRATIONS/$INITPLAN_MIGRATION" ]] || {
  echo "$INITPLAN_MIGRATION is not in $MIGRATIONS — nothing to compare." >&2; exit 2; }

PREP="$(mktemp -d)"
trap 'rm -rf "$PREP"' EXIT

db_url() { python3 -c "
import sys
from urllib.parse import urlsplit, urlunsplit
u = urlsplit('$DATABASE_URL')
print(urlunsplit((u.scheme, u.netloc, '/' + sys.argv[1], u.query, u.fragment)))
" "$1"; }

# The identity every EXPLAIN below runs as: a real staff row, reached exactly as
# production reaches it — `SET LOCAL ROLE authenticated` plus the JWT claims GUC
# that scripts/rls/bootstrap.sql's auth.uid() reads. Running these as the table
# owner would bypass RLS entirely and measure nothing.
STAFF_UID="dddddddd-dddd-4ddd-8ddd-dddddddddddd"

build() {
  local dbname="$1" with_initplan="$2" url
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$dbname\";" >/dev/null
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$dbname\";" >/dev/null
  url="$(db_url "$dbname")"

  psql "$url" -v ON_ERROR_STOP=1 -q -v "DBNAME=$dbname" -f "$BOOTSTRAP" >/dev/null

  local base f src
  for f in $(ls "$MIGRATIONS"/*.sql | sort); do
    base="$(basename "$f")"
    [[ " ${SKIP[*]} " == *" $base "* ]] && continue
    if [[ "$base" == "$INITPLAN_MIGRATION" && "$with_initplan" != "yes" ]]; then continue; fi
    src="$f"
    if grep -qiE '^[[:space:]]*CREATE[[:space:]]+EXTENSION[^;]*pg_net' "$f"; then
      sed -E "$NEUTRALISE_PG_NET" "$f" > "$PREP/$base"; src="$PREP/$base"
    fi
    psql "$url" -v ON_ERROR_STOP=1 -q -f "$src" >/dev/null 2>&1 || {
      echo "  ! $base would not apply into $dbname" >&2; }
  done
  echo "$url"
}

seed_and_explain() {
  local url="$1" label="$2"
  psql "$url" -v ON_ERROR_STOP=1 -q -f "$SEEDER" -c "
    SET session_replication_role = replica;
    SELECT pg_temp.seed('public.members',          $ROWS);
    SELECT pg_temp.seed('public.alerts',           $ROWS);
    SELECT pg_temp.seed('public.staff_shifts',     $ROWS);
    SELECT pg_temp.seed('public.notification_log', $ROWS);
    -- is_active is a GENERATED column on this schema, so it is not listed:
    -- naming it is an error, not a no-op.
    INSERT INTO public.staff (id, user_id, first_name, last_name, email, role)
    VALUES (gen_random_uuid(), '$STAFF_UID', 'Perf', 'Operator', 'perf\@example.com', 'admin');
    ANALYZE public.members; ANALYZE public.alerts;
    ANALYZE public.staff_shifts; ANALYZE public.notification_log; ANALYZE public.staff;
  " >/dev/null

  echo ""
  echo "═══ $label ═══"
  for tbl in members alerts staff_shifts notification_log; do
    # Two runs: the first warms the cache, the second is reported. Comparing a
    # cold plan against a warm one would measure the disk, not the policy.
    for run in 1 2; do
      out=$(psql "$url" -v ON_ERROR_STOP=1 -t -A -c "
        BEGIN;
        SELECT set_config('request.jwt.claims',
          '{\"sub\":\"$STAFF_UID\",\"role\":\"authenticated\"}', true);
        SET LOCAL ROLE authenticated;
        EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON, COSTS OFF)
          SELECT count(*) FROM public.$tbl;
        ROLLBACK;
      " 2>&1)
    done
    printf '%-18s %s\n' "$tbl" "$(echo "$out" | grep -iE 'Execution Time' | head -1)"
    echo "$out" | grep -iE 'Filter|Rows Removed|Seq Scan|InitPlan|SubPlan' | sed 's/^/                   /' | head -6
  done
}

echo "Building WITHOUT the initplan migration…"
BEFORE_URL="$(build perf_rls_before no)"
echo "Building WITH the initplan migration…"
AFTER_URL="$(build perf_rls_after yes)"

seed_and_explain "$BEFORE_URL" "BEFORE — auth.uid() evaluated per row ($ROWS rows)"
seed_and_explain "$AFTER_URL"  "AFTER  — auth.uid() hoisted to an InitPlan ($ROWS rows)"
echo ""
