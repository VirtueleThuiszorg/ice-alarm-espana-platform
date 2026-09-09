/**
 * A MISSING SECRET IS A FAILURE, NOT A SKIP.
 *
 * The function-deploy workflow used to open with a step called "Check deploy secrets (skip gracefully
 * until configured)". If `SUPABASE_ACCESS_TOKEN` or `SUPABASE_PROJECT_REF` was unset it printed a
 * `::notice::`, set an output, and every later step carried `if: configured == 'true'`. The job
 * then finished GREEN having deployed nothing.
 *
 * That is the worst available behaviour for a deploy. The workflow's whole promise is that main's
 * edge functions and production's are the same code; a green tick that means "I did not look"
 * reads identically to one that means "they match". Functions could sit stale for weeks behind a
 * wall of ticks, which is the same class of failure as the 24-migration drift — a check whose
 * silence was mistaken for a pass.
 *
 * So: name the secrets a job needs, and the job stops if they are not there. A repo missing a
 * secret gets a red X that says which one, which somebody fixes in a minute. Configuring CI is
 * not an error state to be tiptoed around — it is a prerequisite, and prerequisites are loud.
 *
 * USAGE, from a workflow step that has put the secrets in `env`:
 *
 *     - name: Require deploy secrets
 *       env:
 *         SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
 *       run: node scripts/ci/require-secrets.mjs SUPABASE_ACCESS_TOKEN
 *
 * GitHub does not expose secrets to a process on its own, so the workflow must still map them
 * into `env`. That is deliberate on GitHub's part and not something to work around: it means the
 * set of secrets a job can see is readable in the workflow file.
 *
 * NO SECRET VALUE IS EVER PRINTED — only names, and only the names of the ones that are absent.
 */

/** Reports every missing name, not just the first: two missing secrets is one fix, not two runs. */
export function missingSecrets(names, env) {
  return names.filter((name) => {
    const value = env[name];
    // An unset secret arrives as "" rather than undefined when a workflow maps it into env, and
    // a secret set to spaces is a paste accident, not a value. All three are "not configured".
    return value === undefined || value === null || String(value).trim() === "";
  });
}

/** The GitHub annotation plus the step summary, so the reason is on the Checks tab and the job. */
export function report(missing, names) {
  if (missing.length === 0) {
    return `All ${names.length} required secret(s) present: ${names.join(", ")}`;
  }
  return (
    `Missing required secret(s): ${missing.join(", ")}. ` +
    `This job cannot do its work without them, so it fails rather than passing green having ` +
    `done nothing. Set them in the repository's Actions secrets.`
  );
}

// Not `import.meta.main` — that is Deno. Node has no equivalent, and the edge functions in this
// repo are Deno while the scripts are Node, so the two get confused easily.
const invokedDirectly = process.argv[1]?.endsWith("require-secrets.mjs");

if (invokedDirectly) {
  const names = process.argv.slice(2).filter(Boolean);

  if (names.length === 0) {
    // Calling this with no arguments means the workflow author intended a guard and wrote one
    // that guards nothing. Passing would be worse than failing.
    console.error("::error title=require-secrets called with no secret names::Nothing was checked.");
    process.exit(1);
  }

  const missing = missingSecrets(names, process.env);
  const message = report(missing, names);

  if (missing.length > 0) {
    console.error(`::error title=Required secret(s) not configured::${message}`);
    process.exit(1);
  }

  console.log(message);
}
