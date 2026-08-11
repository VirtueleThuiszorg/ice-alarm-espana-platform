/**
 * Partner registration contract tests.
 *
 * Context: `public.partners` was found empty on prod while an auth user existed for
 * a submitted registration. Tracing the /partner/join path established:
 *
 *  - `PartnerJoin.onSubmit` invokes the `partner-register` edge function. It does
 *    not write `partners` itself, and it cannot: there is no INSERT policy on
 *    `public.partners`, so no anon/authenticated client can insert (proved against
 *    real PostgreSQL 16 — "new row violates row-level security policy", with the
 *    grants Supabase gives `authenticated` in place).
 *  - `partner-register` builds a SERVICE ROLE client, so its own insert bypasses
 *    RLS. RLS is therefore NOT a possible cause of a silently-missing row here.
 *  - The insert error IS checked, so it cannot fail silently either.
 *  - The exact insert, run against the schema the migrations define, SUCCEEDS.
 *
 * So the repo code and repo schema agree, and the failure is environmental — the
 * deployed function bytes or the deployed `partners` columns differ from the repo.
 * These tests pin the invariants that make that diagnosis checkable, and would
 * catch the whole bug class in CI rather than in production.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(path.resolve(root, p), "utf8");

const REGISTER_FN = "supabase/functions/partner-register/index.ts";
const MIGRATIONS_DIR = "supabase/migrations";

// ── helpers ────────────────────────────────────────────────────────────────

/** Column keys the function's `partners` insert writes. */
function insertedPartnerColumns(): string[] {
  const src = read(REGISTER_FN);

  const anchor = src.indexOf('.from("partners")');
  expect(anchor, `${REGISTER_FN} must insert into "partners"`).toBeGreaterThan(-1);

  const insertAt = src.indexOf(".insert({", anchor);
  expect(insertAt, "the partners write must be an .insert({...})").toBeGreaterThan(-1);

  // Walk braces from the opening `{` so nested objects can't truncate the block.
  const open = src.indexOf("{", insertAt);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const block = src.slice(open + 1, end);
  return [...block.matchAll(/^\s{6,8}([a-z_][a-z0-9_]*)\s*:/gim)].map((m) => m[1]);
}

/** Every column the migrations put on `public.partners`. */
function migratedPartnerColumns(): Set<string> {
  const columns = new Set<string>();
  const files = readdirSync(path.resolve(root, MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = read(path.join(MIGRATIONS_DIR, file));

    // CREATE TABLE public.partners ( ... )
    const create = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?partners\s*\(([\s\S]*?)\n\);/i);
    if (create) {
      for (const line of create[1].split("\n")) {
        const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s+[A-Za-z]/);
        // Skip table-level constraint lines.
        if (m && !/^(constraint|primary|unique|foreign|check)$/i.test(m[1])) {
          columns.add(m[1]);
        }
      }
    }

    // ALTER TABLE [public.]partners ... ADD COLUMN [IF NOT EXISTS] <name>
    // Handles both single-statement and multi-column forms.
    const alters = sql.matchAll(
      /ALTER TABLE\s+(?:public\.)?partners\b([\s\S]*?);/gi
    );
    for (const alter of alters) {
      for (const add of alter[1].matchAll(
        /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([a-z_][a-z0-9_]*)/gi
      )) {
        columns.add(add[1]);
      }
    }
  }

  return columns;
}

// ── the contract that would have caught this ───────────────────────────────

