#!/usr/bin/env bash
#
# Cross-tenant RLS isolation harness (golden rule 2).
#
#   ./scripts/rls/run.sh
#
# Builds a throwaway PostgreSQL database, applies the Supabase-compatible
# scaffolding and then the REAL migration set, and runs the isolation suite
# against it. Exits non-zero if any check fails.
#
# WHY NOT AN EPHEMERAL SUPABASE CLUSTER: RLS is a pure PostgreSQL feature. A
# policy calls auth.uid(), auth.uid() reads the JWT claims the connection set,
# and Postgres decides. None of GoTrue, PostgREST, Realtime or Storage
# participates in that decision, so none of them is needed to prove isolation —
# which is what lets this run on any CI runner with a Postgres binary, on every
# PR, instead of somewhere that has to be stood up by hand and then never runs.
#
# Two ways to get a server, in this order:
#   1. $DATABASE_URL is set (e.g. a GitHub Actions `postgres:16` service) — used
#      as-is, and a fresh database is created inside it.
#   2. Otherwise a local cluster is booted with initdb into a temp directory and
#      torn down on exit.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
BOOTSTRAP="$REPO_ROOT/scripts/rls/bootstrap.sql"
ISOLATION="$REPO_ROOT/scripts/rls/isolation.sql"
DB_NAME="rls_isolation_$$"

# pg_cron and pg_net cannot be installed on a stock PostgreSQL. The migrations
# that need them are scheduling only — verified to contain zero CREATE POLICY,
# zero ENABLE ROW LEVEL SECURITY and zero CREATE TABLE — so skipping them costs
# this suite nothing. Listed explicitly so the skip is a decision, not a silent
# swallow, and so a future migration cannot join the list unnoticed.
SKIP_MIGRATIONS=(
  "20260122103806_9e986543-163a-4df4-81ce-4c436a58ee48.sql"  # pg_net
  "20260122103824_ff8a9c0f-3584-4c0d-9cf4-24b56beedff3.sql"  # pg_cron
  "20260301100000_ev07b_offline_cron.sql"                    # pg_cron
  "20260716120000_sos_escalation_cron.sql"                   # pg_cron
  "20260723120000_fix_cron_url_and_auth.sql"                 # pg_cron
)

log() { printf '\033[1m→ %s\033[0m\n' "$*"; }

# ── two failures that must never look alike ────────────────────────────────
#
# PR #136 merged with this job red. The red meant "the migrations would not
# apply, so no isolation check ran" — a fail-safe refusing to certify. In the
# PR UI that is a red X on "Cross-tenant isolation", pixel-identical to the red
# X you would get if a tenant could read another tenant's rows. It was read as
# noise and waved through, and settling which of the two it had actually been
# took a repro on a throwaway Postgres the next day.
#
# So the two exits are now labelled, loudly, and they carry different codes:
#
#   exit 3  NO VERDICT       — the detector could not run. Says nothing about
#                             isolation, in either direction.
#   exit 1  BREACH SUSPECTED — the detector ran and something failed.
#
# Both write a banner to $GITHUB_STEP_SUMMARY when it exists, so the verdict is
# the first thing on the job summary rather than something you find by reading
# 600 lines of psql output, and both emit a ::error:: annotation so the title
# shows on the PR's Checks tab without opening the log.
emit_summary() {
  [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] || return 0
  printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
}

