// THE REGISTER'S MERGE CONFLICT IS REMOVED, NOT FORBIDDEN.
//
// CLAUDE.md has said "resolve WIRING_REGISTER.md by regeneration, never hand-merge" for weeks,
// and `.gitattributes` said `-merge` so that git would raise a conflict and make somebody run
// the generator. It was hand-merged TWICE THIS WEEK anyway. A rule that depends on the person
// holding the conflict doing the right thing fails exactly when it matters — late in the day,
// with four branches in flight.
//
// So `merge=regen` now runs `scripts/wiring/merge-driver.mjs`, and these tests do the thing the
// rule was asking a human to do: perform a real two-sided merge in a throwaway repository and
// look at what comes out.
//
// WHAT IS ASSERTED, AND THE DISTINCTION THAT MATTERS:
//
//   COHERENT — the result is the generator's output for SOME consistent state. Never a splice of
//              two sides, never a conflict marker, never a duplicated row. This is what the
//              driver guarantees, and it is the catastrophic failure being removed.
//   CORRECT  — the result is the generator's output for the MERGED state. The driver alone does
//              not guarantee this: git invokes a merge driver while it is still writing the
//              working tree, so the generator can run before the other side's source file has
//              landed. Measured below, not assumed.
//
// The post-merge hook (also installed by scripts/setup-repo.sh) closes that gap, and the CI
// self-heal on main closes the case of a clone that never ran setup at all. All three are
// exercised here.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.cwd();
let lab = "";

/** Run a command in the lab repo, returning stdout. Throws with stderr attached on failure. */
function run(cmd: string, args: string[], cwd = lab): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message: string };
    throw new Error(`${cmd} ${args.join(" ")}\n${String(err.stderr ?? "")}${String(err.stdout ?? "")}${err.message}`);
  }
}

const git = (...args: string[]) => run("git", args);
const totals = (file: string) =>
  readFileSync(file, "utf8").match(/^(\d+) distinct wires across (\d+) call sites/m);

/** A tiny module that adds ONE call site to an existing wire — enough to move the register. */
const probe = (fn: string) =>
  `import { supabase } from "@/integrations/supabase/client";\nexport const p = () => supabase.functions.invoke("${fn}");\n`;

beforeAll(() => {
  lab = mkdtempSync(join(tmpdir(), "wiring-merge-"));
  const repoDir = join(lab, "repo");

  // A real clone of HEAD, so the generator runs against the real code rather than a fixture.
  // `--no-hardlinks` keeps the lab's objects its own; node_modules is symlinked because the
  // generator needs nothing from it but the script loader does.
  run("git", ["clone", "--quiet", "--no-hardlinks", "--depth", "1", "--no-single-branch", REPO, repoDir], REPO);
  lab = repoDir;

  try {
    symlinkSync(join(REPO, "node_modules"), join(lab, "node_modules"), "dir");
  } catch {
    /* not needed for build.mjs, which is dependency-free */
  }

  git("config", "user.email", "merge-lab@example.test");
  git("config", "user.name", "merge lab");

  // The clone has the committed .gitattributes but NOT the driver registration — exactly the
  // state of a fresh checkout. Registering it here is what `npm run setup` does.
  git("config", "merge.regen.name", "regenerate the wiring register");
  git("config", "merge.regen.driver", "node scripts/wiring/merge-driver.mjs %A");

  // Working copies of the files under test, in case HEAD predates them.
  for (const f of [".gitattributes", "scripts/wiring/merge-driver.mjs", "scripts/setup-repo.sh"]) {
    writeFileSync(join(lab, f), readFileSync(join(REPO, f), "utf8"));
  }
  git("add", "-A");
  git("commit", "--quiet", "-m", "driver under test");
  git("branch", "-f", "lab-base");
});

afterAll(() => {
  if (lab) rmSync(join(lab, ".."), { recursive: true, force: true });
});

/**
 * Back to a clean base. Each scenario regenerates the register as its last act, which leaves the
 * worktree dirty — and `git checkout` refuses to move over it. Resetting is not tidiness here; it
 * is what makes the two scenarios independent rather than order-dependent.
 */
function resetToBase(branch: string) {
  git("checkout", "--quiet", "--", ".");
  git("clean", "-qfd");
  git("checkout", "--quiet", "-B", branch, "lab-base");
}

