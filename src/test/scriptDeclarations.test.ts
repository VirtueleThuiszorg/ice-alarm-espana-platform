// @vitest-environment node
//
// EVERY scripts/*.mjs A TEST IMPORTS MUST HAVE ITS COMPANION .d.mts.
//
// The convention already existed — annotations.d.mts, migrationDrift.d.mts,
// migration-manifest.d.mts — and each of those files says in its own header why: `tsconfig.app.json`
// does not set `allowJs`, so an import without a declaration is an `any`, and every assertion made
// against it becomes a claim about `any`.
//
// Nothing enforced the convention, and on 11 September `scripts/ci/merge-gate-rules.mjs` merged
// without one (#381). That is the worse half of the failure mode rather than the quiet half: with
// `REQUIRED_CHECKS` typed `any`, `it.each(REQUIRED_CHECKS)` could not resolve an overload and the
// whole suite failed to compile, so `Lint, Type Check & Build` went red on main and stayed red.
//
// This is the check that would have caught it on the pull request. It is deliberately about the
// FILE EXISTING rather than about its contents: the sibling declarations keep themselves honest by
// being read field-by-field in their own suites, and a declaration that drifts fails there.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { stripComments } from "./helpers/stripComments";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every `from "…/something.mjs"` in the typed sources, as an absolute path to the .mjs. */
function mjsImports(): Array<{ importer: string; target: string }> {
  const found: Array<{ importer: string; target: string }> = [];
  for (const file of walk(join(ROOT, "src"))) {
    // Comments stripped first: the .d.mts headers and these very comments name .mjs paths in prose,
    // and a regex over the raw text would invent imports out of them.
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/\bfrom\s+["'](\.[^"']*\.mjs)["']/g)) {
      found.push({ importer: file, target: resolve(dirname(file), m[1]) });
    }
  }
  return found;
}

describe("a .mjs imported by typed code carries its own declaration", () => {
  const imports = mjsImports();

  it("finds the imports at all — an empty sweep would pass everything below", () => {
    // The assertion that keeps this suite from becoming decorative if the regex or the layout
    // changes. There are several such imports today and there is no version of this repo with none.
    expect(imports.length).toBeGreaterThanOrEqual(3);
    expect(imports.map((i) => relative(ROOT, i.target))).toContain("scripts/ci/merge-gate-rules.mjs");
  });

  it.each(
    // Deduplicated, and named by repo-relative path so a failure says which file to write.
    [...new Set(imports.map((i) => relative(ROOT, i.target)))].sort()
  )("%s has a .d.mts beside it", (rel) => {
    const decl = join(ROOT, rel.replace(/\.mjs$/, ".d.mts"));
    expect(
      existsSync(decl),
      `${rel} is imported by typed code with no declaration beside it. Without ` +
        `${relative(ROOT, decl)} the import is \`any\`: tsconfig.app.json does not set allowJs. ` +
        `Write it the way scripts/ci/migration-manifest.d.mts is written.`
    ).toBe(true);
  });

  it("the .mjs each declaration describes still exists", () => {
    // The other direction: a declaration left behind after its module was renamed or deleted types
    // nothing and quietly outlives the thing it described.
    // walk() only collects .ts/.tsx, so .d.mts needs its own sweep.
    const sweep = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) sweep(full, out);
        else if (entry.endsWith(".d.mts")) out.push(full);
      }
      return out;
    };
    for (const decl of sweep(join(ROOT, "scripts"))) {
      const mjs = decl.replace(/\.d\.mts$/, ".mjs");
      expect(existsSync(mjs), `${relative(ROOT, decl)} describes a module that is gone`).toBe(true);
    }
  });
});
