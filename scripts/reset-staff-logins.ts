#!/usr/bin/env -S node --experimental-strip-types
/**
 * scripts/reset-staff-logins.ts — one-shot staff credential reset.
 *
 * Resets email + password for a declarative list of staff accounts, keeping
 * `auth.users` and `public.staff` in lock-step so the two can never diverge
 * (divergence is what broke staff login and prompted this script).
 *
 * ## Safety properties
 * 1. **Config never lives in code.** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
 *    come from the environment. The account list comes from a gitignored file
 *    (default `scripts/staff-logins.config.json`) or `STAFF_LOGINS_CONFIG`.
 *    No email, password or key appears in this file, in git, or in any doc.
 * 2. **Project-ref guard.** Refuses to run when the `ref` claim inside the service
 *    key does not match the host in `SUPABASE_URL`. Pointing a prod key at the
 *    wrong project — or a stale key at prod — is exactly the failure we just hit.
 * 3. **Dry-run by default.** Prints the exact intended diff and writes nothing.
 *    `--apply` is required to mutate anything.
 * 4. **Pre-flight, then write.** Every account is resolved against `public.staff`
 *    before the first write, so an unresolvable account aborts the run while the
 *    database is still untouched.
 * 5. **Fails loud, never silent** (GOALS.md G2). Any divergence halts the run and
 *    names the repair; nothing is caught-and-continued.
 * 6. **No secrets in output or audit rows.** Passwords are never printed and never
 *    stored in `activity_logs`; emails are masked unless `--unmask` is passed.
 *
 * ## Usage
 *   node --experimental-strip-types scripts/reset-staff-logins.ts            # dry run
 *   node --experimental-strip-types scripts/reset-staff-logins.ts --apply    # execute
 *
 * Flags: --apply  --unmask  --config <path>  --i-accept-unverifiable-ref
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** One account to reset. Located by its CURRENT email; both fields then change. */
export interface AccountSpec {
  /** Email the account has right now — used to find the staff + auth rows. */
  currentEmail: string;
  /** Email it should have after the reset. May equal currentEmail. */
  newEmail: string;
  /** New password. Never logged, never persisted anywhere but auth. */
  newPassword: string;
}

export interface ResetConfig {
  accounts: AccountSpec[];
}

/** A staff row resolved during pre-flight. */
export interface ResolvedAccount {
  spec: AccountSpec;
  staffId: string;
  userId: string;
  currentEmailInDb: string;
  role: string;
  status: string;
}

export interface CliOptions {
  apply: boolean;
  unmask: boolean;
  configPath: string;
  acceptUnverifiableRef: boolean;
}

export class RefMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefMismatchError";
  }
}

export class DivergenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivergenceError";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// The project-ref guard (pure — this is the part the tests exercise)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the project ref from a Supabase URL.
 * `https://abcdefghijklmnopqrst.supabase.co` → `abcdefghijklmnopqrst`.
 * Returns null for local/loopback hosts, which have no project ref.
 */
export function projectRefFromUrl(rawUrl: string): string | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    throw new RefMismatchError(
      `SUPABASE_URL is not a valid URL: ${JSON.stringify(rawUrl)}`,
    );
  }

  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return null;

  const [firstLabel, ...rest] = host.split(".");
  if (rest.length === 0 || !firstLabel) {
    throw new RefMismatchError(
      `Cannot derive a project ref from SUPABASE_URL host ${JSON.stringify(host)}.`,
    );
  }
  return firstLabel;
}

/**
 * Reads the `ref` claim out of a Supabase service-role key.
 *
 * Legacy service keys are JWTs carrying `{ "ref": "<project-ref>", ... }`. Newer
 * `sb_secret_*` keys are opaque, so the ref cannot be verified from them — that
 * is reported as unparsable rather than silently passing the guard.
 */
export function refClaimFromServiceKey(
  key: string,
): { parsable: true; ref: string | null } | { parsable: false; reason: string } {
  const parts = key.split(".");
  if (parts.length !== 3) {
    return {
      parsable: false,
      reason:
        "service key is not a three-part JWT (opaque `sb_secret_*` keys carry no readable ref claim)",
    };
  }

  let payload: unknown;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    payload = JSON.parse(json);
  } catch {
    return { parsable: false, reason: "service key payload is not decodable JSON" };
  }

  if (typeof payload !== "object" || payload === null) {
    return { parsable: false, reason: "service key payload is not a JSON object" };
  }

  const ref = (payload as Record<string, unknown>).ref;
  if (ref === undefined) return { parsable: true, ref: null };
  if (typeof ref !== "string") {
    return { parsable: false, reason: "service key `ref` claim is not a string" };
  }
  return { parsable: true, ref };
}

