// @vitest-environment node
//
// The control for the failure that cost six weeks: production sat 24 migrations behind main, and
// the drift was discoverable only when a query failed against a column that did not exist.
//
// THE RULE HAS TWO HALVES, and this file is written around the difference:
//
//   ON MAIN            any pending migration FAILS. There is no PR to attribute it to; every
//                      pending migration on main is unapplied production drift, and the red X is
//                      the standing alarm.
//   ON A PULL REQUEST  STACKING fails — adding a migration while an earlier one is still
//                      pending. Adding NONE passes, with a warning naming what is pending.
//
// The second half changed on 2026-09-08 and these assertions changed with it. It used to fail
// every PR while anything was pending: one unapplied migration on main turned every open PR red
// — a docs-only change, a validation fix, a test — and none of them could clear it, because
// clearing it means `supabase db push` plus a manifest line that no PR can carry. The gate had
// stopped saying "do not stack another migration" and started saying "nobody may merge
// anything". It also runs BEFORE typecheck and build in the same job, so those reported
// `skipped` and no PR had a typecheck signal for as long as the drift stood.
//
// So the assertion that used to read "FAILS when a PR adds nothing but main has already drifted"
// now reads WARNS, and a new one holds the strict half on main. What did NOT change is stacking:
// one pending migration is a normal in-flight change, two means the first was never pushed, and
// that is exactly how twenty-four accumulate.
//
// Written negative-first: the assertions that matter most are the ones that FAIL.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { computeDrift, parseManifest, resolveContext } from "../../scripts/migrationDrift.mjs";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const MANIFEST = join(MIGRATIONS_DIR, "APPLIED_TO_PROD.txt");

const A = "20260101000000_a.sql";
const B = "20260102000000_b.sql";
const C = "20260103000000_c.sql";

/** A pull request. `onMain` is required, so every case has to say which half it is testing. */
const pr = (i: { repoMigrations: string[]; applied: string[]; addedByPr: string[] }) =>
  computeDrift({ ...i, onMain: false });

/** Main. Nothing is ever "added by" main — there is no base to diff it against. */
const main = (i: { repoMigrations: string[]; applied: string[] }) =>
  computeDrift({ ...i, addedByPr: [], onMain: true });

describe("on a pull request — STACKING is the failure", () => {
  it("FAILS when a PR adds a migration while an earlier one is unapplied", () => {
    const r = pr({ repoMigrations: [A, B, C], applied: [A], addedByPr: [C] });
    expect(r.ok).toBe(false);
    expect(r.preExistingPending).toEqual([B]);
    expect(r.warning).toBe("");
    // The message must name BOTH the blocking migration and what this PR is stacking on it, or
    // nobody knows what to push or what to hold back.
    expect(r.reason).toContain(B);
    expect(r.reason).toContain(C);
    expect(r.reason).toMatch(/already pending/);
  });

  it("FAILS on several pre-existing pending migrations, and names them all", () => {
    const r = pr({ repoMigrations: [A, B, C], applied: [], addedByPr: [C] });
    expect(r.ok).toBe(false);
    expect(r.preExistingPending).toEqual([A, B]);
    for (const m of [A, B]) expect(r.reason).toContain(m);
  });

  it("PASSES an ordinary schema PR — one new migration, nothing else pending", () => {
    // If this failed, the gate would be turned off within a week.
    const r = pr({ repoMigrations: [A, B, C], applied: [A, B], addedByPr: [C] });
    expect(r.ok).toBe(true);
    expect(r.pending).toEqual([C]);
    expect(r.preExistingPending).toEqual([]);
    expect(r.warning).toBe("");
  });

  it("PASSES a PR adding several migrations at once, if nothing else is pending", () => {
    const r = pr({ repoMigrations: [A, B, C], applied: [A], addedByPr: [B, C] });
    expect(r.ok).toBe(true);
    expect(r.preExistingPending).toEqual([]);
    expect(r.warning).toBe("");
  });
});

describe("on a pull request that adds NO migration — passes, and says so", () => {
  it("PASSES with a WARNING when main has drifted and this PR adds nothing", () => {
    // The case that turned a schema rule into a merge freeze. This PR cannot clear the drift:
    // only `supabase db push` plus a manifest line can, and neither fits in a pull request.
    const r = pr({ repoMigrations: [A, B], applied: [A], addedByPr: [] });
    expect(r.ok).toBe(true);
    expect(r.preExistingPending).toEqual([B]);
    expect(r.warning).not.toBe("");
    // A warning that does not name the file is a warning nobody can act on.
    expect(r.warning).toContain(B);
    expect(r.warning).toContain("supabase db push");
    // And it says why this PR is not the one to fix it, so the reader stops looking at the diff.
    expect(r.reason).toMatch(/adds no migration/);
  });

  it("the warning says a migration-adding PR WILL still fail — the rule is not switched off", () => {
    const r = pr({ repoMigrations: [A, B], applied: [A], addedByPr: [] });
    expect(r.warning).toMatch(/DOES add a migration will fail/);
  });

  it("names EVERY pending migration in the warning, not just the first", () => {
    const r = pr({ repoMigrations: [A, B, C], applied: [], addedByPr: [] });
    expect(r.ok).toBe(true);
    for (const m of [A, B, C]) expect(r.warning).toContain(m);
  });

  it("PASSES with NO warning when production is level", () => {
    const r = pr({ repoMigrations: [A, B], applied: [A, B], addedByPr: [] });
    expect(r.ok).toBe(true);
    expect(r.warning).toBe("");
    expect(r.pending).toEqual([]);
  });
});

