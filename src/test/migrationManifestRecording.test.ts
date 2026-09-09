// @vitest-environment node
//
// THE ONE THING CI MUST NEVER GET WRONG once it is allowed to apply schema.
//
// `APPLIED_TO_PROD.txt` is the audit trail, and every other check trusts it. The two ways to
// break it are NOT symmetrical:
//
//   too FEW names  a migration ran and went unrecorded. The drift gate then calls it pending
//                  for ever and blocks later schema PRs. Loud, visible, safe.
//   too MANY names a migration was recorded that never ran. The gate now reports production as
//                  up to date when it is behind — which is precisely the state the six-week,
//                  24-migration drift hid inside. NOTHING downstream can catch this, because
//                  everything downstream reads this file.
//
// So the property under test is one-directional and absolute: a name is appended if and only if
// its version appeared in the REMOTE list after the push and was absent before it. Never because
// the push exited 0 — `supabase db push` can apply four of five migrations and then fail, and the
// four are really applied. Never because a file was in the set we meant to push.
//
// Everything here drives the real functions. The parser is tested against BOTH table styles the
// Supabase CLI has printed, because the failure mode of a broken parser is "no versions found",
// which reads as "nothing applied" and silently records nothing for ever.

import { describe, it, expect } from "vitest";
import {
  parseMigrationList,
  versionOf,
  diffRemote,
  manifestEntries,
  appendEntries,
  recordApplied,
  summaryMarkdown,
} from "../../scripts/ci/migration-manifest.mjs";

/** The current CLI's box-drawing table. */
const boxTable = (rows: Array<[string, string]>) =>
  [
    "Connecting to remote database...",
    "",
    "        LOCAL      │     REMOTE     │     TIME (UTC)      ",
    "  ─────────────────┼────────────────┼─────────────────────",
    ...rows.map(
      ([l, r]) =>
        `    ${l.padEnd(14)} │ ${r.padEnd(14)} │ ${r ? "2026-09-09 12:00:00" : "                   "} `,
    ),
    "",
  ].join("\n");

/** The older ASCII table, which a pinned or downgraded CLI still prints. */
const asciiTable = (rows: Array<[string, string]>) =>
  [
    "   LOCAL      | REMOTE     | TIME (UTC)          ",
    "  ------------|------------|---------------------",
    ...rows.map(([l, r]) => `   ${l.padEnd(14)}| ${r.padEnd(14)}| ${r ? "2026-09-09 12:00:00" : ""}`),
  ].join("\n");

const A = "20260909100000";
const B = "20260909110000";
const C = "20260909120000";

const FILES = [
  "20260909100000_sales_command_stats_fix.sql",
  "20260909110000_payment_link_order.sql",
  "20260909120000_rota_2026_seed_and_generator.sql",
];

describe("parsing `supabase migration list --linked`", () => {
  it("reads the REMOTE column, which is the database speaking", () => {
    const out = parseMigrationList(boxTable([[A, A], [B, ""]]));
    expect(out.remote).toEqual([A]);
    expect(out.local).toEqual([A, B]);
  });

  it("reads the OLD ascii table too — a CLI upgrade must not silently empty this", () => {
    // The dangerous direction: a parser that finds nothing reads as "nothing applied", which
    // records nothing, for ever, without an error.
    const out = parseMigrationList(asciiTable([[A, A], [B, ""]]));
    expect(out.remote).toEqual([A]);
  });

  it("ignores the header and the horizontal rule", () => {
    expect(parseMigrationList(boxTable([])).remote).toEqual([]);
  });

  it("reads a remote-only row — something applied that this repo does not have", () => {
    const out = parseMigrationList(boxTable([["", C]]));
    expect(out.remote).toEqual([C]);
    expect(out.local).toEqual([]);
  });

  it("does not mistake the timestamp column for a version", () => {
    // "2026-09-09 12:00:00" contains digits but no 14-digit run; if the parser matched loosely it
    // would invent versions out of times.
    const out = parseMigrationList(boxTable([[A, A]]));
    expect(out.remote).toEqual([A]);
  });

  it("requires EXACTLY 14 digits — a shorter or longer number is not a version", () => {
    // The assertion above turned out to prove nothing: the timestamp lives in the third column,
    // which is never parsed, so loosening the pattern to `\d+` passed the whole suite. Found by
    // mutation. The width matters because a mis-read cell would be recorded as a real version and
    // the manifest would then name a migration that does not exist.
    const short = parseMigrationList(boxTable([["", "2026090912150"]]));
    expect(short.remote).toEqual([]);

    const long = parseMigrationList(boxTable([["", "202609091215000"]]));
    expect(long.remote).toEqual([]);
  });

  it("survives empty, null and junk input rather than throwing mid-run", () => {
    for (const input of ["", null, undefined, "Connecting...\nno table here"]) {
      expect(parseMigrationList(input as string)).toEqual({ local: [], remote: [] });
    }
  });
});

