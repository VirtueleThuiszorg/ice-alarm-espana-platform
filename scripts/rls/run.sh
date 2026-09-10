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
WIRING="$REPO_ROOT/scripts/rls/wiring.sql"
DB_NAME="rls_isolation_$$"

# pg_cron cannot be installed on a stock PostgreSQL. The migrations that need it
# are scheduling only — verified to contain zero CREATE POLICY, zero ENABLE ROW
# LEVEL SECURITY and zero CREATE TABLE — so skipping them costs this suite
# nothing. Listed explicitly so the skip is a decision, not a silent swallow,
# and so a future migration cannot join the list unnoticed.
SKIP_MIGRATIONS=(
  "20260122103824_ff8a9c0f-3584-4c0d-9cf4-24b56beedff3.sql"  # pg_cron
  "20260301100000_ev07b_offline_cron.sql"                    # pg_cron
  "20260716120000_sos_escalation_cron.sql"                   # pg_cron
  "20260723120000_fix_cron_url_and_auth.sql"                 # pg_cron
)

# ── pg_net IS NO LONGER SKIPPED, and that is the point of this block ────────
#
# Three files used to be skipped for pg_net, and the two that mattered were the
# router emits: `emit_lead_new_to_router` and `emit_shift_swap_to_router`. Being
# skipped meant NO CI JOB EVER COMPILED THEM. A plpgsql body that only
# production executes is a 3am failure waiting to happen, and one of them had
# already shipped a real bug — every swap request announced itself as a request
# for "cover", because it read `offered_shift_id`, which is NULL until the
# counterparty answers. It was found by hand on a throwaway database, after it
# had merged, and CI could not have caught it.
#
# The only statement in those files a stock PostgreSQL refuses is
# `CREATE EXTENSION ... pg_net`. Everything the functions actually CALL —
# net.http_post, vault.decrypted_secrets — is stubbed by bootstrap.sql, where
# the stub now RECORDS its arguments into net.sent so the suite can assert what
# each trigger asked the router to send.
#
# So every migration is applied, with that one statement commented out on the
# way in. No allow-list: a list would go stale the moment somebody adds a fourth
# pg_net migration, and the failure mode of a stale list here is a silently
# unapplied file. Detection is by content, and every rewrite is printed.
NEUTRALISE_PG_NET='s/^[[:space:]]*CREATE[[:space:]]+EXTENSION[^;]*pg_net[^;]*;/-- pg_net neutralised by scripts\/rls\/run.sh — net.http_post is stubbed in bootstrap.sql/I'

# AND THE CLAIM ABOVE IS NOW CHECKED, not just written down.
#
# The paragraph above says these files were "verified to contain zero CREATE POLICY, zero ENABLE
# ROW LEVEL SECURITY and zero CREATE TABLE". That verification was a human reading them once, and
# the next cron file could carry a table with it — at which point this suite would report hundreds
# of passes while silently never having created the thing under test. Cheap to enforce, so it is
# enforced: a skipped file that contains any of the three is NO VERDICT, not a pass.
#
# The list is down to four cron files because the pg_net ones are now applied. If a future
# migration needs pg_cron AND defines a table, split the schedule into its own file rather than
# widening this list.
for base in "${SKIP_MIGRATIONS[@]}"; do
  f="$MIGRATIONS/$base"
  [[ -f "$f" ]] || continue
  if grep -qiE '^[[:space:]]*(CREATE[[:space:]]+TABLE|ALTER[[:space:]]+TABLE[^;]*ENABLE[[:space:]]+ROW[[:space:]]+LEVEL|CREATE[[:space:]]+POLICY)' "$f"; then
    echo "✗ $base is on SKIP_MIGRATIONS but defines a table, a policy or RLS."
    echo "  Skipping it would make this suite certify isolation it never tested."
    echo "  Split the pg_cron statement into its own migration."
    exit 3
  fi
