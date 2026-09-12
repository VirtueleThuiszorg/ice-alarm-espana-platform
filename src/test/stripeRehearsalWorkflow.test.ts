// @vitest-environment node
//
// ═══ THE WORKFLOW THAT HOLDS LEE'S STRIPE KEY ════════════════════════════════
//
// The whole point of running the rehearsal in CI is that the key never leaves GitHub. That makes
// this workflow file the thing standing between a test-mode secret and a public log, so the
// properties below are asserted rather than reviewed.
//
// TWO OF THEM WOULD BE SILENT IF THEY BROKE, which is why they are here and not in a checklist:
//
//   `set -o pipefail`   every rehearsal step pipes through `tee` to get the output into both the
//                       log and the artifact. A pipeline's exit code is its LAST command's, so
//                       without pipefail `tee` returns 0 and a FAILED REHEARSAL REPORTS GREEN.
//                       That is the exact shape CLAUDE.md's merge rules name: a check that
//                       cannot fail is not a check.
//
//   the key in a URL    interpolating a secret into a URL puts it in the log, in the artifact,
//                       and in any error message that echoes the request. GitHub masks a secret
//                       it recognises in the log, and masks nothing in an uploaded file.
//
// No YAML parser: `yaml` is only a transitive dependency of tailwind here, so importing it would
// make this file's fate depend on tailwind's dependency tree. Same reasoning as ciJobIsolation.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PATH = ".github/workflows/stripe-rehearsal.yml";
const wf = readFileSync(join(process.cwd(), PATH), "utf8");

/** Comments explain the traps; they must not be mistaken for the code that avoids them. */
function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => (/^\s*#/.test(line) ? "" : line))
    .join("\n");
}
const code = stripComments(wf);

/** The body of every `run:` block, so a property can be asserted of each one separately. */
function runBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\s*)run: \|/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() !== "" && (line.length - line.trimStart().length) <= indent) break;
      body.push(line);
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

describe("it only ever runs when somebody asks", () => {
  // Every run creates real objects in the Stripe test account. On push it would fill the account
  // with clocks nobody asked for, and it is not a merge gate — main does not wait on Stripe.
  it("is workflow_dispatch and nothing else", () => {
    expect(code).toMatch(/^on:\s*$/m);
    expect(code).toMatch(/workflow_dispatch:/);
    expect(code).not.toMatch(/^\s{2}push:/m);
    expect(code).not.toMatch(/^\s{2}pull_request:/m);
    expect(code).not.toMatch(/^\s{2}schedule:/m);
  });

  it("takes the amount and the day, with the defaults Lee asked for", () => {
    expect(code).toMatch(/amount:/);
    expect(code).toMatch(/default: "2499"/);
    expect(code).toMatch(/day:/);
    expect(code).toMatch(/default: "15"/);
  });

  it("reads nothing it does not need", () => {
    expect(code).toMatch(/permissions:\s*\n\s*contents: read/);
  });
});

