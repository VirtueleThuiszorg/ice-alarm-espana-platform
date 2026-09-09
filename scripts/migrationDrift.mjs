/**
 * Migration-drift gate. Plain JS with JSDoc types, NOT TypeScript: scripts/check-migration-drift.mjs
 * imports this at runtime under Node 20, which cannot load a .ts file. Keeping it .ts meant the
 * CLI carried a second hand-written copy of the rule — the copy that actually ran, and the one
 * the tests never saw.
 *
 * Migrations USED to be applied by hand, so the repository could run ahead of the database. It
 * did: production sat 6 WEEKS AND 24 MIGRATIONS behind `main`, and the drift was discoverable
 * only when a query failed against a column that did not exist. Since 2026-09-09
 * `.github/workflows/migrate.yml` applies them on every push to main that touches
 * supabase/migrations/**, and records what really applied in APPLIED_TO_PROD.txt.
 *
 * That does not retire this gate, it changes what a red gate MEANS. Drift is now a symptom of a
 * migrate run that failed or never fired, rather than of a human who forgot — and a pull request
 * still has no database to ask, so the file-based comparison below is exactly what a PR needs.
 *
 * THE RULE, IN TWO HALVES — because "who is responsible" differs by context:
 *
 *   ON MAIN            any pending migration FAILS. Main is the branch production is supposed
 *                      to match, and there is no "this PR added it" to point at: every pending
 *                      migration on main is unapplied production drift, and the red X on main is
 *                      the standing alarm that says so.
 *
 *   ON A PULL REQUEST  adding a migration while an earlier one is still pending FAILS. Adding
 *                      NONE passes, with a warning naming what is pending.
 *
 * WHY THE SECOND HALF CHANGED. It used to fail every PR while anything was pending, innocent or
 * not, and on 2026-09-08 that showed its cost: one unapplied migration on main turned every open
 * PR red — a docs-only change, a validation fix, a test — none of which could clear it, because
 * clearing it means running `supabase db push` and recording the filename, which CI cannot do
 * and no PR can carry. The gate stopped saying "do not stack another migration" and started
 * saying "nobody may merge anything", which is not a schema rule, and a rule that blocks
 * unrelated work is a rule somebody switches off.
 *
 * Worse, it hid the two apart. The drift gate runs BEFORE typecheck and build in the same job,
 * so those steps reported `skipped`: for as long as the drift stood, no PR had a typecheck
 * signal at all and nobody could see that from the red X. A PR that adds no migration is not the
 * problem and now says so loudly instead of failing quietly for somebody else's reason.
 *
 * What did NOT change: STACKING still fails. One pending migration is a normal in-flight change;
 * two means the first was never pushed, and that is exactly how twenty-four accumulate, each PR
 * individually reasonable and the backlog invisible.
 *
 * The manifest (`supabase/migrations/APPLIED_TO_PROD.txt`) is maintained by whoever runs
 * `supabase db push`. CI cannot query production — it has no credentials and should not have
 * any — so the manifest is the only honest source available, and its staleness is itself the
 * signal: a manifest nobody updates makes the gate fire, which is the correct failure direction.
 */

/**
 * @typedef {object} DriftInput
 * @property {string[]} repoMigrations Every migration filename present in the repo.
 * @property {string[]} applied Filenames listed in APPLIED_TO_PROD.txt (comments/blanks stripped).
 * @property {string[]} addedByPr Filenames this pull request ADDS, relative to its base. Empty on main.
 * @property {boolean} onMain True when this run IS main (a push to it, or a local run with
 *   nothing added), false for a pull request. It decides whether pending migrations are a
 *   failure or a warning, so it is a required input rather than something inferred here from an
 *   empty `addedByPr` — a PR that happens to add no migration must not be mistaken for main.
 */

/**
 * @typedef {object} DriftResult
 * @property {boolean} ok
 * @property {string[]} pending In the repo, not in the manifest.
 * @property {string[]} preExistingPending Pending and NOT added by this PR — somebody else's.
 * @property {string[]} phantom In the manifest but not in the repo.
 * @property {string} reason Why it failed, or why it passed. Always set.
 * @property {string} warning Set when the run PASSES but something is pending anyway — the
 *   innocent-PR case. Empty otherwise; a passing gate with an empty warning is the only fully
 *   clean state.
 */

// No trailing "and merge that": each caller says what comes next, and having it here too
// produced "…and merge that. Merge that first, then this." in the stacking message.
const pushInstruction =
  "Run `supabase db push` and record the applied filenames in " +
  "supabase/migrations/APPLIED_TO_PROD.txt.";

/**
 * @param {DriftInput} input
 * @returns {DriftResult}
 */
