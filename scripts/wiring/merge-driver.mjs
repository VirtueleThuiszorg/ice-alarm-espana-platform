#!/usr/bin/env node
/**
 * THE MERGE DRIVER FOR WIRING_REGISTER.md — regenerate, never reconcile.
 *
 * ── WHY THIS EXISTS AND `-merge` DID NOT ────────────────────────────────────
 *
 * `.gitattributes` used to say `WIRING_REGISTER.md -merge`, which makes git refuse to merge the
 * file and raise a conflict instead. The reasoning was written down at the time: "a conflict is
 * what makes somebody run the generator."
 *
 * It does not. The file has been hand-merged TWICE THIS WEEK with that setting in place — the
 * conflict arrives, somebody picks a side or splices the two, and a register that describes
 * neither branch lands on main. A rule that depends on the person holding the conflict doing the
 * right thing is a rule that fails at exactly the moment it matters, which is late on a day with
 * four branches in flight.
 *
 * So the conflict is removed rather than relied upon. For a GENERATED file there is nothing to
 * reconcile: every byte comes from the code plus `annotations.mjs`. The only correct resolution
 * was always `node scripts/wiring/build.mjs`, and this runs it.
 *
 * ── WHAT GIT HANDS US ───────────────────────────────────────────────────────
 *
 * `%A` is the path holding the CURRENT side's content, and it is also where the result must be
 * written. `%O` (ancestor) and `%B` (other side) are ignored on purpose: their content is two
 * stale renderings of a file we are about to derive from scratch, and reading either is how a
 * "merge" of a generated file starts creeping back in.
 *
 * Exit 0 means merged cleanly. Exit non-zero raises the conflict — which is what we want if the
 * generator itself cannot run, because a silently half-written register is worse than a conflict
 * somebody has to look at.
 *
 * ── THE HONEST LIMIT ────────────────────────────────────────────────────────
 *
 * This regenerates from the WORKING TREE, which during a merge holds the merged sources for
 * every path git has already written. That is the right input, and it is also why the result is
 * not guaranteed byte-identical to what a post-merge `build.mjs` produces if git writes this
 * path before some source file. It does not matter: the failure mode this removes is the
 * catastrophic one — two interleaved blocks, a duplicated row, a fixed defect still described as
 * live. Whatever this writes is generator output for SOME consistent state, never a splice of
 * two. The `Wiring register` CI check and the self-heal step on main close the remainder.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const target = process.argv[2];

if (!target) {
  console.error("wiring merge driver: no %A path given; check merge.regen.driver in git config");
  process.exit(2);
}

try {
  // build.mjs writes WIRING_REGISTER.md at the repo root. Run it there, then copy onto %A —
  // which during a merge is a temp file, not the register itself.
  execFileSync(process.execPath, [join(here, "build.mjs")], { cwd: repo, stdio: "pipe" });
  const generated = join(repo, "WIRING_REGISTER.md");
  if (!existsSync(generated)) {
    console.error("wiring merge driver: build.mjs did not produce WIRING_REGISTER.md");
    process.exit(3);
  }
  copyFileSync(generated, target);
  process.exit(0);
} catch (err) {
  console.error(
    "wiring merge driver: could not regenerate the register, leaving the conflict for a human.\n" +
      String(err instanceof Error ? err.message : err),
  );
  process.exit(1);
}