no_verdict() {
  local list="$1"
  {
    echo ''
    echo '################################################################'
    echo '#                                                              #'
    echo '#   NO VERDICT — schema incomplete, isolation NOT evaluated    #'
    echo '#                                                              #'
    echo '#   This is NOT an isolation failure. Not one cross-tenant     #'
    echo '#   check ran. This job is refusing to certify, because the    #'
    echo '#   schema it would have tested never finished building.       #'
    echo '#                                                              #'
    echo '################################################################'
    echo ''
    echo 'Migrations that would not apply:'
    echo "$list"
    echo ''
    echo 'Fix those, then this job can say something about isolation.'
    echo 'Until it does, treat isolation as UNKNOWN — not as passing, and'
    echo 'not as broken.'
    echo ''
  } >&2
  echo "::error title=NO VERDICT — isolation not evaluated::${failed} migration(s) would not apply, so no cross-tenant check ran. This is not an isolation failure; it is the absence of a result."
  emit_summary "## 🟠 NO VERDICT — isolation not evaluated

**Not an isolation failure.** No cross-tenant check ran at all.

\`${failed}\` migration(s) would not apply, so the schema under test was
incomplete and this job refused to certify:

\`\`\`
${list}
\`\`\`

Isolation is **UNKNOWN** for this commit — neither proven nor disproven.
Fix the migrations to get a verdict."
  exit 3
}

breach_suspected() {
  {
    echo ''
    echo '################################################################'
    echo '#                                                              #'
    echo '#   ISOLATION CHECK FAILED — a cross-tenant assertion is red   #'
    echo '#                                                              #'
    echo '#   The detector RAN and something did not hold. Read the      #'
    echo '#   FAIL rows above. Do not merge.                             #'
    echo '#                                                              #'
    echo '################################################################'
    echo ''
  } >&2
  echo '::error title=ISOLATION CHECK FAILED::A cross-tenant assertion is red. The suite ran and something did not hold — read the FAIL rows in the log.'
  emit_summary '## 🔴 ISOLATION CHECK FAILED

A cross-tenant assertion is red. The suite **ran**, so this is a result, not
an absence of one. Read the `FAIL` rows in the job log. Do not merge.'
  exit 1
}

# ── get a server ───────────────────────────────────────────────────────────
if [[ -n "${DATABASE_URL:-}" ]]; then
  log "Using DATABASE_URL"
  # Swap only the path component, so query parameters (sslmode, etc.) survive.
  target_url() {
    python3 - "$DATABASE_URL" "$DB_NAME" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit
u = urlsplit(sys.argv[1])
print(urlunsplit((u.scheme, u.netloc, "/" + sys.argv[2], u.query, u.fragment)))
PY
  }
  DB_URL="$(target_url)"
  psql_db() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q "$@"; }
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null
  cleanup() { psql "$DATABASE_URL" -q -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" >/dev/null 2>&1 || true; }
else
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  if [[ -z "$PGBIN" || ! -x "$PGBIN/initdb" ]]; then
    echo "ERROR: no PostgreSQL binaries found and DATABASE_URL is unset." >&2
    echo "Install postgresql, or point DATABASE_URL at a server." >&2
    exit 2
  fi
  PGDIR="$(mktemp -d /tmp/rlspg.XXXXXX)"
  PGPORT="${PGPORT:-55433}"
  log "Booting PostgreSQL from $PGBIN on port $PGPORT"

  # initdb refuses to run as root, so drop to a non-root owner when we are root.
  RUNAS=""
  if [[ "$(id -u)" -eq 0 ]]; then
    RUNAS="postgres"
    id "$RUNAS" >/dev/null 2>&1 || RUNAS="nobody"
    chown -R "$RUNAS" "$PGDIR"
  fi
  as_pg() { if [[ -n "$RUNAS" ]]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }

  as_pg "$PGBIN/initdb -D $PGDIR/data -A trust -U postgres" >/dev/null
  as_pg "$PGBIN/pg_ctl -D $PGDIR/data -o '-k $PGDIR -p $PGPORT -c listen_addresses=' -l $PGDIR/log -w start" >/dev/null

  cleanup() {
    as_pg "$PGBIN/pg_ctl -D $PGDIR/data -m immediate stop" >/dev/null 2>&1 || true
    rm -rf "$PGDIR"
  }
  psql_db() { as_pg "$PGBIN/psql -h $PGDIR -p $PGPORT -U postgres -d $DB_NAME -v ON_ERROR_STOP=1 -q $(printf '%q ' "$@")"; }
  as_pg "$PGBIN/psql -h $PGDIR -p $PGPORT -U postgres -q -c 'CREATE DATABASE \"$DB_NAME\";'" >/dev/null
  # Files must be readable by the demoted user.
  chmod -R a+rX "$REPO_ROOT/scripts/rls" "$MIGRATIONS" 2>/dev/null || true
fi
trap cleanup EXIT

# ── scaffolding ────────────────────────────────────────────────────────────
log "Applying Supabase-compatible scaffolding"
psql_db -v "DBNAME=$DB_NAME" -f "$BOOTSTRAP" >/dev/null

# ── the real migration set ─────────────────────────────────────────────────
log "Applying migrations from supabase/migrations"
applied=0; skipped=0; failed=0; failed_list=""
for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  base="$(basename "$f")"
  if printf '%s\n' "${SKIP_MIGRATIONS[@]}" | grep -qx "$base"; then
    skipped=$((skipped + 1)); continue
  fi
  if psql_db -f "$f" >/dev/null 2>&1; then
    applied=$((applied + 1))
  else
    failed=$((failed + 1)); failed_list="$failed_list  $base"
  fi
done

echo "   applied=$applied  skipped=$skipped (cron/net, no policies)  failed=$failed"
if [[ $failed -gt 0 ]]; then
  no_verdict "$failed_list"
fi

# ── the suite ──────────────────────────────────────────────────────────────
log "Running isolation checks"
if ! psql_db -f "$ISOLATION"; then
  breach_suspected
fi
