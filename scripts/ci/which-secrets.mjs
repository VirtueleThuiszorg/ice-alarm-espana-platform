#!/usr/bin/env node
/**
 * WHICH OF THESE NAMES IS ACTUALLY SET — a diagnostic for "the secret is missing" when it isn't.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 *
 * `require-secrets.mjs` answers "is STRIPE_TEST_KEY set", and three dispatched rehearsal runs
 * answered no. That is correct and useless: it cannot tell apart the three things that produce it,
 * and they need completely different fixes —
 *
 *   the name is different        somebody typed STRIPE_SECRET_KEY_TEST. One rename fixes it.
 *   an ORG secret, not shared    the repository is missing from its access list.
 *   an ENVIRONMENT secret        no repository-level lookup can ever see it; the JOB needs an
 *                                `environment:` key before the secret exists for it at all.
 *
 * Only the first is visible from inside a job, and this is what makes it visible. When it finds a
 * plausible name set, "the secret is missing" becomes "it is called X", which somebody fixes in a
 * minute instead of hunting.
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────────
 *
 * IT NEVER PRINTS A VALUE, OR ANY PART OF ONE. Not a prefix, not a length, not `sk_test` vs
 * `sk_live` — because a length narrows a brute force and a prefix is the part that says which
 * account is about to be charged. It prints NAMES, which are not secret, and whether each is
 * empty. `toJSON(secrets)` would answer the same question by printing every value into a public
 * log, and is exactly what this exists instead of.
 *
 * A workflow cannot enumerate its own secrets — GitHub offers no such context — so the candidate
 * list is spelled out by whoever writes the step, and the report says so rather than implying it
 * looked everywhere.
 */

/** Which of `names` have a non-empty value in `env`. Values are read, never returned. */
export function presentNames(names, env) {
  return names.filter((name) => {
    const value = env[name];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

/**
 * The report. `expected` is the name the workflow actually wants.
 *
 * The three outcomes are deliberately different sentences, because they send somebody to three
 * different screens.
 */
export function describe(names, present, expected) {
  if (present.includes(expected)) {
    return `${expected} is set. If a step still reports it missing, the fault is in that step, not in the secret.`;
  }
  if (present.length > 0) {
    return (
      `${expected} is NOT set, but ${present.length} other name(s) ARE: ${present.join(", ")}. ` +
      `Most likely the secret exists under one of those — rename it to ${expected}, or say which ` +
      `to use. (No value has been read out of any of them, and none will be.)`
    );
  }
  return (
    `None of the ${names.length} names checked is set: ${names.join(", ")}. ` +
    `A workflow cannot list its own secrets, so this is a spelled-out candidate list and not a ` +
    `search — the secret may still exist under a name not on it. The two cases this CANNOT see ` +
    `at all: an ORGANISATION secret whose repository-access list omits this repo, and an ` +
    `ENVIRONMENT secret (a job only sees those once it declares \`environment:\`). Check ` +
    `Settings -> Secrets and variables -> Actions for all three.`
  );
}

const invokedDirectly = process.argv[1]?.endsWith("which-secrets.mjs");

if (invokedDirectly) {
  const names = process.argv.slice(2).filter(Boolean);
  if (names.length === 0) {
    console.error("::error title=which-secrets called with no names::Nothing was checked.");
    process.exit(1);
  }

  const [expected] = names;
  const present = presentNames(names, process.env);
  const message = describe(names, present, expected);

  console.log("Which secret NAMES are visible to this job (values are never read out):");
  for (const name of names) {
    console.log(`  ${present.includes(name) ? "set     " : "not set "} ${name}`);
  }
  console.log("");
  console.log(message);

  /* THIS IS A DIAGNOSTIC, NOT A GATE. The step that actually needs the secret has already failed
     the job; exiting non-zero here would add a second red step for the same cause, which is the
     noise #422 removed. */
  process.exit(0);
}