/**
 * THE FORMAT THE CLI ACTUALLY PRINTS, captured from `supabase migration list --db-url` at
 * version 2.117.0 against a real Postgres seeded with a `supabase_migrations.schema_migrations`
 * table. Preamble included verbatim, because it is part of what the workflow captures — the
 * second line appears because APPLIED_TO_PROD.txt lives in the migrations directory.
 *
 * This file was originally written against the three-column TABLE the docs show, and every
 * assertion passed. The real command answers with JSON, in which the table parser found zero
 * versions — i.e. "production has nothing", on a database with 180 migrations. The empty-capture
 * guard would have failed the run rather than recording rubbish, but the run would have failed.
 */
const realJsonOutput = (rows: Array<[string, string]>) =>
  [
    "Connecting to remote database...",
    'Skipping migration APPLIED_TO_PROD.txt... (file name must match pattern "<timestamp>_name.sql")',
    JSON.stringify({
      migrations: rows.map(([local, remote]) => ({
        local,
        remote,
        time: "2026-09-09 12:00:00",
      })),
      message: "Migrations listed",
    }),
    "",
  ].join("\n");

describe("the format the CLI really prints — JSON, not a table", () => {
  it("reads the REMOTE column out of the JSON", () => {
    const out = parseMigrationList(realJsonOutput([[A, A], [B, ""], [C, ""]]));
    expect(out.remote).toEqual([A]);
    expect(out.local).toEqual([A, B, C]);
  });

  it("finds the object even though two lines of prose come first", () => {
    // The JSON is not alone on stdout. A parser that assumed the whole output was the document
    // would throw, and one that read only the first line would find nothing.
    expect(parseMigrationList(realJsonOutput([[A, A]])).remote).toEqual([A]);
  });

  it('treats an empty `remote` as NOT applied, rather than as a version', () => {
    // Every unapplied migration has `"remote": ""`. If "" became a version, the first run would
    // record every migration in the repo as applied.
    const out = parseMigrationList(realJsonOutput([[A, ""], [B, ""]]));
    expect(out.remote).toEqual([]);
  });

  it("ignores a malformed FIELD instead of failing the whole parse", () => {
    const output = realJsonOutput([[A, A]]).replace('"local":"' + A + '"', '"local":null');
    expect(parseMigrationList(output).remote).toEqual([A]);
  });

  it("ignores a null ROW rather than throwing on it", () => {
    // Distinct from the case above, and it has to be: that one replaces a FIELD, so the row is
    // still an object and the row-level guard was never exercised. Deleting the guard passed the
    // whole suite. A `null` entry in the array would throw on `row.local` and take the parse —
    // and therefore the run's only evidence of what applied — down with it.
    const output = realJsonOutput([[A, A], [B, B]]).replace(
      '{"local":"' + B + '","remote":"' + B + '","time":"2026-09-09 12:00:00"}',
      "null",
    );
    expect(() => parseMigrationList(output)).not.toThrow();
    expect(parseMigrationList(output).remote).toEqual([A]);
  });

  it("still reads the TABLE form, because the CLI is not pinned to a version", () => {
    // `setup-cli` takes `version: latest`, so the format can change under us again — in either
    // direction. Both paths stay tested for exactly that reason.
    expect(parseMigrationList(boxTable([[A, A], [B, ""]])).remote).toEqual([A]);
    expect(parseMigrationList(asciiTable([[A, A], [B, ""]])).remote).toEqual([A]);
  });

  it("falls back to the table when the JSON is not a migration list", () => {
    const errorJson = '{"_tag":"Error","error":{"code":"LegacyDbConnectError"}}';
    expect(parseMigrationList(errorJson).remote).toEqual([]);
    expect(parseMigrationList(errorJson + "\n" + boxTable([[A, A]])).remote).toEqual([A]);
  });

  it("records correctly end-to-end from the real format", () => {
    const r = recordApplied({
      beforeStdout: realJsonOutput([[A, A], [B, ""], [C, ""]]),
      afterStdout: realJsonOutput([[A, A], [B, B], [C, C]]),
      repoFiles: FILES,
      manifestText: `${FILES[0]}\n`,
    });
    expect(r.ok).toBe(true);
    expect(r.appliedFiles).toEqual([FILES[1], FILES[2]]);
    expect(r.pending).toEqual([]);
  });
});