describe("partner-register insert matches the partners schema", () => {
  it("finds the insert block and the migrated column set", () => {
    expect(insertedPartnerColumns().length).toBeGreaterThan(15);
    expect(migratedPartnerColumns().size).toBeGreaterThan(20);
  });

  it("every column the function inserts exists in the migrations", () => {
    const inserted = insertedPartnerColumns();
    const migrated = migratedPartnerColumns();

    const missing = inserted.filter((c) => !migrated.has(c));

    // A column here means partner registration is broken in production the moment
    // this deploys: PostgREST rejects the whole insert with PGRST204, the function
    // returns 500, and no partners row is ever written.
    expect(missing, `columns inserted but never migrated: ${missing.join(", ")}`).toEqual([]);
  });

  it("covers the columns the join form actually collects", () => {
    // Named explicitly so a future rename cannot quietly drop one.
    const inserted = new Set(insertedPartnerColumns());
    for (const column of [
      "user_id",
      "contact_name",
      "last_name",
      "email",
      "referral_code",
      "status",
      "payout_iban",
      "payout_beneficiary_name",
      "preferred_language",
      "partner_type",
      "organization_type",
      "region",
      "how_heard_about_us",
      "motivation",
      "position_title",
      "current_client_base",
    ]) {
      expect(inserted.has(column), `partner-register must insert ${column}`).toBe(true);
    }
  });

  it("writes user_id, so the row can be linked back to the auth user", () => {
    const src = read(REGISTER_FN);
    expect(src).toMatch(/user_id:\s*authData\.user\.id/);
  });

  it("creates the row as pending, for the verify step to activate", () => {
    expect(read(REGISTER_FN)).toMatch(/status:\s*["']pending["']/);
  });
});

// ── the write path is server-side only, by RLS design ──────────────────────

describe("partners has no client-side insert path", () => {
  const partnersPolicies = () => {
    const files = readdirSync(path.resolve(root, MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const found: string[] = [];
    for (const file of files) {
      const sql = read(path.join(MIGRATIONS_DIR, file));
      for (const m of sql.matchAll(
        /CREATE POLICY\s+"([^"]+)"\s*\n?\s*ON public\.partners\s+FOR\s+([A-Z]+)/gi
      )) {
        found.push(`${m[2].toUpperCase()}:${m[1]}`);
      }
    }
    return found;
  };

  it("RLS is enabled on partners", () => {
    const files = readdirSync(path.resolve(root, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql"));
    const enabled = files.some((f) =>
      read(path.join(MIGRATIONS_DIR, f)).match(/ALTER TABLE public\.partners ENABLE ROW LEVEL SECURITY/i)
    );
    expect(enabled).toBe(true);
  });

  it("has NO dedicated INSERT policy — registration must go through the edge function", () => {
    const inserts = partnersPolicies().filter((p) => p.startsWith("INSERT:"));
    // Verified against real PostgreSQL 16: an authenticated non-staff user with the
    // usual grants gets "new row violates row-level security policy" on INSERT.
    // If this ever becomes non-empty, GOALS.md requires an isolation test proving
    // one partner cannot create or see another's row.
    expect(inserts).toEqual([]);
  });

  it("keeps partner self-service limited to reading and updating their own row", () => {
    const policies = partnersPolicies();
    expect(policies).toContain("SELECT:Partners can view own record");
    expect(policies).toContain("UPDATE:Partners can update own record");
  });

  it("partner-register uses the service-role key, so its insert is not subject to RLS", () => {
    const src = read(REGISTER_FN);
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).toMatch(/createClient\(supabaseUrl,\s*supabaseServiceKey/);
  });

  it("is publicly invokable, since the join form calls it unauthenticated", () => {
    const config = read("supabase/config.toml");
    expect(config).toMatch(/\[functions\.partner-register\]\s*\n\s*verify_jwt\s*=\s*false/);
  });

  it("the join form delegates to the function and never writes partners directly", () => {
    const src = read("src/pages/partner/PartnerJoin.tsx");
    expect(src).toMatch(/functions\.invoke\(\s*["']partner-register["']/);
    expect(src).not.toMatch(/from\(["']partners["']\)\s*\.?\s*\n?\s*\.insert/);
  });
});

// ── failures must be loud, and must not leave an orphan auth user ──────────

describe("partner-register failure handling", () => {
  it("checks the insert error rather than ignoring it", () => {
    expect(read(REGISTER_FN)).toMatch(/if \(partnerError\)/);
  });

  it("reports the real reason instead of a bare 'Failed to create partner record'", () => {
    // A generic 500 is why this took a production trace to diagnose: the actual
    // PostgREST message (e.g. PGRST204 column ... does not exist) never surfaced.
    const src = read(REGISTER_FN);
    expect(src).toMatch(/partnerError\.message/);
  });

  it("checks the auth-user cleanup, so a failed rollback cannot pass unnoticed", () => {
    // An unchecked deleteUser is how the orphan auth user survived a failed insert:
    // partners had no row, auth had a user, and nothing said so.
    const src = read(REGISTER_FN);
    expect(src).toMatch(/deleteUserError|cleanupError/);
  });
});

// ============================================================
//  No PII in logs (GOALS.md G2 / CLAUDE.md)
// ============================================================
//
// On a constraint violation Postgres puts the offending value in `details`
// verbatim — "Key (email)=(someone@example.com) already exists". Logging that
// writes an applicant's email address into production logs.
//
// This was a real regression: the error-surfacing change logged code, message,
// details and hint together, with a comment asserting it was "never user data".
// The comment was wrong about `details`.

describe("partner-register logs no PII", () => {
  const src = read(REGISTER_FN);

  it("does not log PostgREST `details`, which can quote the submitted value", () => {
    expect(src).not.toMatch(/details:\s*partnerError\.details/);
  });

  it("still records that details existed, so the diagnosis is not lost", () => {
    expect(src).toMatch(/had_details:\s*Boolean\(partnerError\.details\)/);
  });

  it("keeps code, message and hint, which carry the schema diagnosis", () => {
    expect(src).toMatch(/code:\s*partnerError\.code/);
    expect(src).toMatch(/message:\s*partnerError\.message/);
    expect(src).toMatch(/hint:\s*partnerError\.hint/);
  });

  it("does not return details to the client either", () => {
    expect(src).not.toMatch(/reason:\s*partnerError\.details/);
  });

  it("logs no email, password or IBAN field anywhere", () => {
    // Negative sweep over every console.* call in the function.
    const logCalls = [...src.matchAll(/console\.(error|warn|log)\(([\s\S]*?)\);/g)].map((m) => m[2]);
    for (const call of logCalls) {
      expect(call, `a console call references data.email: ${call.slice(0, 80)}`).not.toMatch(
        /data\.email|data\.password|data\.payout_iban/
      );
    }
  });
});

// Found during the same sweep and deliberately NOT fixed: partner-alert-notify
// logs `partner.email` (index.ts:186). That is the same G2 violation, but it sits
// on the ALERT path, which carries a mandatory human gate (CLAUDE.md / GOALS.md
// G1) and which this work was told not to touch. Pinned here so the finding is not
// lost — flip this to an assertion once a human has signed off on that file.
describe("known PII leak outside this change's scope", () => {
  it("partner-alert-notify still logs a partner email — alert path, human gate", () => {
    const src = read("supabase/functions/partner-alert-notify/index.ts");
    // Asserting the CURRENT state on purpose. When it is fixed under the gate, this
    // test fails and should be inverted, which is the reminder.
    expect(src).toMatch(/console\.log\(`Email notification to \$\{partner\.email\}/);
  });
});
