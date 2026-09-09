// @vitest-environment node
//
// TWO RULES ABOUT CI'S SHAPE, both of which were learned the expensive way.
//
// RULE 1 — ONE GATE PER JOB. A failing step ends its job, and every step after it reports
// `skipped`. `skipped` is not red. So four gates in one job is really one gate plus three that
// only run while the first is happy — and the first was the migration drift gate, which was red
// on main for a whole day. Typecheck, build and the wiring register had NO signal for that day,
// and two things went through the hole: an unparseable test file (#268) and the review fix for a
// live auth stale-token hole (#273). Neither was subtle; nothing was looking.
//
// RULE 2 — A MISSING SECRET FAILS. `deploy-functions.yml` skipped its whole deploy and reported
// success when its credentials were absent, so "green" meant either "deployed" or "never tried".
// A deploy workflow that cannot tell you which is not a deploy workflow.
//
// These are assertions about a YAML file, which is normally a weak kind of test — so they are
// written against the STRUCTURE (which step sits in which job) rather than against text
// proximity, and the splitter that recovers that structure is itself tested below on a fixture
// with a known shape. A test that greps for "Migration drift gate" would pass just as happily
// with all four gates back in one job, which is the exact thing it is supposed to prevent.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const WORKFLOW_DIR = join(ROOT, ".github/workflows");
const workflowFiles = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));

/**
 * Split a workflow into its jobs without a YAML parser.
 *
 * No parser is used on purpose: `yaml` is present only as a transitive dependency of tailwindcss,
 * so importing it here would make this file's fate depend on tailwind's dependency tree, and
 * adding it directly means touching package-lock.json — a large shared file that three sessions
 * are merging against today.
 *
 * The format this needs to read is narrow and fixed by the files themselves: `jobs:` at column 0,
 * each job id at two spaces, everything belonging to that job indented further. `steps:` entries
 * are `- name:` at six spaces. That is enough, and `splits a workflow into its jobs` below proves
 * the splitter on a fixture rather than trusting it.
 */
function jobsOf(yaml: string): Map<string, string> {
  const lines = yaml.split("\n");
  const jobs = new Map<string, string>();

  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt === -1) return jobs;

  let current: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (current) jobs.set(current, body.join("\n"));
    body = [];
  };

  for (const line of lines.slice(jobsAt + 1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      flush();
      current = header[1];
      continue;
    }
    // A non-indented, non-blank line ends the jobs block entirely.
    if (line.trim() !== "" && !/^\s/.test(line)) break;
    if (current) body.push(line);
  }
  flush();

  return jobs;
}

/** The `- name:` values of a job's steps, in order. */
function stepNames(jobBody: string): string[] {
  return [...jobBody.matchAll(/^ {6}- name:\s*(.+?)\s*$/gm)].map((m) => m[1]);
}

/**
 * EVERY job containing a step with this name — not the first.
 *
 * This returned the first match until a mutation caught it: adding a SECOND "Migration drift
 * gate" step back into `lint-typecheck-build`, while leaving the standalone job in place, failed
 * nothing. And that copy is the whole defect — it is inside the shared job, so when it fails,
 * typecheck and build report `skipped` again. "Which job owns this gate" is therefore the wrong
 * question; "is there exactly one" is the right one.
 */
function jobsContainingStep(jobs: Map<string, string>, step: string): string[] {
  return [...jobs].filter(([, body]) => stepNames(body).includes(step)).map(([id]) => id);
}

/**
 * The single job that owns a gate. Fails the test outright if no job or several jobs run it,
 * rather than returning something an assertion could then read past.
 */
function soleJobWithStep(jobs: Map<string, string>, step: string): string {
  const owners = jobsContainingStep(jobs, step);
  expect(owners, `"${step}" must run in exactly one job, found: [${owners.join(", ")}]`).toHaveLength(
    1,
  );
  return owners[0];
}

const ci = readFileSync(join(WORKFLOW_DIR, "ci.yml"), "utf8");
const ciJobs = jobsOf(ci);

describe("the splitter this file's assertions depend on", () => {
  // Written first and deliberately: every structural assertion below is only worth as much as
  // this function, and a splitter that returned one giant job would make all of them vacuous.
  const fixture = [
    "name: Fixture",
    "",
    "jobs:",
    "  alpha:",
    "    name: Alpha",
    "    steps:",
    "      - name: One",
    "        run: true",
    "      - name: Two",
    "        run: true",
    "  beta:",
    "    name: Beta",
    "    steps:",
    "      - name: Three",
    "        run: true",
    "",
  ].join("\n");

  it("splits a workflow into its jobs", () => {
    expect([...jobsOf(fixture).keys()]).toEqual(["alpha", "beta"]);
  });

  it("keeps each job's steps with that job, and does not leak them across the boundary", () => {
    const jobs = jobsOf(fixture);
    expect(stepNames(jobs.get("alpha")!)).toEqual(["One", "Two"]);
    expect(stepNames(jobs.get("beta")!)).toEqual(["Three"]);
  });

  it("finds nothing for a step no job has", () => {
    expect(jobsContainingStep(jobsOf(fixture), "Four")).toEqual([]);
  });

  it("reports BOTH jobs when two run a step of the same name", () => {
    // The property `soleJobWithStep` relies on. Without this, "exactly one owner" would rest on
    // an unproven claim about the helper.
    const doubled = fixture.replace(
      "      - name: Three",
      "      - name: One\n        run: true\n      - name: Three",
    );
    expect(jobsContainingStep(jobsOf(doubled), "One")).toEqual(["alpha", "beta"]);
  });

  it("returns no jobs for a workflow with no jobs block", () => {
    expect(jobsOf("name: Nothing\non:\n  push: {}\n").size).toBe(0);
  });
});