describe("versionOf", () => {
  it("takes the 14-digit prefix", () => {
    expect(versionOf("20260909100000_sales_command_stats_fix.sql")).toBe(A);
  });

  it("returns null for a file that is not named version-first", () => {
    expect(versionOf("rota.sql")).toBeNull();
    expect(versionOf("2026_short.sql")).toBeNull();
  });

  it("requires the underscore, so it agrees with the repo's naming rule exactly", () => {
    // `migrationDrift.test.ts` enforces `^\d{14}_.*\.sql$` on every migration. If this accepted
    // `20260909121500.sql` the two checks would disagree about what counts as a migration, and
    // the manifest would gain a name the collision guard does not police. Found by mutation —
    // no fixture had 14 digits followed by anything but an underscore.
    expect(versionOf("20260909121500.sql")).toBeNull();
    expect(versionOf("20260909121500-notify.sql")).toBeNull();
    expect(versionOf("20260909121500_notify.sql")).toBe("20260909121500");
  });
});

describe("diffRemote — what production GAINED", () => {
  it("is the after-set minus the before-set, ascending", () => {
    expect(diffRemote([A], [A, C, B]).applied).toEqual([B, C]);
  });

  it("is empty when nothing changed", () => {
    expect(diffRemote([A, B], [A, B]).applied).toEqual([]);
  });

  it("reports a migration that DISAPPEARED, which cannot happen and must be shouted about", () => {
    // Most likely cause: the two lists came from different databases. Recording anything on the
    // strength of that pair would be guessing.
    expect(diffRemote([A, B], [A]).vanished).toEqual([B]);
  });
});

describe("the manifest is append-only", () => {
  it("keeps every existing line, comments included", () => {
    const before = "# a note\n20260101000000_x.sql\n";
    expect(appendEntries(before, ["20260102000000_y.sql"])).toBe(
      "# a note\n20260101000000_x.sql\n20260102000000_y.sql\n",
    );
  });

  it("adds the missing newline rather than joining two entries on one line", () => {
    expect(appendEntries("20260101000000_x.sql", ["20260102000000_y.sql"])).toBe(
      "20260101000000_x.sql\n20260102000000_y.sql\n",
    );
  });

  it("changes NOTHING when there is nothing to add", () => {
    const before = "20260101000000_x.sql";
    expect(appendEntries(before, [])).toBe(before);
  });

  it("reads entries while ignoring comments and blanks", () => {
    expect(manifestEntries("# c\n\n  20260101000000_x.sql  \n")).toEqual(["20260101000000_x.sql"]);
  });
});

