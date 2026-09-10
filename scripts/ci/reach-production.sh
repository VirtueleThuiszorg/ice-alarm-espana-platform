#!/usr/bin/env bash
#
# REACH PRODUCTION — the one implementation, shared by every job that needs the live database.
#
#   scripts/ci/reach-production.sh "apply migrations"
#   scripts/ci/reach-production.sh "check the manifest"
#
# The argument is what the caller is about to do, and it only ever appears in messages. On
# success the CLI is pointed at production and `--linked` works for whatever runs next.
#
# WHY THIS IS A SCRIPT AND NOT TWO COPIES. It was born inline in `migrate.yml` (#313) when
# `supabase link` started refusing our access token, and for a few hours the migrate job could
# reach production while ci.yml's "Manifest matches production" job — which links the same way,
# to the same project, with the same secrets — stayed red. That is the worst shape for a gate to
# be in: permanently red for a reason unrelated to the commit, which teaches everybody to merge
# past a red X. Two implementations would also have meant fixing the token privilege in one place
# and not the other.
#
# WHAT IT DOES, in order:
#   1. `supabase link`. Tried FIRST, always, so restoring the Management API privilege puts every
#      caller back on the supported path with no further change and no flag to remember.
#   2. If link is refused, write the two files link would have written — the project ref and an
#      IPv4 pooler URL — into the gitignored `supabase/.temp/`, then PROBE each regional pooler
#      endpoint with a READ-ONLY `migration list` and keep the one that authenticates.
#   3. If neither works, fail loudly and touch nothing.
#
# WHY THE POOLER AND NOT `db.<ref>.supabase.co`: that host has no A record, only AAAA, and GitHub
# runners have no IPv6 route. The pooler endpoints are the IPv4 path Supabase publishes.
#
# THE PASSWORD RULES, which are not negotiable and are pinned by src/test/ciJobIsolation.test.ts:
#   * never a command-line argument — a password in argv reaches the process list and any `set -x`
#   * the percent-encoded form is masked with ::add-mask:: before it is used anywhere
#   * the URL file is written under `umask 077` and chmod 600, and removed if no host worked
#   * nothing that expands $SUPABASE_DB_PASSWORD may print
#
# Outputs, for callers that want to know how they got there:
#   mode=linked|pooler   host=<pooler host>   (written to $GITHUB_OUTPUT when set)
set -uo pipefail

WHAT="${1:-work on production}"

emit() { [[ -n "${GITHUB_OUTPUT:-}" ]] && printf '%s\n' "$1" >> "$GITHUB_OUTPUT"; return 0; }

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is not set}"

if supabase link --project-ref "$SUPABASE_PROJECT_REF" 2>/tmp/link.err; then
  echo "reached production through the Management API (supabase link)"
  emit "mode=linked"
  exit 0
fi

echo "supabase link was refused:" >&2
sed 's/^/  /' /tmp/link.err >&2

: "${SUPABASE_DB_PASSWORD:?supabase link was refused and SUPABASE_DB_PASSWORD is not set — there is no way left to reach production}"

ENC="$(python3 -c 'import os,urllib.parse; print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"], safe=""))')"
echo "::add-mask::$ENC"

mkdir -p supabase/.temp
printf '%s' "$SUPABASE_PROJECT_REF" > supabase/.temp/project-ref

# `eu-west-1` is this project's region (docs/archive/AUDIT_REPORT_2026-06.md section 5, indexed by
# PROJECT_REFS.md). Both regional endpoints resolve, and which one serves a given project is not
# derivable, so each is PROBED with a READ-ONLY `migration list`. Nothing is written to production
# until a connection is known to work.
for HOST in aws-0-eu-west-1.pooler.supabase.com aws-1-eu-west-1.pooler.supabase.com; do
  umask 077
  printf 'postgresql://postgres.%s:%s@%s:5432/postgres' \
    "$SUPABASE_PROJECT_REF" "$ENC" "$HOST" > supabase/.temp/pooler-url
  chmod 600 supabase/.temp/pooler-url
  echo "probing $HOST (read-only)..."
  if supabase migration list --linked > /tmp/probe.txt 2>/tmp/probe.err; then
    echo "connected through $HOST"
    emit "mode=pooler"
    emit "host=$HOST"
    echo "::warning title=Reached production WITHOUT the Management API::supabase link was refused, so this run went straight to the database through $HOST to ${WHAT}. The access token still lacks the privilege link needs - see PENDING_FOR_LEE section 1. This is a fallback, not a fix."
    exit 0
  fi
  sed 's/^/  /' /tmp/probe.err >&2
done

rm -f supabase/.temp/pooler-url
echo "::error title=Cannot reach production at all::supabase link was refused AND no pooler candidate authenticated, so this run cannot ${WHAT}. Nothing has been changed. Fix SUPABASE_ACCESS_TOKEN (PENDING_FOR_LEE section 1), or the database password if that is what the probe rejected."
exit 1