done

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
  cleanup() {
    psql "$DATABASE_URL" -q -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" >/dev/null 2>&1 || true
    rm -rf "${PREP_DIR:-}"
  }
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
    rm -rf "$PGDIR" "${PREP_DIR:-}"
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
applied=0; skipped=0; failed=0; failed_list=""; netted=0; net_list=""

# Rewritten copies live here, world-readable: when this script runs as root it demotes to
# `postgres` to talk to the cluster, and that user has to be able to read what psql is given.
PREP_DIR="$(mktemp -d /tmp/rlsmig.XXXXXX)"
chmod a+rX "$PREP_DIR"

for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  base="$(basename "$f")"
  if printf '%s\n' "${SKIP_MIGRATIONS[@]}" | grep -qx "$base"; then
    skipped=$((skipped + 1)); continue
  fi

  # Detected by content, never by a list — see NEUTRALISE_PG_NET above.
  src="$f"
  if grep -qiE '^[[:space:]]*CREATE[[:space:]]+EXTENSION[^;]*pg_net' "$f"; then
    sed -E "$NEUTRALISE_PG_NET" "$f" > "$PREP_DIR/$base"
    chmod a+r "$PREP_DIR/$base"
    src="$PREP_DIR/$base"
    netted=$((netted + 1)); net_list="$net_list  $base"
  fi

  if psql_db -f "$src" >/dev/null 2>&1; then
    applied=$((applied + 1))
  else
    failed=$((failed + 1)); failed_list="$failed_list  $base"
  fi
done

echo "   applied=$applied  skipped=$skipped (pg_cron, no policies)  failed=$failed"
if [[ $netted -gt 0 ]]; then
  # Said out loud every run: these files WERE applied, and one line of each was not.
  echo "   pg_net neutralised in $netted file(s) — applied against the recording stub:"
  printf '%s\n' "$net_list" | tr ' ' '\n' | grep -v '^$' | sed 's/^/     /'
fi
if [[ $failed -gt 0 ]]; then
  no_verdict "$failed_list"
fi

# ── the suite ──────────────────────────────────────────────────────────────
log "Running isolation checks"
if ! psql_db -f "$ISOLATION"; then
  breach_suspected
fi

# ── the realtime contract ──────────────────────────────────────────────────
#
# Reuses this database rather than booting a second one: the question ("is every
# table src/ subscribes to actually published?") needs the real
# pg_publication_tables, which is already here. The subscribed-table list is
# generated from the source so a subscription added later is covered without
# anyone editing SQL. See scripts/rls/realtime.sql for what it catches.
#
# Deliberately AFTER the isolation suite and reported separately: a dead
# subscription is a broken promise about a screen, not a tenancy breach, and
# conflating the two is how #136's red got read as noise.
log "Checking the realtime contract"
CHANNELS="$(mktemp /tmp/wiring-channels.XXXXXX.sql)"
chmod a+r "$CHANNELS"
if ! node "$REPO_ROOT/scripts/wiring/inventory.mjs" --channels > "$CHANNELS"; then
  echo "ERROR: could not derive the subscribed-table list from src/." >&2
  rm -f "$CHANNELS"
  exit 2
fi
# The generated prelude and the assertions run as ONE psql session, because the
# prelude creates a TEMP table: two -f files are one session, but the temp table
# must be created before the checks read it, so order matters here.
if ! psql_db -f "$CHANNELS" -f "$WIRING"; then
  rm -f "$CHANNELS"
  echo "::error title=Realtime contract broken::A postgres_changes subscription listens to a table that is not in the supabase_realtime publication. That callback never fires, and nothing reports it. Table names are in the log above."
  emit_summary "## 🔴 Realtime contract broken

A \`postgres_changes\` subscription listens to a table that is **not** in the
\`supabase_realtime\` publication.

Subscribing to an unpublished table **succeeds**: no error, no rejected promise,
no log line. The callback is simply never called, so the screen silently stops
being live. The table names are named in the job log.

Either publish the table (with \`REPLICA IDENTITY FULL\`) or remove the
subscription and stop promising a live screen."
  exit 1
fi
rm -f "$CHANNELS"
