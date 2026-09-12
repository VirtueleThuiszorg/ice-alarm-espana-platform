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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

  it("the migrate job guards ALL FOUR of its secrets, in one call", () => {
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
      // The fourth is MANIFEST_PUSH_TOKEN, and it is the one whose absence is silent without this
      // guard: the job would apply migrations to production and only then discover it cannot
      // record them, which is the drift this whole workflow exists to prevent.
      "MANIFEST_PUSH_TOKEN",
    ]) {
      expect(guard![1], `migrate does not require ${secret}`).toContain(secret);
    }
  });

  /*
    THE MANIFEST COMMIT GOES TO A GATED BRANCH.

    main is governed by a repository ruleset: every change to it needs a pull request, and
    github-actions[bot] is not a bypass actor. So `secrets.GITHUB_TOKEN` can no longer push the
    APPLIED_TO_PROD.txt commit, and the failure mode if it tries is the bad one — production has
    already been migrated, and the only record of what landed is a red X in a log.
  */
  it("the migrate job checks out with the PAT, so its push to main can land", () => {
    const body = stripComments(migrateJobs.get("migrate")!);
    const checkout = /actions\/checkout@v4([\s\S]*?)\n\s{6}- name:/.exec(body);
    expect(checkout, "the migrate job no longer checks out").not.toBeNull();
    expect(
      checkout![1],
      "checkout does not hand actions/checkout the PAT, so the persisted credential is the " +
        "job's own token and the manifest push is refused by the ruleset",
    ).toMatch(/token:\s*\$\{\{\s*secrets\.MANIFEST_PUSH_TOKEN/);
  });

  it("an absent PAT still fails at the guard, not at checkout", () => {
    // Without the fallback, an unset secret is the empty string and checkout dies on "Bad
    // credentials" — a red that reads like a GitHub outage rather than a missing secret. With it,
    // checkout succeeds on the job's own token and require-secrets names the secret one step
    // later, still before anything touches production.
    const body = stripComments(migrateJobs.get("migrate")!);
    expect(body).toMatch(/secrets\.MANIFEST_PUSH_TOKEN\s*\|\|\s*github\.token/);

    const names = stepNames(migrateJobs.get("migrate")!);
    const guard = names.findIndex((n) => /Require migrate secrets/i.test(n));
    const push = names.findIndex((n) => /Apply migrations/i.test(n));
    expect(guard, "no secrets guard in the migrate job").toBeGreaterThan(-1);
    expect(push, "no apply step in the migrate job").toBeGreaterThan(-1);
    expect(guard, "the guard must run before production is touched").toBeLessThan(push);
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
    //
    // EVERY FILE THAT COULD TOUCH IT, not just the workflow. The fallback started life inline in
    // migrate.yml and moved into scripts/ci/reach-production.sh so ci.yml could share it — and
    // an assertion that reads only the workflow would have gone green through that move while
    // covering nothing, because the lines it was written to police had left the file. A guard
    // that follows the code is the whole difference between this test and decoration.
    for (const file of [
      ".github/workflows/migrate.yml",
      ".github/workflows/ci.yml",
      "scripts/ci/reach-production.sh",
    ]) {
      const raw = stripComments(readFileSync(join(ROOT, file), "utf8"));
      expect(raw, `${file} passes a password on a command line`).not.toMatch(/--password/);
      // `printf` leaks exactly as `echo` does and was not covered — a gap found while adding the
      // pooler fallback, which uses printf to write a 0600 file. Writing a derived, masked value
      // into a file is fine; EXPANDING the password into anything that prints is not, whichever
      // command does the printing.
      expect(raw, `${file} expands the password into something that prints`)
        .not.toMatch(/(echo|printf)[^\n]*\$\{?SUPABASE_DB_PASSWORD/);
    }
  });

  it("ONE implementation of reaching production, used by both workflows", () => {
    // The reason this PR exists: the manifest check linked its own way, so when link began being
    // refused the migrate job carried on through the fallback and this gate stayed red on every
    // push to main. Neither workflow may grow its own `supabase link` again.
    const script = "scripts/ci/reach-production.sh";
    expect(existsSync(join(ROOT, script)), "the shared script is gone").toBe(true);

    for (const wf of ["migrate.yml", "ci.yml"]) {
      const raw = stripComments(readFileSync(join(WORKFLOW_DIR, wf), "utf8"));
      expect(raw, `${wf} does not use ${script}`).toContain(script);
      expect(raw, `${wf} still calls supabase link directly — use the shared script`)
        .not.toMatch(/supabase\s+link/);
    }
  });

  it("the shared script tries the Management API FIRST, and shouts when it falls back", () => {
    // Order matters: restoring the token privilege has to put every caller back on the supported
    // path with nothing to remember. And a silent fallback would let a degraded path become the
    // permanent one without anybody deciding that.
    // ORDER IS ASSERTED BY EXECUTION, in the driven suite below, not here. This was first
    // written as "the text `supabase link` appears above `pooler.supabase.com` in the file",
    // and a mutant walked straight through it: `if false && supabase link ...` leaves the text
    // exactly where it was while never attempting the Management API at all. Text order is not
    // execution order.
    const raw = readFileSync(join(ROOT, "scripts/ci/reach-production.sh"), "utf8");
    expect(raw, "the script never links").toContain("supabase link --project-ref");
    expect(raw, "the script has no fallback").toContain("pooler.supabase.com");
    expect(raw).toContain("::warning title=Reached production WITHOUT the Management API");
    // The URL file carries the password: 0600, and removed when no host authenticated.
    expect(raw).toContain("chmod 600 supabase/.temp/pooler-url");
    expect(raw).toContain("rm -f supabase/.temp/pooler-url");
    expect(raw).toContain("::add-mask::");
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

// ── and the same script DRIVEN, because reading it proved too little ────────────────────────
//
// This script now gates two workflows, so what matters is what it DOES: which path it takes,
// what it writes, and what it leaves behind when it cannot connect. A stubbed `supabase` on PATH
// makes all three observable without touching production — the same "driven, not read" shape as
// the require-secrets suite above, and the reason it exists is a mutant that survived the
// source-reading version of the order assertion.
describe("reach-production.sh, driven with a stubbed CLI", () => {
  const SCRIPT = join(ROOT, "scripts/ci/reach-production.sh");

  /**
   * Run the real script in a throwaway directory with a fake `supabase` first on PATH.
   * `linkOk` decides whether the Management API answers; `poolerHost` is the one host whose
   * `migration list` authenticates (undefined = none of them do).
   */
  const drive = (opts: { linkOk: boolean; poolerHost?: string }) => {
    const dir = mkdtempSync(join(tmpdir(), "reachprod-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const stub = opts.linkOk
      ? `#!/usr/bin/env bash\n[ "$1" = "link" ] && { echo "Finished supabase link."; exit 0; }\necho "unexpected: $*" >&2; exit 9\n`
      : `#!/usr/bin/env bash\n` +
        `[ "$1" = "link" ] && { echo "Authorization failed for the access token and project ref pair" >&2; exit 1; }\n` +
        `if [ "$1" = "migration" ] && [ "$2" = "list" ]; then\n` +
        `  grep -q "${opts.poolerHost ?? "__none__"}" supabase/.temp/pooler-url 2>/dev/null || { echo "auth failed on this host" >&2; exit 1; }\n` +
        `  echo "20260101000000 | 20260101000000 | applied"; exit 0\n` +
        `fi\n` +
        `echo "unexpected: $*" >&2; exit 9\n`;
    writeFileSync(join(bin, "supabase"), stub, { mode: 0o755 });

    const outFile = join(dir, "gh_output");
    writeFileSync(outFile, "");
    let status = 0;
    let output = "";
    try {
      output = execFileSync("bash", [SCRIPT, "check the manifest"], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          SUPABASE_PROJECT_REF: "testref",
          SUPABASE_DB_PASSWORD: "p@ss/word:with#specials",
          GITHUB_OUTPUT: outFile,
        },
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      status = err.status ?? 1;
      output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    return {
      status,
      output,
      outputs: readFileSync(outFile, "utf8"),
      urlPath: join(dir, "supabase/.temp/pooler-url"),
    };
  };

  it("uses the Management API when it works, and never touches the pooler", () => {
    const r = drive({ linkOk: true });
    expect(r.status).toBe(0);
    expect(r.outputs).toContain("mode=linked");
    // THE MUTANT THAT GOT THROUGH THE SOURCE-READING VERSION: link must be ATTEMPTED FIRST, so
    // restoring the token privilege silently returns every caller to the supported path.
    expect(r.output).not.toContain("probing");
    expect(existsSync(r.urlPath), "wrote a pooler URL despite link succeeding").toBe(false);
  });

  it("falls back past a host that refuses, and says so loudly", () => {
    const r = drive({ linkOk: false, poolerHost: "aws-1-eu-west-1" });
    expect(r.status).toBe(0);
    expect(r.outputs).toContain("mode=pooler");
    expect(r.outputs).toContain("host=aws-1-eu-west-1.pooler.supabase.com");
    // Probed in order and kept the one that answered — which host serves a project is not
    // derivable, so guessing one would be a coin flip.
    expect(r.output).toContain("probing aws-0-eu-west-1");
    expect(r.output).toContain("probing aws-1-eu-west-1");
    expect(r.output).toContain("::warning title=Reached production WITHOUT the Management API");
  });

  it("writes the URL 0600, percent-encoded, and never the raw password", () => {
    const r = drive({ linkOk: false, poolerHost: "aws-1-eu-west-1" });
    expect(statSync(r.urlPath).mode & 0o777).toBe(0o600);
    const url = readFileSync(r.urlPath, "utf8");
    expect(url, "the RAW password reached the file").not.toContain("p@ss/word:with#specials");
    expect(url).toContain("p%40ss%2Fword%3Awith%23specials");
    // And the encoded form is masked before it is used, so it cannot surface in a log line.
    expect(r.output).toContain("::add-mask::p%40ss%2Fword%3Awith%23specials");
  });

  it("when nothing authenticates: fails, removes the URL, and names what it could not do", () => {
    const r = drive({ linkOk: false });
    expect(r.status).toBe(1);
    expect(existsSync(r.urlPath), "left a password file behind after failing").toBe(false);
    expect(r.output).toContain("Cannot reach production at all");
    // The caller's own words, so the error says which job stopped and why.
    expect(r.output).toContain("cannot check the manifest");
    expect(r.outputs, "claimed a mode it never reached").not.toContain("mode=");
  });
});

/*
  RULE 6 — EVERY DIRECT PUSH TO main CARRIES THE PAT.

  Ruleset 19055263 went `active` on 2026-09-11 16:28 UTC with a `pull_request` rule and no bypass
  actor for GitHub Actions. From that minute `github.token` could not write to main, and two
  workflow steps that had been quietly keeping main correct stopped being able to:

    · migrate.yml  — `chore(prod): record N migrations applied by CI`, the manifest
    · ci.yml       — `chore(wiring): regenerate WIRING_REGISTER.md after a merge`, the self-heal

  Only the first was noticed. It failed four times in one afternoon (runs 29, 33, 34, 37), each
  time applying the migration to production and then losing the record of it — which the drift
  gate then read as "production is BEHIND", the dangerous direction, and three hand-written
  correction PRs went in to say what the workflow could not. The second pusher was found by
  reading rather than by an incident, and only because somebody went looking for a second one.

  So this does not assert "migrate.yml has the token" and "ci.yml has the token" — two facts that
  were both true of a repo with a third pusher in it. It FINDS the pushes, and requires each one
  to sit in a job whose checkout persisted MANIFEST_PUSH_TOKEN. A fourth pusher added next month
  fails here on the day it is added, not on the day it silently stops working.
*/
describe("RULE 6 — a step that pushes to main authenticates as something the ruleset admits", () => {
  /** `git push ... HEAD:main` / `... origin main`, in any workflow. Comments cannot match. */
  const PUSHES_TO_MAIN = /git push\b[^\n]*\b(HEAD:main|origin\s+main)\b/;

  const pushers = workflowFiles.flatMap((file) => {
    const jobs = jobsOf(readFileSync(join(WORKFLOW_DIR, file), "utf8"));
    return [...jobs]
      .filter(([, body]) => PUSHES_TO_MAIN.test(stripComments(body)))
      .map(([id, body]) => ({ file, id, body }));
  });

  const keys = pushers.map((p) => `${p.file}:${p.id}`).sort();

  it("finds the pushers, so this suite cannot pass by looking at nothing", () => {
    // The two known ones, by name — the completeness half. The assertions below run over what the
    // scan FOUND, so a third pusher is checked for the token automatically; this one is what makes
    // its arrival a decision somebody takes deliberately, and what turns a renamed job into a
    // loud failure instead of a suite that quietly checks one pusher, or none.
    expect(keys).toEqual(["ci.yml:wiring-register", "migrate.yml:migrate"]);
  });

  it.each(keys)(
    "%s checks out with MANIFEST_PUSH_TOKEN, so its push is not refused",
    (key) => {
      const job = pushers.find((p) => `${p.file}:${p.id}` === key)!;
      const checkout = stepBody(stripComments(job.body), "Checkout code");
      expect(
        checkout,
        `${key} pushes to main on the job's own token, which the ruleset refuses`,
      ).toMatch(/token:\s*\$\{\{\s*secrets\.MANIFEST_PUSH_TOKEN/);
    },
  );

  it.each(keys)(
    "%s falls back to github.token, so an absent secret is named rather than 'Bad credentials'",
    (key) => {
      // Not cosmetic. An unset secret arrives as the empty string, and `actions/checkout` with an
      // empty token dies on "Bad credentials" — which reads like a GitHub outage. With the
      // fallback, checkout succeeds and require-secrets fails one step later WITH THE NAME. That
      // is also why this is not a `configured == 'true'` gate, which RULE 2 forbids: the fallback
      // changes the error message, never whether the work is attempted.
      const job = pushers.find((p) => `${p.file}:${p.id}` === key)!;
      expect(stripComments(job.body)).toMatch(
        /secrets\.MANIFEST_PUSH_TOKEN\s*\|\|\s*github\.token/,
      );
    },
  );

  it.each(keys)(
    "%s requires the secret through require-secrets.mjs, before it pushes",
    (key) => {
      const job = pushers.find((p) => `${p.file}:${p.id}` === key)!;
      const body = stripComments(job.body);

      // Anchored AFTER `require-secrets.mjs` and allowed to span lines, because the two guards are
      // written differently and both are legitimate: ci.yml passes the one name on the `run:`
      // line, migrate.yml folds four names onto the line below with `>`. Anchoring is what keeps
      // it honest — a step that merely maps the secret into `env:` (which sits ABOVE `run:` in
      // both files) and then guards something else does not match.
      const guard = body
        .split("\n      - name:")
        .findIndex((s) => /require-secrets\.mjs[\s\S]*MANIFEST_PUSH_TOKEN/.test(s));
      expect(guard, `${key} never requires MANIFEST_PUSH_TOKEN`).toBeGreaterThan(-1);

      const push = body
        .split("\n      - name:")
        .findIndex((s) => PUSHES_TO_MAIN.test(s));
      expect(guard, `${key} pushes before it has checked the secret exists`).toBeLessThan(push);
    },
  );

  it("the ci.yml guard is gated on the EVENT, never on whether the secret is set", () => {
    // A pull request has no push to make and a fork PR gets no secrets at all, so the guard is
    // conditional there — and a condition next to a secret is the exact shape RULE 2 exists to
    // refuse. The distinction that makes it legitimate: `github.event_name`, which says what this
    // run IS, and never `secrets.MANIFEST_PUSH_TOKEN != ''`, which would say "skip if unconfigured".
    const guard = stepBody(stripComments(ciJobs.get("wiring-register")!), "Require the push token");
    expect(guard).toMatch(/if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
    expect(guard, "the guard skips itself when the secret is missing").not.toMatch(
      /if:[^\n]*secrets\./,
    );
  });
});
