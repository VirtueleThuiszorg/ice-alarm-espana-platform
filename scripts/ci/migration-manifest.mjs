/**
 * WHAT PRODUCTION ACTUALLY RAN, decided by asking production — not by assuming the push worked.
 *
 * `APPLIED_TO_PROD.txt` is the audit trail: the list of migrations that are really in the
 * production database. Its whole value is that it is TRUE, and the two ways to destroy that are
 * symmetrical:
 *
 *   too FEW names  a migration ran and was not recorded. The drift gate then reports it as
 *                  pending for ever and blocks every later schema PR — annoying, visible, safe.
 *   too MANY names a migration was recorded and did NOT run. The gate reports production as
 *                  up to date when it is not. THIS IS THE DANGEROUS ONE: it is exactly the state
 *                  the 24-migration drift hid inside, and nothing downstream can detect it,
 *                  because every check downstream trusts this file.
 *
 * So the rule this module exists to enforce: a name is appended if and only if the version
 * appeared in the remote migration list AFTER the push and was absent BEFORE it. Not "the push
 * exited 0" — `supabase db push` can apply some migrations and then fail on one, and the ones
 * before the failure are really applied and must be recorded even though the job is about to go
 * red. Not "the files we intended to push" either, for the same reason.
 *
 * The before/after diff is the only source that survives a partial push, so it is the only source
 * used.
 *
 * NO SECRETS REACH THIS MODULE. It is handed the CLI's stdout and the repo's file list, and it
 * returns text. The access token, project ref and DB password stay in the workflow's env.
 */

/** A migration version is exactly 14 digits — `20260909121500`. */
const VERSION = /\b(\d{14})\b/;

/** Both the box-drawing bar the current CLI prints and the ASCII pipe older ones printed. */
const COLUMN_SEPARATORS = /[|│]/;

/**
 * Read `supabase migration list --linked` into its two columns.
 *
 * The output is a three-column table — LOCAL, REMOTE, TIME — and the answer this module needs is
 * the REMOTE column, because that is the database speaking. A version present in LOCAL only is a
 * file that has not been applied; present in REMOTE only is something applied that this repo does
 * not have (someone ran a migration by hand, or a file was deleted).
 *
 * Parsed by SPLITTING ON THE COLUMN SEPARATOR rather than by matching the row shape. The CLI has
 * changed its table drawing at least once (ASCII pipes to box-drawing) and pads columns to
 * whatever the widest value is, so anything anchored to character positions or to a full-row
 * regex breaks on a CLI upgrade — silently, and in the direction that reads "nothing applied".
 */
export function parseMigrationList(stdout) {
  const text = String(stdout ?? "");

  // JSON FIRST, because that is what the CLI actually prints today.
  //
  // This was written as a table parser, against the three-column table the docs show and older
  // versions printed. Then the real command was run against a local Postgres seeded with a
  // `supabase_migrations.schema_migrations` table, and CLI 2.117.0 answered with:
  //
  //   {"migrations":[{"local":"20260909100000","remote":"20260909100000","time":"..."}],...}
  //
  // No pipes, no box-drawing, nothing the table parser could see — it would have returned zero
  // versions, which reads as "production has nothing". The empty-capture guard in `recordApplied`
  // would have caught it and failed the run rather than recording rubbish, but a gate that always
  // fails is not a gate. So: JSON when it is JSON, table when it is a table, and BOTH stay tested
  // — the CLI is not pinned (`setup-cli` takes `version: latest`), so the format can change under
  // us again in either direction.
  const jsonList = parseJsonList(text);
  if (jsonList) return jsonList;

  const local = [];
  const remote = [];

  for (const line of text.split("\n")) {
    // The header ("LOCAL │ REMOTE │ TIME (UTC)") and the rule under it carry no versions, so the
    // 14-digit requirement filters them out without needing to recognise them.
    if (!COLUMN_SEPARATORS.test(line)) continue;

    const columns = line.split(COLUMN_SEPARATORS);
    if (columns.length < 2) continue;

    const localMatch = VERSION.exec(columns[0]);
    const remoteMatch = VERSION.exec(columns[1]);

    if (localMatch) local.push(localMatch[1]);
    if (remoteMatch) remote.push(remoteMatch[1]);
  }

  return { local: dedupeSorted(local), remote: dedupeSorted(remote) };
}

