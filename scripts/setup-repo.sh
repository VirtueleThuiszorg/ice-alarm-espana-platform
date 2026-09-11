#!/usr/bin/env bash
#
# ONE-TIME PER CLONE. Registers the things git will not take from a committed file.
#
#   npm run setup          (or: bash scripts/setup-repo.sh)
#
# WHY THIS CANNOT BE AUTOMATIC. `.gitattributes` can ask for `merge=regen`, but git will not run
# a merge driver a repository merely names — executing code from a cloned file is how a clone
# becomes an exploit. The same goes for hooks. So the repo declares the intent and each checkout
# opts in once, here.
#
# Safe to run repeatedly: every step is idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "setup-repo: not a git checkout, nothing to register."
  exit 0
fi

# ── 1. The merge driver for WIRING_REGISTER.md ──────────────────────────────
#
# Without it git falls back to an ORDINARY TEXTUAL MERGE of a generated file — which is the
# interleaving that put a duplicated `table:leads` row, with contradictory scores, onto main.
git config merge.regen.name "regenerate WIRING_REGISTER.md instead of merging it"
git config merge.regen.driver "node scripts/wiring/merge-driver.mjs %A"
echo "setup-repo: merge driver 'regen' registered."

# ── 2. The post-merge hook, which is what makes the result CORRECT ──────────
#
# The driver alone makes the register COHERENT — always generator output, never a splice of two
# sides. It does not make it RIGHT: git invokes a merge driver while it is still writing the
# working tree, so the generator can run before a source file from the other side has landed,
# and produce a register that is a wire or two stale. Measured, not assumed: a two-sided merge
# where each side added one call site produced 669 from the driver where the merged tree has 670.
#
# `post-merge` runs after the merge has finished and the tree is whole, so regenerating there is
# correct by construction. Together: the driver removes the catastrophic failure, the hook
# removes the residue, and the CI self-heal on main catches clones that never ran this.
HOOK_DIR="$(git rev-parse --git-path hooks)"
mkdir -p "$HOOK_DIR"
cat > "$HOOK_DIR/post-merge" <<'HOOK'
#!/usr/bin/env bash
# Installed by scripts/setup-repo.sh. Regenerates WIRING_REGISTER.md after a merge, because a
# merge driver runs mid-write and can only see a partial tree.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
[ -f "$root/scripts/wiring/build.mjs" ] || exit 0
if node "$root/scripts/wiring/build.mjs" >/dev/null 2>&1; then
  if ! git -C "$root" diff --quiet -- WIRING_REGISTER.md; then
    echo "post-merge: WIRING_REGISTER.md regenerated — stage it with the merge."
  fi
fi
HOOK
chmod +x "$HOOK_DIR/post-merge"
echo "setup-repo: post-merge hook installed at ${HOOK_DIR}/post-merge."

echo "setup-repo: done."
