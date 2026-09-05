/**
 * Migration-drift gate.
 *
 * Migrations are deliberately not auto-applied (`deploy-functions.yml`: "schema changes stay
 * manual under the human gate"), so the repository can run ahead of the database. It did:
 * production sat 6 WEEKS AND 24 MIGRATIONS behind `main`, and the drift was discoverable only
 * when a query failed against a column that did not exist.
 *
 * THE RULE THIS ENFORCES: you may add a migration, but not while an earlier one is still
 * unapplied.
 *
 * That is deliberately not "fail any PR that adds a migration" — which would block every
 * ordinary schema change and be turned off within a week. One pending migration is a normal
 * in-flight change. TWO means the first was never pushed, and that is exactly how twenty-four
 * accumulate: each PR individually reasonable, the backlog invisible.
 *
 * The manifest (`supabase/migrations/APPLIED_TO_PROD.txt`) is maintained by whoever runs
 * `supabase db push`. CI cannot query production — it has no credentials and should not have
 * any — so the manifest is the only honest source available, and its staleness is itself the
 * signal: a manifest nobody updates makes the gate fire, which is the correct failure direction.
 */

export interface DriftInput {
  /** Every migration filename present in the repo. */
  repoMigrations: string[];
  /** Filenames listed in APPLIED_TO_PROD.txt (comments and blanks already stripped). */
  applied: string[];
  /** Filenames this pull request ADDS, relative to its base. */
  addedByPr: string[];
}

export interface DriftResult {
  ok: boolean;
  /** In the repo, not in the manifest. */
  pending: string[];
  /** Pending and NOT added by this PR — i.e. somebody else's unpushed migration. */
  preExistingPending: string[];
  /** In the manifest but not in the repo — the manifest is wrong, or a migration was deleted. */
  phantom: string[];
  reason: string;
}

export function computeDrift(input: DriftInput): DriftResult {
  const appliedSet = new Set(input.applied);
  const repoSet = new Set(input.repoMigrations);
  const addedSet = new Set(input.addedByPr);

  const pending = input.repoMigrations.filter((m) => !appliedSet.has(m)).sort();
  const preExistingPending = pending.filter((m) => !addedSet.has(m));
  const phantom = input.applied.filter((m) => !repoSet.has(m)).sort();

  // A phantom entry means the manifest claims production has something the repo does not. That
  // is a different failure from drift and must not be silently tolerated: it usually means a
  // migration was renamed or deleted after being applied, and the database now holds a change
  // no file describes.
  if (phantom.length > 0) {
    return {
      ok: false,
      pending,
      preExistingPending,
      phantom,
      reason:
        `APPLIED_TO_PROD.txt lists ${phantom.length} migration(s) that do not exist in the ` +
        `repo: ${phantom.join(", ")}. Either the manifest is wrong, or an applied migration ` +
        `was renamed/deleted — in which case production holds a change no file describes.`,
    };
  }

  if (preExistingPending.length > 0) {
    return {
      ok: false,
      pending,
      preExistingPending,
      phantom,
      reason:
        `${preExistingPending.length} migration(s) are in main but NOT applied to production, ` +
        `and this PR adds ${input.addedByPr.length} more on top:\n` +
        preExistingPending.map((m) => `  - ${m}`).join("\n") +
        `\n\nRun \`supabase db push\`, add the applied filenames to ` +
        `supabase/migrations/APPLIED_TO_PROD.txt, and merge that first. ` +
        `Stacking a second unapplied migration is how production fell 24 behind.`,
    };
  }

  return {
    ok: true,
    pending,
    preExistingPending,
    phantom,
    reason:
      pending.length === 0
        ? "Production is level with the repo."
        : `${pending.length} migration(s) pending, all added by this PR — that is the allowed case.`,
  };
}

/** Strip comments and blank lines from the manifest. */
export function parseManifest(contents: string): string[] {
  return contents
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}