describe("RULE 1 — each gate is its own job, so one failing gate cannot skip the others", () => {
  // The four gates that shared a job. Each must now be somewhere different: that is the property,
  // and it holds regardless of what the jobs end up being called.
  const gates = ["Migration drift gate", "Wiring register", "Type check", "Build"];

  it("each gate runs in exactly one job — not zero, and not two", () => {
    // "Exactly one" rather than "at least one". A duplicate copy of a gate inside the shared job
    // reproduces the original defect in full while the standalone job still stands there looking
    // correct, and that is precisely what slipped past the first version of this file.
    for (const gate of gates) {
      expect(
        jobsContainingStep(ciJobs, gate),
        `"${gate}" must run in exactly one job`,
      ).toHaveLength(1);
    }
  });

  it("the migration drift gate does not share a job with typecheck, build or the register", () => {
    // THE ASSERTION THIS FILE EXISTS FOR. The drift gate is the one that is legitimately red for
    // days at a time (production behind main), so it is the one whose failure must not silence
    // anything else.
    const drift = soleJobWithStep(ciJobs, "Migration drift gate");
    for (const other of ["Wiring register", "Type check", "Build"]) {
      expect(
        soleJobWithStep(ciJobs, other),
        `"${other}" shares a job with the drift gate, so a red gate reports it as skipped`,
      ).not.toBe(drift);
    }
  });

  it("the wiring register does not share a job with typecheck or build either", () => {
    // Same reasoning, one rung down: the register goes stale whenever a PR adds a wire without
    // regenerating it, which happened four times in one day.
    const register = soleJobWithStep(ciJobs, "Wiring register");
    for (const other of ["Type check", "Build"]) {
      expect(soleJobWithStep(ciJobs, other)).not.toBe(register);
    }
  });

  it("neither new gate job depends on another, or a red gate blocks the rest by `needs`", () => {
    // Splitting the steps into jobs and then chaining them with `needs:` would reproduce the
    // original behaviour exactly, with `skipped` instead of `skipped`.
    for (const id of ["migration-drift", "wiring-register"]) {
      expect(ciJobs.get(id), `job "${id}" is missing`).toBeDefined();
      expect(ciJobs.get(id)).not.toMatch(/^\s+needs:/m);
    }
  });

  it("the drift gate job fetches full history, or the gate fails for the wrong reason", () => {
    // It diffs against the merge base. A shallow clone has none, the gate reads the PR as adding
    // nothing, and an ordinary one-migration PR fails inexplicably — after which somebody deletes
    // the gate. This moved job by job with the split, so it is asserted where it now lives.
    const drift = ciJobs.get("migration-drift")!;
    expect(drift).toMatch(/fetch-depth:\s*0/);
  });

  it("no gate step is continue-on-error, in any job", () => {
    // A step that cannot fail is not a gate, and the split would be pointless if the newly
    // independent jobs were also made unable to fail.
    for (const [id, body] of ciJobs) {
      expect(body, `job "${id}" has continue-on-error`).not.toContain("continue-on-error");
    }
  });
});

