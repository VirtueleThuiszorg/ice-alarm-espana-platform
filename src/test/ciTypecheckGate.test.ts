/**
 * The CI typecheck gate must actually typecheck something.
 *
 * CLAUDE.md lists typecheck as a gate that must be green to merge, but the step
 * ran `npx tsc --noEmit`, which reads the root tsconfig.json. That file is a
 * project-references stub — `"files": []`, no `include` — so outside of
 * `--build` mode tsc resolves an empty file set, reports nothing and exits 0.
 *
 * The gate was therefore vacuous: `main` accumulated 78 type errors under
 * src/ while CI stayed green, and the errors only surfaced when someone ran
 * the app project directly. These tests pin the fix so the gate cannot quietly
 * go back to checking nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ciRaw = read(".github/workflows/ci.yml");
// Strip YAML comments: the step carries an explanatory comment that quotes
// the bad command verbatim, and that must not count as the gate using it.
const ci = ciRaw
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");
const rootTsconfig = JSON.parse(read("tsconfig.json").replace(/^\s*\/\/.*$/gm, ""));

describe("CI typecheck gate covers the real projects", () => {
  it("typechecks the app project, which is the one holding src/", () => {
    expect(ci).toMatch(/tsc\s+-p\s+tsconfig\.app\.json\s+--noEmit/);
  });

  it("typechecks the node project too", () => {
    expect(ci).toMatch(/tsc\s+-p\s+tsconfig\.node\.json\s+--noEmit/);
  });

  it("does not rely on a bare `tsc --noEmit`, which checks an empty file set", () => {
    // Any `tsc --noEmit` with no -p/--project and no --build reads the root
    // stub and passes unconditionally.
    const bare = /tsc(?!\s+(?:-p|--project|--build))\s+--noEmit/;
    expect(ci).not.toMatch(bare);
  });
});

describe("the root tsconfig is a references stub, so it cannot be the gate", () => {
  it("declares no files of its own", () => {
    // If this ever stops being true the reasoning above needs revisiting, but
    // a bare `tsc --noEmit` still would not honour the referenced projects.
    expect(rootTsconfig.files).toEqual([]);
    expect(rootTsconfig.include).toBeUndefined();
  });

  it("references both projects the gate runs", () => {
    const paths = (rootTsconfig.references ?? []).map((r: { path: string }) => r.path);
    expect(paths).toContain("./tsconfig.app.json");
    expect(paths).toContain("./tsconfig.node.json");
  });
});