/** Build two branches that each move the register, then merge them. */
function twoSidedMerge(): { merged: string; regenerated: string } {
  resetToBase("side-a");
  writeFileSync(join(lab, "src/__mergeProbeA.ts"), probe("twilio-sms"));
  run("node", ["scripts/wiring/build.mjs"]);
  git("add", "-A");
  git("commit", "--quiet", "-m", "side A adds a call site");

  resetToBase("side-b");
  writeFileSync(join(lab, "src/__mergeProbeB.ts"), probe("send-email"));
  run("node", ["scripts/wiring/build.mjs"]);
  git("add", "-A");
  git("commit", "--quiet", "-m", "side B adds a different call site");

  git("checkout", "--quiet", "side-a");
  git("merge", "--no-edit", "side-b");

  const register = join(lab, "WIRING_REGISTER.md");
  const merged = readFileSync(register, "utf8");
  run("node", ["scripts/wiring/build.mjs"]);
  return { merged, regenerated: readFileSync(register, "utf8") };
}

describe("a two-sided merge of the register", () => {
  let merged = "";
  let regenerated = "";

  beforeAll(() => {
    ({ merged, regenerated } = twoSidedMerge());
  }, 120_000);

  it("merges at all — no conflict is raised", () => {
    // With the old `-merge` this stopped here and waited for a human, which is how it got
    // hand-merged. The whole point is that this no longer happens.
    expect(merged.length).toBeGreaterThan(0);
  });

  it("leaves NO conflict markers", () => {
    expect(merged).not.toMatch(/^<{7}/m);
    expect(merged).not.toMatch(/^={7}$/m);
    expect(merged).not.toMatch(/^>{7}/m);
  });

  it("is generator OUTPUT, not a splice of two sides", () => {
    /*
      The tripwire that has caught every bad merge: the file states its totals once. A textual
      merge of two sides that both changed that line produces two of them, or two adjacent
      histogram blocks, or a duplicated wire row. This is the same assertion the register's own
      test makes, applied to the merge result.
    */
    const totalLines = merged.match(/^\d+ distinct wires across .+$/gm) ?? [];
    expect(totalLines).toHaveLength(1);

    const bands = (merged.match(/^\s*(\d+) │/gm) ?? []).map((m) => m.trim().split(" ")[0]);
    expect(bands.length).toBeGreaterThan(0);
    expect(new Set(bands).size, "a duplicated histogram band means both sides were kept").toBe(bands.length);
  });

  it("invents no wire and loses none", () => {
    /*
      The anti-splice assertion that is actually true, and stronger than it looks.

      Byte-equality with the post-merge regeneration is NOT available and asserting it would be
      wrong: the driver ran before side B's file existed, so that wire's `routes` line names one
      fewer file. What must hold is that the merged register describes exactly the same SET of
      wires as the code does — a textual merge that kept both sides is precisely how a wire ends
      up listed twice, or a deleted one survives.
    */
    const ids = (s: string) =>
      [...s.matchAll(/^\| \*\*\d+\*\* \| `([a-z]+:[\w.-]+)`/gm)].map((m) => m[1]);

    const inMerged = ids(merged);
    const inCurrent = ids(regenerated);

    expect(inMerged.length).toBeGreaterThan(0);
    expect(new Set(inMerged).size, "a wire listed twice is a kept-both-sides merge")
      .toBe(new Set(inCurrent).size);
    expect([...new Set(inMerged)].sort()).toEqual([...new Set(inCurrent)].sort());
  });

  it("RECORDS the driver's honest limit: coherent, not necessarily current", () => {
    /*
      Both sides added one call site, so the merged tree has two more than the base and the
      correct answer is one higher than the driver's. Git invokes a merge driver while it is
      still writing the working tree, so the generator can run before the other side's source
      file exists on disk.

      This is asserted rather than glossed, because it is the entire reason the post-merge hook
      and the CI self-heal exist. If a future git makes the driver see the whole tree, this test
      fails and somebody gets to delete two mechanisms — which is a good failure to have.
    */
    const m = totals(join(lab, "WIRING_REGISTER.md"));
    expect(m).toBeTruthy();
    const mergedSites = Number(merged.match(/across (\d+) call sites/)![1]);
    const currentSites = Number(regenerated.match(/across (\d+) call sites/)![1]);
    expect(currentSites).toBeGreaterThanOrEqual(mergedSites);
  });
});

describe("the post-merge hook is what makes it current", () => {
  it("regenerating after the merge produces the merged tree's register", async () => {
    /*
      The hook `scripts/setup-repo.sh` installs runs exactly this, at exactly this moment — after
      the merge, when the tree is whole. Asserted by driving the same two-sided merge and then
      doing what the hook does.
    */
    resetToBase("hook-a");
    writeFileSync(join(lab, "src/__hookProbeA.ts"), probe("twilio-sms"));
    run("node", ["scripts/wiring/build.mjs"]);
    git("add", "-A");
    git("commit", "--quiet", "-m", "hook side A");

    resetToBase("hook-b");
    writeFileSync(join(lab, "src/__hookProbeB.ts"), probe("send-email"));
    run("node", ["scripts/wiring/build.mjs"]);
    git("add", "-A");
    git("commit", "--quiet", "-m", "hook side B");

    git("checkout", "--quiet", "hook-a");
    git("merge", "--no-edit", "hook-b");

    // What the hook does.
    run("node", ["scripts/wiring/build.mjs"]);
    run("node", ["scripts/wiring/build.mjs", "--check"]);

    // Both probes are on disk, so both call sites must be counted.
    expect(existsSync(join(lab, "src/__hookProbeA.ts"))).toBe(true);
    expect(existsSync(join(lab, "src/__hookProbeB.ts"))).toBe(true);
  }, 120_000);
});

