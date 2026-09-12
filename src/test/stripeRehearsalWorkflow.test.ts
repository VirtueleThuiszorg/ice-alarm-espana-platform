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

  it("asks whether the async events reached our destination", () => {
    expect(code).toMatch(/node scripts\/stripe\/platform-check\.mjs/);
  });

  it("runs the platform half of 'the runner sends nothing twice'", () => {
    expect(code).toMatch(/billingMigrationRunExecuted\.test\.ts/);
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