describe("the key", () => {
  it("fails the job when the secret is absent, rather than skipping", () => {
    expect(code).toMatch(/node scripts\/ci\/require-secrets\.mjs STRIPE_TEST_KEY/);
  });

  it("refuses a key that is not a test key, before any API call", () => {
    expect(code).toMatch(/sk_test_\*\)/);
    expect(code).toMatch(/exit 1/);
    const refusal = code.indexOf("sk_test_*)");
    const firstRun = code.indexOf("test-clock-rehearsal.mjs");
    expect(refusal).toBeGreaterThan(0);
    expect(refusal).toBeLessThan(firstRun);
  });

  // THE ONE THAT WOULD LEAK IT. A secret reaches the script as an env var and nothing else:
  // never echoed, never interpolated into a URL, never sliced for a "safe" prefix.
  it("is never echoed, printed or put in a URL", () => {
    expect(code).not.toMatch(/echo .*\$\{?STRIPE_TEST_KEY/);
    expect(code).not.toMatch(/\$\{\{\s*secrets\.STRIPE_TEST_KEY\s*\}\}(?![\s\S]{0,40}\n)/);
    // No substring of the key — `${KEY:0:8}` puts eight characters of a secret in a public log.
    expect(code).not.toMatch(/STRIPE_TEST_KEY:\d/);
    expect(code).not.toMatch(/\$\{STRIPE_TEST_KEY:\d/);
    // Not on a command line either: an argument is visible in `ps` and in the step's echoed
    // command, while an env var is not.
    expect(code).not.toMatch(/--key\s+["$]/);
    expect(code).not.toMatch(/https?:\/\/[^\s"']*STRIPE_TEST_KEY/);
  });

  it("hands it to the script as an env var, on the steps that need it", () => {
    expect(code).toMatch(/STRIPE_TEST_KEY: \$\{\{ secrets\.STRIPE_TEST_KEY \}\}/);
  });
});

describe("a failed rehearsal cannot report green", () => {
  /* THE `tee` TRAP. `node ... | tee file` exits with tee's status, which is 0 whatever node did.
     Without `set -o pipefail` on the SAME block, a rehearsal that failed every assertion passes
     the step. Asserted per block rather than once for the file, because one block missing it is
     exactly how this would come back. */
  it("every piped step sets pipefail", () => {
    const piped = runBlocks(code).filter((b) => b.includes("| tee"));
    expect(piped.length).toBeGreaterThanOrEqual(3);
    for (const block of piped) {
      expect(block).toMatch(/set -o pipefail/);
    }
  });

  it("has no continue-on-error anywhere", () => {
    expect(code).not.toMatch(/continue-on-error/);
  });
});

describe("what it actually runs", () => {
  it("rehearses the member's own day and the month-end clamp", () => {
    expect(code).toMatch(/--day "\$\{\{ inputs\.day \}\}"/);
    expect(code).toMatch(/--day 31/);
  });

  /* THE SECOND RUN MUST NOT BE SKIPPED BY THE FIRST ONE FAILING. Two results are two pieces of
     information, and day 31 is the case most likely to be wrong — a naive month-add turns the
     31st of January into the 3rd of March. */
  it("still runs the month-end case after a failure on the first", () => {
    const clamp = code.indexOf("--day 31");
    const before = code.slice(0, clamp);
    expect(before.lastIndexOf("if: always()")).toBeGreaterThan(before.lastIndexOf("- name: Rehearsal — the member's own day"));
  });

  /*
    MEASURED ON RUN #1, not imagined. With no key set, three steps each printed their own refusal
    — require-secrets named the missing secret, the day-31 rehearsal printed "No Stripe TEST key",
    and platform-check printed "REFUSING: must be a TEST key". Three messages, one cause, and the
    first thing a reader has to do is work out which one is the reason.

    So the key-dependent steps are gated on the KEY step specifically rather than on the job.
    That is deliberately narrower than `if: success()`: a FAILED rehearsal on the member's day
    must still not stop the month-end run, because those are two different answers.
  */
  it("does not re-report a missing key from every step that needed it", () => {
    for (const step of ["the month-end clamp", "Did the async events reach"]) {
      const at = code.indexOf(step);
      expect(at).toBeGreaterThan(0);
      const condition = code.slice(at, code.indexOf("run:", at));
      expect(condition).toMatch(/steps\.key\.outcome == 'success'/);
    }
  });

  // ...but the gate must be on the KEY, never on the job: `if: success()` here would mean a
  // failed rehearsal on the member's day silently skipped the month-end clamp.
  it("still runs the month-end clamp after the FIRST rehearsal fails", () => {
    const at = code.indexOf("the month-end clamp");
    const condition = code.slice(at, code.indexOf("run:", at));
    expect(condition).toMatch(/always\(\)/);
    expect(condition).not.toMatch(/if: success\(\)/);
  });

  it("runs the platform-side runner check even with no Stripe key at all", () => {
    const at = code.indexOf("The runner, run twice");
    const condition = code.slice(at, code.indexOf("run:", at));
    expect(condition).toMatch(/always\(\)/);
    expect(condition).not.toMatch(/steps\.key/);
  });

  it("asks whether the async events reached our destination", () => {
    expect(code).toMatch(/node scripts\/stripe\/platform-check\.mjs/);
  });

  it("runs the platform half of 'the runner sends nothing twice'", () => {
    expect(code).toMatch(/billingMigrationRunExecuted\.test\.ts/);
  });

  /*
    FOUND BY RUNNING IT, not by reading it — run #2 (34682043460).

    `mkdir -p rehearsal-output` used to live inside each rehearsal step. Gating those steps on the
    key took the mkdir with them, so with no key every rehearsal step skipped, the directory never
    existed, and `tee rehearsal-output/runner-twice.txt` had nowhere to write. The one step that
    needs NO key — the platform-side runner check — failed for a reason that had nothing to do
    with it, and the artifact uploaded nothing: "No files were found with the provided path".

    A shared output path belongs to the job, not to whichever step happens to run first. So it is
    created once, by a step no condition can skip, before anything writes into it.
  */
  it("creates the output directory in a step that nothing can skip", () => {
    const at = code.indexOf("run: mkdir -p rehearsal-output");
    expect(at).toBeGreaterThan(0);

    // The step that owns it carries no `if:` at all.
    const stepStart = code.lastIndexOf("- name:", at);
    expect(code.slice(stepStart, at)).not.toMatch(/if:/);

    // ...and it happens before the first thing that writes there.
    const firstWrite = code.indexOf("| tee rehearsal-output/");
    expect(firstWrite).toBeGreaterThan(at);
  });

  it("does not leave the mkdir inside a step that can be skipped", () => {
    // Exactly one real mkdir — in the stripped code, so the explanatory comment does not count.
    const mkdirs = code.match(/mkdir -p rehearsal-output/g) ?? [];
    expect(mkdirs).toHaveLength(1);
  });

  it("keeps the full output even when the run failed", () => {
    expect(code).toMatch(/actions\/upload-artifact@v4/);
    const upload = code.indexOf("upload-artifact");
    expect(code.slice(0, upload).lastIndexOf("if: always()")).toBeGreaterThan(0);
  });

  /* THE ARTIFACT IS PUBLIC TO ANYONE WHO CAN READ THE REPO, and GitHub masks secrets in the LOG
     but not inside an uploaded file. It may only ever carry the rehearsal's own output. */
  it("uploads only the rehearsal output directory", () => {
    expect(code).toMatch(/path: rehearsal-output\//);
    expect(code).not.toMatch(/path: \.\s*$/m);
  });
});