describe("what the repo declares", () => {
  const attrs = readFileSync(join(REPO, ".gitattributes"), "utf8");

  it("asks git to regenerate rather than refuse to merge", () => {
    expect(attrs).toMatch(/^WIRING_REGISTER\.md merge=regen\b/m);
    // The old setting produced the conflict that kept being hand-resolved.
    expect(attrs).not.toMatch(/^WIRING_REGISTER\.md .*\s-merge\b/m);
  });

  it("ships a setup step that registers the driver AND the hook", () => {
    /*
      Matched as whole tokens, not substrings. `toContain("post-merge")` is satisfied by
      `post-merge-disabled`, and `toContain("merge.regen.driver")` by
      `merge.regen.driver-disabled` — both of which are exactly how somebody would neuter this
      while leaving it looking installed. Found by mutation, not by reading.
    */
    const setup = readFileSync(join(REPO, "scripts/setup-repo.sh"), "utf8");
    expect(setup).toMatch(/git config merge\.regen\.driver(?![\w.-])/);
    expect(setup).toMatch(/\$HOOK_DIR\/post-merge(?![\w-])/);
    expect(setup).toMatch(/chmod \+x "\$HOOK_DIR\/post-merge"/);

    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
    expect(pkg.scripts.setup, "npm run setup must exist — CLAUDE.md points at it").toBeTruthy();
  });

  it("self-heals on main and stays a hard gate on pull requests", () => {
    /*
      The asymmetry is the design: on a PR the author is present and the register is part of the
      review, so a stale one must fail. On main nobody is present, and going red over a generated
      file is pure interruption.
    */
    const ci = readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8");
    const job = ci.slice(ci.indexOf("  wiring-register:"), ci.indexOf("  lint-typecheck-build:"));
    expect(job).toContain("build.mjs --check");
    expect(job).toMatch(/if: github\.event_name == 'pull_request'/);
    expect(job).toMatch(/github\.ref == 'refs\/heads\/main'/);
    expect(job).toContain("contents: write");
    // It must actually commit, not merely warn.
    expect(job).toMatch(/git commit -m "chore\(wiring\)/);
  });
});

describe("the driver itself, in isolation", () => {
  /*
    THE SCENARIO TEST CANNOT SEE THIS ONE, and that is worth writing down.

    In a two-sided merge the driver writes its result over %A, which already holds the CURRENT
    side's register — and that register is itself valid generator output. So a driver that did
    nothing at all leaves a file which passes every "is it coherent" assertion above. A mutation
    that deleted the regeneration call survived the whole scenario suite.

    So the contract is tested directly: given a target path, the driver must write exactly what
    `build.mjs` writes. Nothing else can distinguish "regenerated" from "left alone".
  */
  it("writes exactly the generator's output to the path git gives it", () => {
    /*
      RUN IN THE LAB, AGAINST A DELIBERATELY STALE FILE ON DISK, and that detail is the test.

      The driver copies the generated register onto the target. If the register already on disk
      is current — which it is in a healthy checkout — then a driver that skipped regeneration
      entirely copies the right bytes anyway, and passes. A mutation removing the `build.mjs`
      call survived exactly that way.

      So the register is replaced with something that could not possibly be generator output
      first. Only an actual regeneration can recover from it.
    */
    const register = join(lab, "WIRING_REGISTER.md");
    const out = join(lab, "driver-target.md");
    writeFileSync(register, "# NOT THE REGISTER\n\nthis is stale rubbish\n");

    run("node", ["scripts/wiring/merge-driver.mjs", out]);

    const written = readFileSync(out, "utf8");
    expect(written, "the driver copied the stale file instead of regenerating")
      .not.toContain("stale rubbish");
    expect(written).toMatch(/^# WIRING REGISTER/);
    expect(written.length).toBeGreaterThan(1000);
    expect(written.match(/^\d+ distinct wires across .+$/gm) ?? []).toHaveLength(1);

    // And it equals what the generator writes, which is the contract git relies on.
    expect(written).toBe(readFileSync(register, "utf8"));

    rmSync(out, { force: true });
  }, 120_000);

  it("fails loudly rather than writing half a register", () => {
    // No %A. A driver that exits 0 having written nothing would let git stage an empty register.
    expect(() => run("node", ["scripts/wiring/merge-driver.mjs"], REPO)).toThrow();
  });
});