describe("RULE 2 — a missing secret fails the job, in every workflow", () => {
  const workflows = workflowFiles.map((file) => ({
    file,
    text: readFileSync(join(WORKFLOW_DIR, file), "utf8"),
  }));

  it("finds the workflows to check, so this suite cannot pass by looking at nothing", () => {
    expect(workflows.length).toBeGreaterThanOrEqual(4);
    expect(workflows.map((w) => w.file)).toContain("deploy-functions.yml");
  });

  it("no workflow declares a secret is optional by making steps conditional on it", () => {
    // The exact shape that was there: a step sets `configured=false`, and later steps carry
    // `if: steps.secrets.outputs.configured == 'true'`. The condition is the tell — a step that
    // runs only when a secret exists is a step whose absence reads as success.
    for (const { file, text } of workflows) {
      const lines = text.split("\n").filter((l) => !/^\s*#/.test(l));
      const body = lines.join("\n");
      expect(body, `${file} gates steps on a secret-presence output`).not.toMatch(
        /if:\s*steps\.[A-Za-z0-9_-]+\.outputs\.configured/,
      );
      expect(body, `${file} sets a "configured" output to skip work`).not.toMatch(
        /configured=(false|true)/,
      );
    }
  });

  it("no workflow announces a skip because something is not configured", () => {
    for (const { file, text } of workflows) {
      const body = text
        .split("\n")
        .filter((l) => !/^\s*#/.test(l))
        .join("\n");
      expect(body, `${file} still notices-and-skips`).not.toMatch(
        /::notice[^\n]*(skipped|skipping)/i,
      );
    }
  });

  it("every job that maps a secret into env guards it with require-secrets", () => {
    // The general rule rather than a check on deploy-functions by name: if a job can see a
    // secret, it needs that secret, and it must stop when it is absent. A new workflow that maps
    // one in and forgets the guard fails here.
    for (const { file, text } of workflows) {
      for (const [id, rawBody] of jobsOf(text)) {
        // Comments stripped for the same reason as below: a job whose comment merely MENTIONS the
        // guard must not count as calling it.
        const body = rawBody
          .split("\n")
          .filter((l) => !/^\s*#/.test(l))
          .join("\n");
        const usesSecret = /\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}/.test(body);
        if (!usesSecret) continue;
        expect(
          body,
          `${file} job "${id}" maps a secret into env but never calls require-secrets.mjs, ` +
            `so a repo without that secret gets a green tick for work it did not do`,
        ).toContain("scripts/ci/require-secrets.mjs");
      }
    }
  });

  it("deploy-functions guards BOTH its documented secrets, in one call", () => {
    // Comments are stripped FIRST. The header explains the change and names the script, and the
    // first version of this assertion matched that prose instead of the `run:` line — passing on
    // the strength of a comment, which is the one thing a workflow does not execute.
    const deploy = readFileSync(join(WORKFLOW_DIR, "deploy-functions.yml"), "utf8")
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    const guard = /require-secrets\.mjs([^\n]*)/.exec(deploy);
    expect(guard, "no require-secrets call in deploy-functions.yml").not.toBeNull();
    expect(guard![1]).toContain("SUPABASE_ACCESS_TOKEN");
    expect(guard![1]).toContain("SUPABASE_PROJECT_REF");
  });

  it("the guard runs BEFORE anything is installed or deployed", () => {
    const deploy = readFileSync(join(WORKFLOW_DIR, "deploy-functions.yml"), "utf8");
    const names = stepNames(jobsOf(deploy).get("deploy")!);
    const guardAt = names.findIndex((n) => /require|secret/i.test(n));
    const deployAt = names.findIndex((n) => /deploy all edge functions/i.test(n));
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(deployAt).toBeGreaterThan(guardAt);
  });
});

describe("require-secrets.mjs actually exits non-zero — driven, not read", () => {
  const SCRIPT = join(ROOT, "scripts/ci/require-secrets.mjs");

  /** Run the real script in a real child process. Returns its status and merged output. */
  const run = (args: string[], env: Record<string, string>) => {
    try {
      const stdout = execFileSync("node", [SCRIPT, ...args], {
        encoding: "utf8",
        // A clean env, so a variable that happens to exist on the developer's machine or on the
        // runner cannot make a "missing secret" case pass.
        env: { PATH: process.env.PATH ?? "", ...env },
      });
      return { status: 0, output: stdout };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  };

  it("FAILS when a required secret is unset, and names it", () => {
    const r = run(["SUPABASE_ACCESS_TOKEN"], {});
    expect(r.status).toBe(1);
    expect(r.output).toContain("SUPABASE_ACCESS_TOKEN");
    expect(r.output).toContain("::error");
  });

  it("FAILS when a secret is present but empty — an unset secret arrives as an empty string", () => {
    const r = run(["SUPABASE_ACCESS_TOKEN"], { SUPABASE_ACCESS_TOKEN: "" });
    expect(r.status).toBe(1);
  });

  it("FAILS when a secret is only whitespace, which is a paste accident not a value", () => {
    const r = run(["SUPABASE_ACCESS_TOKEN"], { SUPABASE_ACCESS_TOKEN: "   " });
    expect(r.status).toBe(1);
  });

  it("names EVERY missing secret, so two missing is one fix and not two runs", () => {
    const r = run(["A_TOKEN", "B_REF"], {});
    expect(r.status).toBe(1);
    expect(r.output).toContain("A_TOKEN");
    expect(r.output).toContain("B_REF");
  });

  it("passes when every secret is set", () => {
    const r = run(["A_TOKEN", "B_REF"], { A_TOKEN: "x", B_REF: "y" });
    expect(r.status).toBe(0);
  });

  it("FAILS when called with no names — a guard that guards nothing must not pass", () => {
    const r = run([], {});
    expect(r.status).toBe(1);
  });

  it("never prints a secret's VALUE, only its name", () => {
    const r = run(["A_TOKEN", "B_REF"], { A_TOKEN: "super-secret-value" });
    expect(r.output).not.toContain("super-secret-value");
  });
});