describe("on main — any pending migration is a failure", () => {
  it("FAILS when a migration on main is not applied to production", () => {
    // The same input that WARNS on a PR. The difference is the whole point of the two halves:
    // on a PR it is somebody else's migration, on main it is nobody's but the team's.
    const r = main({ repoMigrations: [A, B], applied: [A] });
    expect(r.ok).toBe(false);
    expect(r.pending).toEqual([B]);
    expect(r.reason).toContain(B);
    expect(r.reason).toMatch(/on main are NOT applied/);
    expect(r.warning).toBe("");
  });

  it("FAILS on several, and names them all", () => {
    const r = main({ repoMigrations: [A, B, C], applied: [] });
    expect(r.ok).toBe(false);
    expect(r.pending).toEqual([A, B, C]);
    for (const m of [A, B, C]) expect(r.reason).toContain(m);
  });

  it("does NOT let a migration off because main cannot have 'added' it", () => {
    // On main `addedByPr` is empty by construction, so the PR half would read every pending
    // migration as pre-existing-and-innocent and pass with a warning. That is exactly the
    // mistake this half exists to prevent: main is where drift has to be loud.
    const asPr = pr({ repoMigrations: [A, B], applied: [A], addedByPr: [] });
    const asMain = main({ repoMigrations: [A, B], applied: [A] });
    expect(asPr.ok).toBe(true);
    expect(asMain.ok).toBe(false);
  });

  it("PASSES on main when production is level with the repo", () => {
    const r = main({ repoMigrations: [A, B], applied: [A, B] });
    expect(r.ok).toBe(true);
    expect(r.warning).toBe("");
    expect(r.reason).toMatch(/level with the repo/);
  });

  it("PASSES an empty repo and an empty manifest", () => {
    expect(main({ repoMigrations: [], applied: [] }).ok).toBe(true);
  });
});

describe("a phantom manifest entry fails in BOTH contexts", () => {
  it("FAILS on a PR when the manifest claims a migration the repo does not have", () => {
    // A different failure from drift: production may hold a change no file describes.
    const r = pr({ repoMigrations: [A], applied: [A, B], addedByPr: [] });
    expect(r.ok).toBe(false);
    expect(r.phantom).toEqual([B]);
    expect(r.reason).toMatch(/do not exist in the repo/);
    expect(r.warning).toBe("");
  });

  it("FAILS on main too", () => {
    const r = main({ repoMigrations: [A], applied: [A, B] });
    expect(r.ok).toBe(false);
    expect(r.phantom).toEqual([B]);
  });

  it("is reported ahead of drift — it is the worse of the two", () => {
    const r = pr({ repoMigrations: [A, C], applied: [A, B], addedByPr: [C] });
    expect(r.ok).toBe(false);
    expect(r.phantom).toEqual([B]);
    expect(r.reason).toMatch(/no file describes/);
  });

  it("is reported ahead of drift on an innocent PR too — never downgraded to a warning", () => {
    const r = pr({ repoMigrations: [A, C], applied: [A, B], addedByPr: [] });
    expect(r.ok).toBe(false);
    expect(r.warning).toBe("");
  });
});

describe("which half applies — resolveContext", () => {
  it("an explicit --pr wins", () => {
    expect(resolveContext(["origin/main", "--pr"]).onMain).toBe(false);
  });

  it("an explicit --main wins", () => {
    expect(resolveContext(["origin/main", "--main"]).onMain).toBe(true);
  });

  it("--pr beats --main if somebody passes both, and says which it took", () => {
    // Not arbitrary: the CLI builds the flag from one ternary, so both can only arrive by
    // hand-editing the workflow, and the looser reading of an ambiguous instruction is the one
    // that does not silently mark a branch as main.
    const r = resolveContext(["--main", "--pr"]);
    expect(r.onMain).toBe(false);
    expect(r.how).toBe("--pr");
  });

  it("without a flag, identical base and head revs mean main", () => {
    const r = resolveContext([], { base: "abc123", head: "abc123" });
    expect(r.onMain).toBe(true);
    expect(r.how).toMatch(/HEAD is the base ref/);
  });

  it("without a flag, a head ahead of the base means a branch", () => {
    const r = resolveContext([], { base: "abc123", head: "def456" });
    expect(r.onMain).toBe(false);
  });

  it("with nothing to go on, defaults to the STRICT half", () => {
    // A PR misread as main gets a red X somebody investigates. Main misread as a PR gets a
    // warning nobody acts on, which is how drift accumulated in the first place.
    const r = resolveContext([]);
    expect(r.onMain).toBe(true);
    expect(r.how).toMatch(/strict/);
  });
});