function dedupeSorted(versions) {
  return [...new Set(versions)].sort();
}

/**
 * The CLI's JSON form, or null if this output is not that.
 *
 * The JSON is not alone on stdout — it is preceded by "Connecting to remote database..." and, in
 * this repo, by "Skipping migration APPLIED_TO_PROD.txt..." because the manifest sits in the
 * migrations directory. So the object is located rather than assumed to be the whole output.
 *
 * Returns null rather than throwing on anything unexpected, so the table parser still gets its
 * turn. A version is only accepted if it is 14 digits, exactly as in the table path: `remote` is
 * an empty string for an unapplied migration, and "" must not become a version.
 */
function parseJsonList(text) {
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  if (open === -1 || close <= open) return null;

  let parsed;
  try {
    parsed = JSON.parse(text.slice(open, close + 1));
  } catch {
    return null;
  }

  if (!parsed || !Array.isArray(parsed.migrations)) return null;

  const local = [];
  const remote = [];
  for (const row of parsed.migrations) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.local === "string" && /^\d{14}$/.test(row.local)) local.push(row.local);
    if (typeof row.remote === "string" && /^\d{14}$/.test(row.remote)) remote.push(row.remote);
  }

  return { local: dedupeSorted(local), remote: dedupeSorted(remote) };
}

/** The version prefix of a migration filename, or null if it is not named version-first. */
export function versionOf(filename) {
  const m = /^(\d{14})_/.exec(filename);
  return m ? m[1] : null;
}

/**
 * The versions production gained. Ascending, because that is the order they ran in and the order
 * the manifest reads in.
 *
 * A version that DISAPPEARED between before and after is not this module's business to fix, but it
 * is returned so the caller can fail loudly: migrations do not un-apply by themselves, and the
 * likeliest cause is that the two lists came from different databases.
 */
export function diffRemote(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    applied: after.filter((v) => !beforeSet.has(v)).sort(),
    vanished: before.filter((v) => !afterSet.has(v)).sort(),
  };
}