/**
 * THE GUARD. Throws RefMismatchError unless the service key demonstrably belongs
 * to the project named in the URL.
 *
 * Refuses when: the refs differ; the key carries no ref claim; or the key is
 * opaque so the check cannot be performed (unless explicitly overridden). A guard
 * that cannot verify must refuse, not wave the run through.
 */
export function assertRefMatch(
  supabaseUrl: string,
  serviceRoleKey: string,
  opts: { acceptUnverifiableRef?: boolean } = {},
): { urlRef: string | null; keyRef: string | null; verified: boolean } {
  const urlRef = projectRefFromUrl(supabaseUrl);
  const claim = refClaimFromServiceKey(serviceRoleKey);

  if (!claim.parsable) {
    if (opts.acceptUnverifiableRef) {
      return { urlRef, keyRef: null, verified: false };
    }
    throw new RefMismatchError(
      `Refusing to run: cannot verify the service key belongs to project ` +
        `${urlRef ?? "(local)"} — ${claim.reason}. ` +
        `Use a legacy JWT service_role key so the ref can be checked, or pass ` +
        `--i-accept-unverifiable-ref to proceed without this protection.`,
    );
  }

  if (claim.ref === null) {
    throw new RefMismatchError(
      `Refusing to run: the service key has no \`ref\` claim, so it cannot be ` +
        `matched against SUPABASE_URL (project ${urlRef ?? "(local)"}).`,
    );
  }

  if (urlRef === null) {
    throw new RefMismatchError(
      `Refusing to run: SUPABASE_URL points at a local host, but the service key ` +
        `belongs to remote project ${claim.ref}. Mixing a remote key with a local ` +
        `URL is never intended.`,
    );
  }

  if (claim.ref !== urlRef) {
    throw new RefMismatchError(
      `Refusing to run: PROJECT REF MISMATCH.\n` +
        `  SUPABASE_URL points at : ${urlRef}\n` +
        `  service key belongs to : ${claim.ref}\n` +
        `This is the exact failure this guard exists to prevent — a key for one ` +
        `project aimed at another. Nothing was read or written. Fix the ` +
        `environment, do not bypass this check.`,
    );
  }

  return { urlRef, keyRef: claim.ref, verified: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Redaction (pure)
// ────────────────────────────────────────────────────────────────────────────

/** `alice@example.com` → `a****@e******.com`. Keeps the diff readable, not identifying. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "*".repeat(Math.max(email.length, 3));

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const maskedLocal = local[0] + "*".repeat(Math.max(local.length - 1, 1));

  if (dot < 1) return `${maskedLocal}@${domain[0]}${"*".repeat(Math.max(domain.length - 1, 1))}`;
  const name = domain.slice(0, dot);
  const tld = domain.slice(dot);
  return `${maskedLocal}@${name[0]}${"*".repeat(Math.max(name.length - 1, 1))}${tld}`;
}

/** Passwords are never shown — only their shape, so the operator can sanity-check length. */
export function describePassword(password: string): string {
  return `<redacted, ${password.length} chars>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Config loading & validation (pure apart from the file read)
// ────────────────────────────────────────────────────────────────────────────

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;

/** Validates a parsed config. Throws on anything that would half-apply. */
export function validateConfig(raw: unknown): ResetConfig {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as ResetConfig).accounts)) {
    throw new Error("Config must be an object with an `accounts` array.");
  }
  const accounts = (raw as ResetConfig).accounts;
  if (accounts.length === 0) throw new Error("Config `accounts` array is empty — nothing to do.");

  accounts.forEach((account, i) => {
    const at = `accounts[${i}]`;
    for (const field of ["currentEmail", "newEmail", "newPassword"] as const) {
      if (typeof account?.[field] !== "string" || account[field].length === 0) {
        throw new Error(`${at}.${field} is required and must be a non-empty string.`);
      }
    }
    if (!EMAIL_SHAPE.test(account.currentEmail)) {
      throw new Error(`${at}.currentEmail is not a valid email address.`);
    }
    if (!EMAIL_SHAPE.test(account.newEmail)) {
      throw new Error(`${at}.newEmail is not a valid email address.`);
    }
    if (account.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `${at}.newPassword is shorter than ${MIN_PASSWORD_LENGTH} characters. ` +
          `These are privileged staff logins into a life-safety system.`,
      );
    }
  });

  const seen = new Set<string>();
  for (const account of accounts) {
    const key = account.currentEmail.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate currentEmail in config: ${maskEmail(account.currentEmail)}.`);
    }
    seen.add(key);
  }

  const targets = new Set<string>();
  for (const account of accounts) {
    const key = account.newEmail.toLowerCase();
    if (targets.has(key)) {
      throw new Error(`Two accounts would end up with the same newEmail: ${maskEmail(account.newEmail)}.`);
    }
    targets.add(key);
  }

  return { accounts };
}

