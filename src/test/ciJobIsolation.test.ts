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
// RULE 2 — A MISSING SECRET FAILS. The old `deploy-functions.yml` skipped its whole deploy and reported
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

/**
 * Just ONE step's text, bounded at the next step.
 *
 * Slicing from a step name to the end of the job is the trap that let two mutations through here:
 * removing `if: always()` from "Remote migration list AFTER" still passed, because the slice ran
 * on into the recorder step below and found ITS `if: always()`. An assertion about a step has to
 * stop at that step, or it is really an assertion about the rest of the file.
 */
function stepBody(jobBody: string, stepName: string): string {
  const start = jobBody.indexOf(`- name: ${stepName}`);
  expect(start, `no step named "${stepName}"`).toBeGreaterThanOrEqual(0);
  const rest = jobBody.slice(start);
  const next = rest.indexOf("\n      - name:");
  return next === -1 ? rest : rest.slice(0, next);
}

/** YAML comments are not executed, so no assertion may be satisfied by one. */
function stripComments(yaml: string): string {
  return yaml
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

const ci = readFileSync(join(WORKFLOW_DIR, "ci.yml"), "utf8");
const ciJobs = jobsOf(ci);

const migrate = readFileSync(join(WORKFLOW_DIR, "migrate.yml"), "utf8");
const migrateJobs = jobsOf(migrate);

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
    // `deploy-functions.yml` was folded into migrate.yml as a dependent job, so that the schema a
    // function reads is always applied first. See the ordering block below.
    expect(workflows.map((w) => w.file)).toContain("migrate.yml");
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

  it("the migrate job guards ALL THREE of its secrets, in one call", () => {
    // Comments are stripped FIRST. The header explains the change and names the script, and the
    // first version of this assertion matched that prose instead of the `run:` line — passing on
    // the strength of a comment, which is the one thing a workflow does not execute.
    const body = stripComments(migrateJobs.get("migrate")!);
    const guard = /require-secrets\.mjs([\s\S]*?)\n\s*-/.exec(body);
    expect(guard, "no require-secrets call in the migrate job").not.toBeNull();
    for (const secret of [
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_PROJECT_REF",
      "SUPABASE_DB_PASSWORD",
    ]) {
      expect(guard![1], `migrate does not require ${secret}`).toContain(secret);
    }
  });

  it("the deploy job guards the two secrets IT needs", () => {
    const body = stripComments(migrateJobs.get("deploy")!);
    const guard = /require-secrets\.mjs([^\n]*)/.exec(body);
    expect(guard).not.toBeNull();
    expect(guard![1]).toContain("SUPABASE_ACCESS_TOKEN");
    expect(guard![1]).toContain("SUPABASE_PROJECT_REF");
  });

  it("each guard runs BEFORE anything is installed or deployed", () => {
    for (const job of ["migrate", "deploy"]) {
      const names = stepNames(migrateJobs.get(job)!);
      const guardAt = names.findIndex((n) => /require .*secrets/i.test(n));
      expect(guardAt, `${job} has no secrets guard`).toBeGreaterThanOrEqual(0);
      const actsAt = names.findIndex((n) => /apply migrations|deploy all edge functions/i.test(n));
      expect(actsAt, `${job} never acts`).toBeGreaterThan(guardAt);
    }
  });

  it("the DB PASSWORD is never a command-line argument, only env", () => {
    // A password on a command line reaches the process list and any `set -x` log line. The CLI
    // reads it from the environment, so `--password` is never needed.
    const migrateRaw = stripComments(readFileSync(join(WORKFLOW_DIR, "migrate.yml"), "utf8"));
    expect(migrateRaw).not.toMatch(/--password/);
    expect(migrateRaw).not.toMatch(/echo[^\n]*SUPABASE_DB_PASSWORD/);
    // `printf` leaks exactly as `echo` does and was not covered — a gap found while adding the
    // pooler fallback, which uses printf to write a 0600 file. Writing a derived, masked value
    // into a file is fine; EXPANDING the password into anything that prints is not, whichever
    // command does the printing.
    expect(migrateRaw).not.toMatch(/(echo|printf)[^\n]*\$\{?SUPABASE_DB_PASSWORD/);
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

describe("RULE 3 — schema is applied BEFORE the functions that read it", () => {
  // The #277 outage in one sentence: a function went live while the migration it depends on was
  // unapplied, `notify-admin` answered 500, and all twelve of its events stopped — including the
  // four that report the SOS machinery itself failing. Every caller swallows notification errors
  // (correctly — a notification must never break an escalation), so the loss was silent.
  //
  // These assertions are about the DEPENDENCY, because that is the guarantee. A comment promising
  // the order, or two workflows that merely tend to run in the right sequence, is not one.

  const deployBody = () => stripComments(migrateJobs.get("deploy")!);

  it("there is exactly ONE job that deploys functions, across every workflow", () => {
    // The race this design exists to remove: with a separate deploy workflow triggered on `push`,
    // a commit touching a migration AND a function starts the deploy immediately while also
    // chaining it after the migration — so the function still goes live first, precisely on the
    // pushes where the ordering matters most. `paths:` filters a workflow, not a job, and cannot
    // express "functions but NOT migrations".
    const deployers: string[] = [];
    for (const file of workflowFiles) {
      const text = stripComments(readFileSync(join(WORKFLOW_DIR, file), "utf8"));
      for (const [id, body] of jobsOf(text)) {
        if (/supabase functions deploy/.test(body)) deployers.push(`${file}:${id}`);
      }
    }
    expect(deployers, `function deploys found in: ${deployers.join(", ")}`).toEqual([
      "migrate.yml:deploy",
    ]);
  });

  it("the deploy job DEPENDS on the migrate job", () => {
    expect(migrateJobs.get("deploy")).toBeDefined();
    expect(deployBody()).toMatch(/needs:\s*\[[^\]]*\bmigrate\b[^\]]*\]/);
  });

  it("deploy runs when migrate SUCCEEDED or was SKIPPED — and on nothing else", () => {
    // `skipped` has to be allowed explicitly: on a functions-only push there is no migration to
    // apply, `migrate` is skipped, and a skipped dependency would otherwise skip the deploy too —
    // which would mean functions never deploy unless a migration happens to change.
    const body = deployBody();
    expect(body).toContain("needs.migrate.result == 'success'");
    expect(body).toContain("needs.migrate.result == 'skipped'");
  });

  it("deploy does NOT run when migrate failed or was cancelled", () => {
    // The negative form of the same property, asserted directly: a `result != 'failure'` style
    // guard would silently allow `cancelled`, and a cancelled migration leaves production in a
    // state nobody recorded.
    const body = deployBody();
    expect(body).not.toMatch(/needs\.migrate\.result\s*!=/);
    for (const bad of ["'failure'", "'cancelled'"]) {
      expect(
        body.includes(`needs.migrate.result == ${bad}`),
        `deploy permits migrate.result == ${bad}`,
      ).toBe(false);
    }
  });

  it("migrate runs only when a migration actually changed, so a functions-only push is not delayed", () => {
    const body = stripComments(migrateJobs.get("migrate")!);
    expect(body).toContain("needs.changes.outputs.migrations == 'true'");
  });

  it("the changed-path detector fetches full history, or it cannot diff at all", () => {
    expect(stripComments(migrateJobs.get("changes")!)).toMatch(/fetch-depth:\s*0/);
  });
});

describe("RULE 4 — the migrate job cannot report green without having applied the schema", () => {
  const migrateBody = () => stripComments(migrateJobs.get("migrate")!);
  const names = () => stepNames(migrateJobs.get("migrate")!);

  it("the migration tests run BEFORE production is touched", () => {
    // A malformed migration set — two files sharing a version, say — must never reach `db push`.
    const order = names();
    const testsAt = order.findIndex((n) => /migration tests/i.test(n));
    const pushAt = order.findIndex((n) => /^apply migrations$/i.test(n));
    expect(testsAt, "no migration-test step").toBeGreaterThanOrEqual(0);
    expect(pushAt).toBeGreaterThan(testsAt);
  });

  it("it runs the two test files by name, so the gate cannot become an empty glob", () => {
    const body = migrateBody();
    expect(body).toContain("src/test/migrationDrift.test.ts");
    expect(body).toContain("src/test/migrationManifestRecording.test.ts");
  });

  it("db push is non-interactive — a prompt in CI is a 20-minute timeout, not a failure", () => {
    expect(migrateBody()).toMatch(/supabase db push[^\n]*--yes/);
  });

  it("db push uses --include-all, or an out-of-order history stops the pipeline dead", () => {
    // Run #1 failed on exactly this and applied nothing. Without the flag the CLI refuses the
    // WHOLE push as soon as any unapplied migration is older than the newest applied one:
    //
    //   LegacyDbPushMissingRemoteError: Found local migration files to be inserted before the
    //   last migration on remote database.
    //
    // Production was in that state — 20260909121500 applied by hand, 20260909120000 not — and
    // the workflow could not have got itself out of it. Reproduced against a local Postgres
    // seeded with production's exact 183 versions before the flag was added, and again after,
    // where it reported it would push exactly the two genuinely pending files.
    expect(migrateBody()).toMatch(/supabase db push[^\n]*--include-all/);
  });

  it("the remote list is captured both before AND after the push", () => {
    const order = names().map((n) => n.toLowerCase());
    expect(order.some((n) => n.includes("before"))).toBe(true);
    expect(order.some((n) => n.includes("after"))).toBe(true);
  });

  it("the AFTER capture and the recorder run even when the push failed", () => {
    // A partial push really applied migrations. Not recording them leaves the manifest lying in
    // the one direction nothing downstream can detect — it would report production as further
    // behind than it is, and the next push would try to re-apply what is already there.
    //
    // Each step is inspected in ISOLATION. The first version of this sliced to the end of the job
    // and passed with `if: always()` deleted from the AFTER capture, because it found the
    // recorder's one further down. Caught by mutation.
    const body = migrateBody();
    expect(stepBody(body, "Remote migration list AFTER")).toMatch(/if:\s*always\(\)/);
    expect(stepBody(body, "Record what actually applied")).toMatch(/if:\s*always\(\)/);
  });

  it("a failed push FAILS the job, decided in one place", () => {
    // `continue-on-error` on the push step is deliberate and safe ONLY because the verdict step
    // re-fails the job. Asserted as the actual branch, not as two strings present somewhere in the
    // step: replacing the condition with `if false` left both `steps.push.outcome` and `exit 1` in
    // place and passed. Caught by mutation.
    const verdict = stepBody(migrateBody(), "Verdict");
    expect(verdict).toContain("PUSH: ${{ steps.push.outcome }}");
    expect(verdict, "the verdict does not branch on the push outcome").toMatch(
      /if\s*\[\s*"\$PUSH"\s*!=\s*"success"\s*\]/,
    );
    // …and that branch must end the job.
    const branch = verdict.slice(verdict.indexOf('if [ "$PUSH"'));
    expect(branch.slice(0, branch.indexOf("fi"))).toMatch(/exit 1/);
  });

  it("the manifest commit names the count and the run", () => {
    expect(migrateBody()).toMatch(/chore\(prod\): record \$\{APPLIED_COUNT\} migrations applied by CI/);
  });

  it("nothing is committed when nothing applied", () => {
    const body = migrateBody();
    const commit = body.slice(body.indexOf("- name: Commit the manifest"));
    expect(commit).toContain("applied_count != '0'");
  });
});

describe("the migrate workflow's own settings match what production needs", () => {
  const head = migrate.slice(0, migrate.indexOf("\njobs:"));

  it("never two migrations at once, and never cancels one mid-push", () => {
    // A cancelled `db push` leaves production in a state nobody recorded.
    expect(head).toMatch(/group:\s*migrate-prod/);
    expect(head).toMatch(/cancel-in-progress:\s*false/);
  });

  it("triggers on a migration push to main, and can be run by hand", () => {
    expect(head).toContain("supabase/migrations/**");
    expect(head).toMatch(/branches:\s*\[main\]/);
    expect(head).toContain("workflow_dispatch");
  });

  it("can write, because it commits the manifest — and has no wider permission than that", () => {
    expect(head).toMatch(/permissions:\s*\n\s*(#[^\n]*\n\s*)*contents:\s*write\s*$/m);
  });

  it("both jobs have a timeout, so a hung push cannot hold the queue for six hours", () => {
    for (const id of ["migrate", "deploy"]) {
      expect(migrateJobs.get(id), `${id} missing`).toMatch(/timeout-minutes:\s*20/);
    }
  });
});

describe("RULE 5 — the manifest is checked against production itself, on main only", () => {
  // The file-based drift gate compares the repo to APPLIED_TO_PROD.txt and therefore cannot tell
  // whether that file is TRUE. On 2026-09-09 it was not: production had three migrations applied
  // by hand that the manifest did not name, and nothing noticed until `supabase db push` refused
  // to run because those hand-pushes had left production's history out of order.
  const truth = () => {
    const job = ciJobs.get("migration-truth");
    expect(job, "no migration-truth job").toBeDefined();
    return stripComments(job!);
  };

  it("is its own job, so a red truth-check cannot skip another gate", () => {
    const owner = soleJobWithStep(ciJobs, "Manifest matches production");
    expect(owner).toBe("migration-truth");
    for (const other of ["Migration drift gate", "Type check", "Build", "Wiring register"]) {
      expect(soleJobWithStep(ciJobs, other)).not.toBe(owner);
    }
  });

  it("runs on main ONLY — a pull request has no database to ask", () => {
    // The secrets are not available to a fork, and a branch's manifest is not what production is
    // measured against. Without this condition every PR would fail on a missing secret.
    expect(truth()).toMatch(/if:\s*github\.event_name == 'push'/);
  });

  it("requires all three secrets, because it only runs where they exist", () => {
    // The file-based gate tolerates their absence by never asking for them. This job cannot do
    // its work without them, so a missing one is a real failure rather than a reason to skip.
    const guard = /require-secrets\.mjs([\s\S]*?)\n\s*-/.exec(truth());
    expect(guard).not.toBeNull();
    for (const secret of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD"]) {
      expect(guard![1]).toContain(secret);
    }
  });

  it("only READS — it must never push, apply or commit", () => {
    // A check that can change production is not a check. This one exists to compare two lists.
    const body = truth();
    for (const forbidden of ["db push", "git commit", "git push", "functions deploy"]) {
      expect(body, `the truth check runs "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("the drift gate still runs everywhere, so PRs keep their file-based check", () => {
    // The two halves are complementary: this one is unconditional, the truth check is main-only.
    expect(stripComments(ciJobs.get("migration-drift")!)).not.toMatch(/^\s+if:/m);
  });
});