/** Manifest entries, ignoring comments and blank lines. Mirrors scripts/migrationDrift.mjs. */
export function manifestEntries(text) {
  return String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/**
 * Decide the manifest's new contents, and say exactly what happened.
 *
 * Returns `ok: false` with a reason when something is wrong enough that the job must go red —
 * but STILL returns the manifest text to write, because a partial push has really applied
 * migrations and refusing to record them would leave the manifest lying in the dangerous
 * direction while the job merely looked angry.
 */
export function recordApplied({ beforeStdout, afterStdout, repoFiles, manifestText }) {
  const before = parseMigrationList(beforeStdout).remote;
  const after = parseMigrationList(afterStdout).remote;
  const { applied, vanished } = diffRemote(before, after);

  const byVersion = new Map();
  for (const file of repoFiles) {
    const v = versionOf(file);
    if (v) byVersion.set(v, file);
  }

  const already = new Set(manifestEntries(manifestText));

  const appliedFiles = [];
  const unknownVersions = [];
  for (const version of applied) {
    const file = byVersion.get(version);
    if (!file) {
      // Applied in production, no file in this repo. Recording it is impossible (there is no
      // name), and it means production and main disagree about what exists.
      unknownVersions.push(version);
      continue;
    }
    if (already.has(file)) continue;
    appliedFiles.push(file);
  }

  // Everything the repo has that production still does not.
  const remoteAfter = new Set(after);
  const pending = repoFiles
    .filter((f) => {
      const v = versionOf(f);
      return v !== null && !remoteAfter.has(v);
    })
    .sort();

  const problems = [];

  // IS THE BEFORE-CAPTURE CREDIBLE AT ALL?
  //
  // Every other check here compares the two captures, so both of them being empty produces a
  // confident "nothing applied" — and that is exactly what a BROKEN PARSER looks like. The CLI has
  // changed its table drawing once already; the next change would not raise, it would silently
  // yield no versions, and this module would then report a successful five-migration push as a
  // no-op, run after run, while the manifest quietly fell behind production.
  //
  // The manifest is the tell. It names 180 migrations that are supposed to be in production, so a
  // remote list with nothing in it means one of three things — the parser broke, the CLI failed
  // and printed a message instead of a table, or this is not the production database — and not one
  // of them is a state in which anything should be recorded.
  if (before.length === 0 && already.size > 0) {
    problems.push(
      `the BEFORE capture contains no migration versions, but the manifest names ` +
        `${already.size}. Either \`supabase migration list\` did not print a table (check the ` +
        `step's log), or its output format changed and parseMigrationList no longer reads it. ` +
        `Refusing to treat that as "production had nothing".`,
    );
  }

  if (vanished.length > 0) {
    problems.push(
      `migration(s) present BEFORE the push and absent after: ${vanished.join(", ")}. ` +
        `Migrations do not un-apply; the two lists probably came from different databases.`,
    );
  }
  if (unknownVersions.length > 0) {
    problems.push(
      `production applied version(s) with no matching file in this repo: ` +
        `${unknownVersions.join(", ")}. Nothing was recorded for them — there is no filename to ` +
        `record — so the manifest is now incomplete by design rather than by accident.`,
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    appliedVersions: applied,
    appliedFiles,
    unknownVersions,
    vanished,
    pending,
    remoteAfter: after,
    manifestText: appendEntries(manifestText, appliedFiles),
  };
}

/**
 * Append names, preserving everything already there.
 *
 * Append-only and never a rewrite: this file is the audit trail, and a generator that reformats it
 * would make every future diff unreadable and could drop a hand-written note. One trailing newline
 * is guaranteed so the next append cannot land on the same line as the last entry.
 */
export function appendEntries(manifestText, entries) {
  const text = String(manifestText ?? "");
  if (entries.length === 0) return text;
  const base = text.endsWith("\n") || text === "" ? text : `${text}\n`;
  return `${base}${entries.join("\n")}\n`;
}

/** The job summary. Read by a human deciding whether production is where they think it is. */
export function summaryMarkdown(result, { runUrl } = {}) {
  const lines = [];
  const list = (items) => (items.length === 0 ? "_none_" : items.map((i) => `- \`${i}\``).join("\n"));

  lines.push("## Migrations applied to production");
  lines.push("");
  lines.push(
    result.appliedFiles.length === 0 && result.appliedVersions.length === 0
      ? "**Nothing applied** — production was already up to date with this commit."
      : `**${result.appliedFiles.length} applied**, recorded in \`APPLIED_TO_PROD.txt\`.`,
  );
  lines.push("");
  lines.push("### Applied by this run");
  lines.push(list(result.appliedFiles));
  lines.push("");
  lines.push("### Still pending (in the repo, not in production)");
  lines.push(list(result.pending));
  lines.push("");

  if (result.unknownVersions.length > 0) {
    lines.push("### ⚠️ Applied in production with no file here");
    lines.push(list(result.unknownVersions));
    lines.push("");
  }
  if (result.vanished.length > 0) {
    lines.push("### 🔴 Present before the push, gone after");
    lines.push(list(result.vanished));
    lines.push("");
  }

  lines.push(`### Remote migration list after the push (${result.remoteAfter.length})`);
  lines.push("");
  lines.push("```");
  lines.push(result.remoteAfter.join("\n") || "(empty)");
  lines.push("```");

  if (runUrl) {
    lines.push("");
    lines.push(`[Run](${runUrl})`);
  }

  return lines.join("\n");
}

/**
 * IS THE MANIFEST TELLING THE TRUTH? Asked of the database, not of the repo.
 *
 * The file-based drift gate compares the repo against the manifest, which catches a migration
 * that was merged and never applied. It cannot catch the manifest being WRONG, because it has
 * nothing to check it against — and on 2026-09-09 the manifest was wrong: production had
 * `20260909100000`, `20260909110000` and `20260909121500`, applied by hand, and the manifest
 * named none of them.
 *
 * That gap was invisible for as long as nobody looked, and then it surfaced in the worst possible
 * way: applying `...121500` without `...120000` left an unapplied migration behind the newest
 * applied one, and `supabase db push` refuses that state outright. The first automated migrate run
 * failed on it. A three-line bookkeeping error stopped the pipeline, and the only reason anyone
 * found out is that the run printed the remote list.
 *
 * So this asks production what it has and compares BOTH directions, because they fail differently:
 *
 *   UNRECORDED  production has it, the manifest does not name it. Understates reality. This is
 *               what happened. Harmless-looking, and it silently breaks `db push` ordering.
 *   PHANTOM     the manifest names it, production does not have it. OVERSTATES reality, which is
 *               the dangerous direction — every check downstream reads this file and would
 *               conclude production is up to date while it is behind.
 *
 * Neither is tolerated. `pending` is returned for the summary but is NOT a failure here: a
 * migration merged and not yet applied is the file-based gate's business, and failing on it twice
 * would just mean two red Xs for one fact.
 */
export function compareManifestToRemote({ remoteStdout, repoFiles, manifestText }) {
  const remote = new Set(parseMigrationList(remoteStdout).remote);
  const recorded = manifestEntries(manifestText);
  const recordedSet = new Set(recorded);

  const byVersion = new Map();
  for (const file of repoFiles) {
    const v = versionOf(file);
    if (v) byVersion.set(v, file);
  }

  const pendingAll = repoFiles
    .filter((f) => {
      const v = versionOf(f);
      return v !== null && !remote.has(v);
    })
    .sort();

  // AN EMPTY REMOTE LIST BESIDE A NON-EMPTY MANIFEST IS NOT A FINDING, IT IS A BROKEN READ — and
  // it returns EMPTY lists, not the findings it would otherwise compute. Against a 183-migration
  // database an unparseable `migration list` would otherwise call every recorded entry a phantom
  // and demand the whole manifest be deleted. Reporting nothing but the reason is the only safe
  // answer, because `phantom` is a list somebody (or something) might act on.
  if (remote.size === 0 && recordedSet.size > 0) {
    return {
      ok: false,
      problems: [
        `production reported NO applied migrations while the manifest names ${recorded.length}. ` +
          `That is a failed or unparseable \`supabase migration list\`, not an empty database — ` +
          `refusing to draw any conclusion from it.`,
      ],
      unrecorded: [],
      phantom: [],
      unknownRemote: [],
      pending: pendingAll,
      remoteCount: 0,
      recordedCount: recorded.length,
    };
  }

  const unrecorded = [];
  const unknownRemote = [];
  for (const version of [...remote].sort()) {
    const file = byVersion.get(version);
    if (!file) {
      unknownRemote.push(version);
      continue;
    }
    if (!recordedSet.has(file)) unrecorded.push(file);
  }

  const phantom = recorded.filter((file) => {
    const v = versionOf(file);
    // A manifest line that is not version-first cannot be checked against the remote list; the
    // repo-level naming guard is what polices that, so it is not called a phantom here.
    return v !== null && !remote.has(v);
  });

  const problems = [];
  {
    if (unrecorded.length > 0) {
      problems.push(
        `production has ${unrecorded.length} migration(s) the manifest does not name: ` +
          `${unrecorded.join(", ")}. Append them — an unrecorded applied migration is what left ` +
          `production's history out of order and made \`db push\` refuse.`,
      );
    }
    if (phantom.length > 0) {
      problems.push(
        `the manifest names ${phantom.length} migration(s) production does NOT have: ` +
          `${phantom.join(", ")}. This is the dangerous direction: every check downstream trusts ` +
          `this file and would read production as up to date while it is behind.`,
      );
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    unrecorded,
    phantom,
    unknownRemote,
    pending: pendingAll,
    remoteCount: remote.size,
    recordedCount: recorded.length,
  };
}