describe("recordApplied — a name is appended IF AND ONLY IF production gained that version", () => {
  const run = (beforeRows: Array<[string, string]>, afterRows: Array<[string, string]>, manifest = "") =>
    recordApplied({
      beforeStdout: boxTable(beforeRows),
      afterStdout: boxTable(afterRows),
      repoFiles: FILES,
      manifestText: manifest,
    });

  it("records the three that applied", () => {
    const r = run(
      [[A, ""], [B, ""], [C, ""]],
      [[A, A], [B, B], [C, C]],
    );
    expect(r.ok).toBe(true);
    expect(r.appliedFiles).toEqual(FILES);
    expect(r.pending).toEqual([]);
  });

  it("A PARTIAL PUSH records exactly what applied, and leaves the rest pending", () => {
    // The case the whole module is shaped around: `db push` applied two, failed on the third.
    // The job will go red on the CLI's own exit code — and these two MUST still be recorded,
    // because an unrecorded applied migration is drift that nothing can see.
    const r = run(
      [[A, ""], [B, ""], [C, ""]],
      [[A, A], [B, B], [C, ""]],
    );
    expect(r.appliedFiles).toEqual([FILES[0], FILES[1]]);
    expect(r.pending).toEqual([FILES[2]]);
  });

  it("records NOTHING when the push applied nothing", () => {
    const r = run([[A, ""]], [[A, ""]]);
    expect(r.appliedFiles).toEqual([]);
    expect(r.manifestText).toBe("");
  });

  it("never records a version that was ALREADY in production before the push", () => {
    // The single most dangerous mistake available here: treating "present in the remote list"
    // as "applied by me". It would append names on every run until the manifest was nonsense.
    const r = run([[A, A]], [[A, A]]);
    expect(r.appliedFiles).toEqual([]);
  });

  it("never appends a name the manifest already has", () => {
    const r = run([[A, ""]], [[A, A]], `${FILES[0]}\n`);
    expect(r.appliedFiles).toEqual([]);
    expect(r.manifestText).toBe(`${FILES[0]}\n`);
  });

  it("FAILS, and records nothing for it, when production has a version with no file here", () => {
    // There is no filename to write. Inventing one, or silently ignoring it, both end with the
    // manifest disagreeing with production.
    const r = recordApplied({
      beforeStdout: boxTable([]),
      afterStdout: boxTable([["", "20260909999999"]]),
      repoFiles: FILES,
      manifestText: "",
    });
    expect(r.ok).toBe(false);
    expect(r.unknownVersions).toEqual(["20260909999999"]);
    expect(r.appliedFiles).toEqual([]);
    expect(r.problems.join(" ")).toContain("20260909999999");
  });

  it("FAILS when the BEFORE capture is empty but the manifest is not — the parser broke", () => {
    // The one failure mode nothing else here can see. Both captures parsing as empty yields a
    // confident "nothing applied", which is precisely what a broken parser produces — and the CLI
    // has changed its table drawing once already. A change in it would not raise; it would report
    // a real five-migration push as a no-op, run after run, while the manifest fell behind.
    const r = recordApplied({
      beforeStdout: "Connecting to remote database...\nsomething the parser cannot read",
      afterStdout: "Connecting to remote database...\nsomething the parser cannot read",
      repoFiles: FILES,
      manifestText: `${FILES[0]}\n`,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/BEFORE capture contains no migration versions/);
  });

  it("does NOT fire that guard on a genuinely empty project with an empty manifest", () => {
    // A fresh database with nothing recorded is a legitimate state — the guard must key on the
    // CONTRADICTION between the two, not on emptiness alone, or the very first run of this
    // workflow against a new project would fail for no reason.
    const r = recordApplied({
      beforeStdout: boxTable([]),
      afterStdout: boxTable([[A, A]]),
      repoFiles: FILES,
      manifestText: "",
    });
    expect(r.ok).toBe(true);
    expect(r.appliedFiles).toEqual([FILES[0]]);
  });

  it("FAILS when a migration vanished between the two lists", () => {
    const r = run([[A, A], [B, B]], [[A, A], [B, ""]]);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/do not un-apply/);
  });

  it("lists as pending exactly the repo files production does not have", () => {
    const r = run([[A, A], [B, ""], [C, ""]], [[A, A], [B, B], [C, ""]]);
    expect(r.pending).toEqual([FILES[2]]);
  });

  it("ignores a repo file that is not named version-first instead of crashing", () => {
    const r = recordApplied({
      beforeStdout: boxTable([]),
      afterStdout: boxTable([[A, A]]),
      repoFiles: [...FILES, "APPLIED_TO_PROD_backup.sql"],
      manifestText: "",
    });
    expect(r.appliedFiles).toEqual([FILES[0]]);
    expect(r.pending).not.toContain("APPLIED_TO_PROD_backup.sql");
  });
});

describe("the job summary a human reads to decide where production is", () => {
  const applied = recordApplied({
    beforeStdout: boxTable([[A, ""], [B, ""]]),
    afterStdout: boxTable([[A, A], [B, ""]]),
    repoFiles: FILES,
    manifestText: "",
  });

  it("names what applied and what is still pending", () => {
    const md = summaryMarkdown(applied, { runUrl: "https://example.test/run/1" });
    expect(md).toContain(FILES[0]);
    expect(md).toContain(FILES[1]);
    expect(md).toContain("Still pending");
    expect(md).toContain("https://example.test/run/1");
  });

  it("says plainly when nothing applied, rather than printing an empty section", () => {
    const nothing = recordApplied({
      beforeStdout: boxTable([[A, A]]),
      afterStdout: boxTable([[A, A]]),
      repoFiles: FILES,
      manifestText: "",
    });
    expect(summaryMarkdown(nothing)).toContain("Nothing applied");
  });

  it("includes the remote list, so the summary is checkable against the database", () => {
    expect(summaryMarkdown(applied)).toContain(A);
  });
});
