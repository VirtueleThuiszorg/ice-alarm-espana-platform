#!/usr/bin/env bash
# ================================================================
# Care Conneqt rebrand — find-and-replace for ICE brand strings
# ================================================================
# Run this from the root of the DUPLICATED repo (care-conneqt-platform/).
# It does TWO passes:
#   1. Dry-run (shows every hit) — safe, changes nothing
#   2. Apply (only runs if you pass --apply)
#
# Usage:
#   bash rebrand-strings.sh              # dry-run, just list hits
#   bash rebrand-strings.sh --apply      # actually rewrite files
#
# After --apply, review `git diff` carefully before committing.
# ================================================================

set -e

APPLY=false
if [ "$1" = "--apply" ]; then
  APPLY=true
fi

# Folders to scan (skip node_modules, .git, build output, lockfiles, binary assets)
SEARCH_PATHS=(src public supabase index.html package.json README.md)

# File globs to INCLUDE
INCLUDE_EXT='\.(ts|tsx|js|jsx|json|html|css|md|toml|yaml|yml|sql)$'

# Replacement pairs — ORDER MATTERS (longer/more specific strings first)
declare -a PAIRS=(
  "ICE Alarm España|Care Conneqt"
  "ICE Alarm Espana|Care Conneqt"
  "ICE Alarm|Care Conneqt"
  "ice-alarm-espana|care-conneqt"
  "ice-alarm|care-conneqt"
  "icealarm|careconneqt"
  "@ICEAlarmES|@CareConneqt"
  "\[ICE Alarm\]|[Care Conneqt]"
)

echo "=============================================="
if [ "$APPLY" = true ]; then
  echo "  MODE: APPLY — files WILL be rewritten"
else
  echo "  MODE: DRY-RUN — no files changed"
  echo "  (run with --apply to actually rewrite)"
fi
echo "=============================================="
echo ""

for pair in "${PAIRS[@]}"; do
  FIND="${pair%%|*}"
  REPLACE="${pair##*|}"
  echo ">>> Searching for: '$FIND'  →  '$REPLACE'"

  # Find matching files (portable across macOS/Linux)
  MATCHES=$(grep -rIlE "$FIND" "${SEARCH_PATHS[@]}" 2>/dev/null \
    | grep -E "$INCLUDE_EXT" || true)

  if [ -z "$MATCHES" ]; then
    echo "    (no matches)"
    echo ""
    continue
  fi

  echo "$MATCHES" | sed 's/^/    /'

  if [ "$APPLY" = true ]; then
    # macOS sed needs '' after -i; GNU sed doesn't. Detect and handle.
    if sed --version >/dev/null 2>&1; then
      # GNU sed (Linux)
      echo "$MATCHES" | xargs -I{} sed -i "s|$FIND|$REPLACE|g" "{}"
    else
      # BSD sed (macOS)
      echo "$MATCHES" | xargs -I{} sed -i '' "s|$FIND|$REPLACE|g" "{}"
    fi
    echo "    ✓ rewritten"
  fi
  echo ""
done

echo "=============================================="
echo "  Done."
if [ "$APPLY" = true ]; then
  echo "  Next: run 'git diff' to review changes,"
  echo "        then commit if happy."
else
  echo "  No changes made (dry-run)."
  echo "  Run 'bash rebrand-strings.sh --apply' to rewrite."
fi
echo "=============================================="
