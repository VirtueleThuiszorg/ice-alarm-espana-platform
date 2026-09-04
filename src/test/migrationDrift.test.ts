// @vitest-environment node
//
// The control for the failure that cost six weeks: production sat 24 migrations behind main,
// and the drift was discoverable only when a query failed against a column that did not exist.
//
// The rule is NOT "fail any PR that adds a migration" — that blocks every ordinary schema
// change and gets switched off within a week. It is "not while an EARLIER one is still
// unapplied": one pending migration is a normal in-flight change; two means the first was never
// pushed, and that is exactly how twenty-four accumulate, each PR individually reasonable.
//
// Written negative-first: the assertions that matter are the ones that FAIL a pull request.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { computeDrift, parseManifest } from "../../scripts/migrationDrift";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const MANIFEST = join(MIGRATIONS_DIR, "APPLIED_TO_PROD.txt");

const A = "20260101000000_a.sql";
const B = "20260102000000_b.sql";
const C = "20260103000000_c.sql";

describe("migration drift — what FAILS a pull request", () => {
  it("FAILS when a PR adds a migration while an earlier one is unapplied", () => {
    const r = computeDrift({ repoMigrations: [A, B, C], applied: [A], addedByPr: [C] });
    expect(r.ok).toBe(false);
    expect(r.preExistingPending).toEqual([B]);
    expect(r.reason).toMatch(/NOT applied to production/);
    // The message must name the offending file, or nobody knows what to push.
    expect(r.reason).toContain(B);
  });

  it("FAILS when a PR adds nothing but main has already drifted", () => {
    // The steady-state alarm: drift does not become acceptable just because this PR is innocent.
    const r = computeDrift({ repoMigrations: [A, B], applied: [A], addedByPr: [] });
    expect(r.ok).toBe(false);
    expect(r.preExistingPending).toEqual([B]);
  });

  it("FAILS on more than one pre-existing pending migration, and names them all", () => {
    const r = computeDrift({ repoMigrations: [A, B, C], applied: [], addedByPr: [] });
    expect(r.ok).toBe(false);
    expect(r.preExistingPending).toEqual([A, B, C]);
    for (const m of [A, B, C]) expect(r.reason).toContain(m);
  });

  it("FAILS when the manifest claims a migration the repo does not have", () => {
    // A different failure from drift: production may hold a change no file describes.
    const r = computeDrift({ repoMigrations: [A], applied: [A, B], addedByPr: [] });
    expect(r.ok).toBe(false);
    expect(r.phantom).toEqual([B]);
    expect(r.reason).toMatch(/do not exist in the repo/);
  });

  it("reports phantom entries even when drift is also present — the worse one first", () => {
    const r = computeDrift({ repoMigrations: [A, C], applied: [A, B], addedByPr: [] });
    expect(r.ok).toBe(false);
    expect(r.phantom).toEqual([B]);
    expect(r.reason).toMatch(/no file describes/);
  });
});

describe("migration drift — what PASSES, so the gate survives contact with real work", () => {
  it("PASSES when production is level with the repo", () => {
    const r = computeDrift({ repoMigrations: [A, B], applied: [A, B], addedByPr: [] });
    expect(r.ok).toBe(true);
    expect(r.pending).toEqual([]);
  });

  it("PASSES an ordinary schema PR — one new migration, nothing else pending", () => {
    // If this failed, the gate would be turned off within a week.
    const r = computeDrift({ repoMigrations: [A, B, C], applied: [A, B], addedByPr: [C] });
    expect(r.ok).toBe(true);
    expect(r.pending).toEqual([C]);
    expect(r.preExistingPending).toEqual([]);
  });

  it("PASSES a PR adding several migrations at once, if nothing else is pending", () => {
    const r = computeDrift({ repoMigrations: [A, B, C], applied: [A], addedByPr: [B, C] });
    expect(r.ok).toBe(true);
    expect(r.preExistingPending).toEqual([]);
  });

  it("PASSES an empty repo and an empty manifest", () => {
    expect(computeDrift({ repoMigrations: [], applied: [], addedByPr: [] }).ok).toBe(true);
  });
});

describe("migration drift — the manifest parser", () => {
  it("ignores comments, blank lines and surrounding whitespace", () => {
    expect(parseManifest("# a comment\n\n  20260101000000_a.sql  \n\n# another\n")).toEqual([A]);
  });

  it("does not treat a commented-out migration as applied", () => {
    // Commenting out a line is the obvious way to silence the gate; it must instead make the
    // migration count as pending, which is the strict direction.
    expect(parseManifest(`${A}\n# ${B}\n`)).toEqual([A]);
  });
});

describe("migration drift — the real repo state", () => {
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

  it("the gate is wired into CI, not just present in the repo", () => {
    // A check that no workflow runs is a check that does not exist.
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("check-migration-drift.mjs");
  });
});