export function computeDrift(input) {
  const appliedSet = new Set(input.applied);
  const repoSet = new Set(input.repoMigrations);
  const addedSet = new Set(input.addedByPr);

  const pending = input.repoMigrations.filter((m) => !appliedSet.has(m)).sort();
  const preExistingPending = pending.filter((m) => !addedSet.has(m));
  const phantom = input.applied.filter((m) => !repoSet.has(m)).sort();
  const listed = (/** @type {string[]} */ ms) => ms.map((m) => `  - ${m}`).join("\n");

  // A phantom entry means the manifest claims production has something the repo does not. That
  // is a different failure from drift and must not be silently tolerated: it usually means a
  // migration was renamed or deleted after being applied, and the database now holds a change
  // no file describes. Checked first, on main and on a PR alike.
  if (phantom.length > 0) {
    return {
      ok: false,
      pending,
      preExistingPending,
      phantom,
      warning: "",
      reason:
        `APPLIED_TO_PROD.txt lists ${phantom.length} migration(s) that do not exist in the ` +
        `repo: ${phantom.join(", ")}. Either the manifest is wrong, or an applied migration ` +
        `was renamed/deleted — in which case production holds a change no file describes.`,
    };
  }

  // ── main ────────────────────────────────────────────────────────────────
  // No PR to attribute anything to. Anything pending here is production drift, and main going
  // red is the alarm. It stays red until somebody pushes the migration and records it, which is
  // the only thing that can clear it.
  if (input.onMain) {
    if (pending.length > 0) {
      return {
        ok: false,
        pending,
        preExistingPending,
        phantom,
        warning: "",
        reason:
          `${pending.length} migration(s) on main are NOT applied to production:\n` +
          listed(pending) +
          `\n\n${pushInstruction} Until that merges, production is behind main — and a query ` +
          `against a column that does not exist yet is how that is usually discovered.`,
      };
    }
    return {
      ok: true,
      pending,
      preExistingPending,
      phantom,
      warning: "",
      reason: "Production is level with the repo.",
    };
  }

  // ── a pull request ──────────────────────────────────────────────────────
  // Stacking: this PR adds a migration on top of one nobody has pushed. The failure the gate
  // exists for.
  if (input.addedByPr.length > 0 && preExistingPending.length > 0) {
    return {
      ok: false,
      pending,
      preExistingPending,
      phantom,
      warning: "",
      reason:
        `${preExistingPending.length} migration(s) are already pending, and this PR adds ` +
        `${input.addedByPr.length} more on top:\n` +
        listed(preExistingPending) +
        `\n\nthis PR adds:\n` +
        listed(input.addedByPr) +
        `\n\n${pushInstruction} Merge that first, then this. Stacking a second unapplied ` +
        `migration is how production fell 24 behind.`,
    };
  }

  // Innocent PR, drifted main: PASSES, and says what is pending. This PR cannot fix it — only
  // `supabase db push` plus a manifest line can — so failing it would block unrelated work
  // without moving the schema an inch closer to production.
  if (preExistingPending.length > 0) {
    return {
      ok: true,
      pending,
      preExistingPending,
      phantom,
      reason: "This PR adds no migration, so it is not stacking on the pending one(s).",
      warning:
        `${preExistingPending.length} migration(s) are in main and NOT applied to production:\n` +
        listed(preExistingPending) +
        `\n\nThis PR adds none, so it is not blocked — but production is behind main, and a PR ` +
        `that DOES add a migration will fail until this is cleared. ${pushInstruction}`,
    };
  }

  return {
    ok: true,
    pending,
    preExistingPending,
    phantom,
    warning: "",
    reason:
      pending.length === 0
        ? "Production is level with the repo."
        : `${pending.length} migration(s) pending, all added by this PR — that is the allowed case.`,
  };
}

/**
 * Strip comments and blank lines from the manifest.
 * @param {string} contents
 * @returns {string[]}
 */
export function parseManifest(contents) {
  return contents
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

/**
 * Which half of the rule applies, from the CLI arguments and the two commits.
 *
 * An explicit `--main` / `--pr` wins, because CI knows exactly which it is (`github.event_name`)
 * and guessing in the one place that has the answer would be perverse. Without a flag it falls
 * back to comparing the base and head commits: on a push to main the checked-out HEAD IS
 * `origin/main`, while a PR is always at least one commit past its base. That fallback is for
 * running this by hand.
 *
 * The default when nothing is known is `onMain: true` — the strict half. A PR misread as main
 * gets a red X somebody investigates; main misread as a PR gets a warning nobody acts on.
 */
/**
 * @param {readonly string[]} argv
 * @param {{ base?: string, head?: string }} [revs]
 * @returns {{ onMain: boolean, how: string }}
 */
export function resolveContext(argv, revs = {}) {
  if (argv.includes("--pr")) return { onMain: false, how: "--pr" };
  if (argv.includes("--main")) return { onMain: true, how: "--main" };
  if (revs.base && revs.head) {
    return revs.base === revs.head
      ? { onMain: true, how: "HEAD is the base ref, so this is main" }
      : { onMain: false, how: "HEAD is ahead of the base ref, so this is a branch" };
  }
  return { onMain: true, how: "no flag and no comparable revs — defaulting to the strict half" };
}