describe("the manifest parser", () => {
  it("ignores comments, blank lines and surrounding whitespace", () => {
    expect(parseManifest("# a comment\n\n  20260101000000_a.sql  \n\n# another\n")).toEqual([A]);
  });

  it("does not treat a commented-out migration as applied", () => {
    // Commenting out a line is the obvious way to silence the gate; it must instead make the
    // migration count as pending, which is the strict direction.
    expect(parseManifest(`${A}\n# ${B}\n`)).toEqual([A]);
  });
});

describe("the real repo state", () => {
  const repoMigrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const applied = parseManifest(readFileSync(MANIFEST, "utf8"));

  it("the manifest exists and is not empty", () => {
    expect(applied.length).toBeGreaterThan(0);
  });

  it("the manifest names no migration that is absent from the repo", () => {
    const repoSet = new Set(repoMigrations);
    expect(applied.filter((m) => !repoSet.has(m))).toEqual([]);
  });

  it("every manifest entry looks like a migration filename", () => {
    for (const m of applied) expect(m).toMatch(/^\d{14}_.*\.sql$/);
  });

  it("the manifest has no duplicate entries", () => {
    expect(applied.length).toBe(new Set(applied).size);
  });
});

describe("the gate is wired into CI the way this module expects", () => {
  const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const cli = readFileSync(join(ROOT, "scripts/check-migration-drift.mjs"), "utf8");

  it("CI runs the gate at all — a check no workflow runs is a check that does not exist", () => {
    expect(ci).toContain("check-migration-drift.mjs");
  });

  it("CI passes the context flag, so the two halves are actually distinguishable", () => {
    // Without this the gate reads every push to main as "a branch that added nothing" and
    // main's drift becomes a warning nobody sees.
    expect(ci).toMatch(/github\.event_name == 'pull_request' && '--pr' \|\| '--main'/);
  });

  it("the gate step is NOT continue-on-error — the warning path exits 0 on its own", () => {
    // A step that cannot fail is not a gate. The distinction between pass-with-warning and fail
    // lives in the script's exit code, not in the workflow relaxing the step.
    const step = ci.slice(ci.indexOf("- name: Migration drift gate"));
    const nextStep = step.indexOf("      - name:", 10);
    expect(step.slice(0, nextStep)).not.toContain("continue-on-error");
  });

  it("the declaration file exists, so the tests are type-checked against the rule", () => {
    // Without it, `tsconfig.app.json` (no allowJs) sees the .mjs import as `any` and every
    // assertion below becomes a claim about an untyped object.
    const decl = readFileSync(join(ROOT, "scripts/migrationDrift.d.mts"), "utf8");
    for (const field of ["ok", "pending", "preExistingPending", "phantom", "reason", "warning"]) {
      expect(decl, `DriftResult.${field} is undeclared`).toContain(field);
    }
    expect(decl).toContain("onMain");
  });

  it("the CLI IMPORTS the rule rather than re-implementing it", () => {
    // It used to do both: this module for the tests, and a hand-written copy of the same
    // comparisons in the CLI — the copy that actually ran in CI, and the one no test ever saw.
    expect(cli).toMatch(/import \{[^}]*computeDrift[^}]*\} from "\.\/migrationDrift\.mjs"/s);
    expect(cli).not.toContain("filter((m) => !appliedSet.has(m))");
  });

  it("the CLI emits a GitHub annotation for both outcomes, not just the failure", () => {
    // A warning that only appears in the log is a warning nobody reads: the annotation puts it
    // on the Checks tab, and the step summary puts it at the top of the job.
    expect(cli).toContain("::${level} title=");
    expect(cli).toContain("GITHUB_STEP_SUMMARY");
    expect(cli).toMatch(/annotate\("warning"/);
    expect(cli).toMatch(/annotate\("error"/);
  });

  it("the CLI exits 0 on the warning path and 1 on the failure path", () => {
    const warnBlock = cli.slice(cli.indexOf("if (result.warning)"));
    expect(warnBlock).toContain("process.exit(0)");
    const failBlock = cli.slice(cli.indexOf("if (!result.ok)"), cli.indexOf("if (result.warning)"));
    expect(failBlock).toContain("process.exit(1)");
  });
});