export function loadConfig(configPath: string): ResetConfig {
  const fromEnv = process.env.STAFF_LOGINS_CONFIG;
  if (fromEnv) return validateConfig(JSON.parse(fromEnv));

  if (!existsSync(configPath)) {
    throw new Error(
      `No account config found.\n` +
        `  Expected a gitignored file at: ${configPath}\n` +
        `  Copy scripts/staff-logins.config.example.json to that path and fill it in,\n` +
        `  or set STAFF_LOGINS_CONFIG to the config JSON.\n` +
        `  Never commit real addresses or passwords.`,
    );
  }
  return validateConfig(JSON.parse(readFileSync(configPath, "utf8")));
}

// ────────────────────────────────────────────────────────────────────────────
// CLI parsing (pure)
// ────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    unmask: false,
    configPath: path.join("scripts", "staff-logins.config.json"),
    acceptUnverifiableRef: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--apply":
        options.apply = true;
        break;
      case "--unmask":
        options.unmask = true;
        break;
      case "--i-accept-unverifiable-ref":
        options.acceptUnverifiableRef = true;
        break;
      case "--config": {
        const next = argv[++i];
        if (!next) throw new Error("--config requires a path argument.");
        options.configPath = next;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

// ────────────────────────────────────────────────────────────────────────────
// Diff rendering (pure — this is what the dry run prints)
// ────────────────────────────────────────────────────────────────────────────

export function renderDiff(resolved: ResolvedAccount[], unmask: boolean): string {
  const show = (email: string) => (unmask ? email : maskEmail(email));
  const lines: string[] = [];

  resolved.forEach((account, i) => {
    const emailChanges = account.currentEmailInDb.toLowerCase() !== account.spec.newEmail.toLowerCase();
    lines.push(`  ${i + 1}. staff.id ${account.staffId}  (role=${account.role}, status=${account.status})`);
    lines.push(`     auth.users.id ${account.userId}`);
    lines.push(
      emailChanges
        ? `     email    : ${show(account.currentEmailInDb)}  ->  ${show(account.spec.newEmail)}`
        : `     email    : ${show(account.currentEmailInDb)}  (unchanged)`,
    );
    lines.push(`     password : ${describePassword(account.spec.newPassword)}  (will be set)`);
    lines.push(`     email_confirm : true  (forces the address confirmed)`);
    lines.push(`     public.staff.email -> ${show(account.spec.newEmail)}  (same run, kept in lock-step)`);
    lines.push("");
  });

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Database work
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolves every account against `public.staff` BEFORE any write happens, so an
 * unresolvable account aborts the run with the database untouched.
 */
export async function preflight(
  client: SupabaseClient,
  accounts: AccountSpec[],
): Promise<ResolvedAccount[]> {
  const resolved: ResolvedAccount[] = [];
  const problems: string[] = [];

  for (const spec of accounts) {
    const { data, error } = await client
      .from("staff")
      .select("id, user_id, email, role, status")
      .ilike("email", spec.currentEmail);

    if (error) {
      problems.push(`${maskEmail(spec.currentEmail)}: staff lookup failed — ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) {
      problems.push(`${maskEmail(spec.currentEmail)}: no public.staff row with that email`);
      continue;
    }
    if (data.length > 1) {
      problems.push(
        `${maskEmail(spec.currentEmail)}: ${data.length} staff rows share that email — ambiguous, refusing`,
      );
      continue;
    }

    const row = data[0] as {
      id: string;
      user_id: string | null;
      email: string;
      role: string;
      status: string;
    };

    if (!row.user_id) {
      problems.push(
        `${maskEmail(spec.currentEmail)}: staff row ${row.id} has no user_id — ` +
          `no auth user to update (staff/auth already diverged; fix that first)`,
      );
      continue;
    }

    resolved.push({
      spec,
      staffId: row.id,
      userId: row.user_id,
      currentEmailInDb: row.email,
      role: row.role,
      status: row.status,
    });
  }

  if (problems.length > 0) {
    throw new Error(
      `Pre-flight failed for ${problems.length} of ${accounts.length} account(s). ` +
        `Nothing was written.\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
  }

  return resolved;
}

/**
 * Applies one account: auth first, then the staff row, then the audit entry.
 *
 * If the staff update fails after auth succeeded, the two are diverged — that
 * throws DivergenceError and halts the whole run rather than continuing and
 * leaving an unknown number of accounts in that state.
 */
export async function applyAccount(
  client: SupabaseClient,
  account: ResolvedAccount,
): Promise<void> {
  const { error: authError } = await client.auth.admin.updateUserById(account.userId, {
    email: account.spec.newEmail,
    password: account.spec.newPassword,
    email_confirm: true,
  });

  if (authError) {
    throw new Error(
      `auth update failed for staff ${account.staffId} — ${authError.message}. ` +
        `No staff row was touched; auth and staff are still consistent.`,
    );
  }

  const { error: staffError } = await client
    .from("staff")
    .update({ email: account.spec.newEmail })
    .eq("id", account.staffId);

  if (staffError) {
    throw new DivergenceError(
      `DIVERGENCE: auth.users ${account.userId} was updated to the new email but ` +
        `public.staff ${account.staffId} was NOT (${staffError.message}). ` +
        `Repair by setting staff.email for that id to the new address, then re-run. ` +
        `Halting so no further account can diverge.`,
    );
  }

  // Audit trail. Records WHICH fields changed, never the values that are secret.
  const { error: logError } = await client.from("activity_logs").insert({
    staff_id: account.staffId,
    action: "staff_login_reset",
    entity_type: "staff",
    entity_id: account.staffId,
    old_values: { email: account.currentEmailInDb },
    new_values: {
      email: account.spec.newEmail,
      password: "[reset]",
      email_confirm: true,
      source: "scripts/reset-staff-logins.ts",
    },
  });

  if (logError) {
    throw new Error(
      `Credentials for staff ${account.staffId} were changed but the activity_logs ` +
        `entry failed to write (${logError.message}). The change is real but unaudited — ` +
        `record it manually. Halting.`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * `deps` exists so the dry-run path can be proven end-to-end against a stub
 * client without a live project. Production callers pass nothing.
 */
export interface MainDeps {
  createClient?: (url: string, key: string, opts?: unknown) => SupabaseClient;
  log?: (line: string) => void;
}

export async function main(argv: string[], deps: MainDeps = {}): Promise<number> {
  const options = parseArgs(argv);
  const makeClient = deps.createClient ?? createClient;
  const log = deps.log ?? ((line: string) => console.log(line));

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing environment. Both are required and must never be committed:\n" +
        "  SUPABASE_URL=https://<project-ref>.supabase.co\n" +
        "  SUPABASE_SERVICE_ROLE_KEY=<service role key>",
    );
    return 1;
  }

  // GUARD — before any client is built, before anything is read or written.
  const guard = assertRefMatch(supabaseUrl, serviceRoleKey, {
    acceptUnverifiableRef: options.acceptUnverifiableRef,
  });

  const config = loadConfig(options.configPath);

  log("staff login reset");
  log(`  project        : ${guard.urlRef ?? "(local)"}`);
  log(`  ref verified   : ${guard.verified ? "yes" : "NO — override in force"}`);
  log(`  mode           : ${options.apply ? "APPLY (will write)" : "DRY RUN (writes nothing)"}`);
  log(`  accounts       : ${config.accounts.length}`);
  log(`  emails         : ${options.unmask ? "shown" : "masked (--unmask to show)"}`);
  log("");

  const client = makeClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const resolved = await preflight(client, config.accounts);

  log("intended changes:");
  log("");
  log(renderDiff(resolved, options.unmask));

  if (!options.apply) {
    log("DRY RUN — nothing was written. Re-run with --apply to execute.");
    return 0;
  }

  for (const [i, account] of resolved.entries()) {
    log(`applying ${i + 1}/${resolved.length} — staff ${account.staffId} ...`);
    await applyAccount(client, account);
    log(`  done, audited in activity_logs`);
  }

  log("");
  log(`Applied ${resolved.length} account(s). auth and public.staff are in lock-step.`);
  return 0;
}

// Only self-execute when run directly, so the module stays importable by tests.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error("");
      console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      process.exit(1);
    });
}
