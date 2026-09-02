/**
 * Production fix — /complete-registration RLS failure.
 *
 * Root cause: the page did a DIRECT client-side INSERT into members, which RLS
 * correctly denies (members INSERT is staff/service-role only; golden rule #4:
 * members are created by the paid join flow, never client-side). Every signup
 * completing through this page failed with "new row violates row-level
 * security policy for table members".
 *
 * The fix links the authenticated user to their EXISTING member row via the
 * complete-member-registration edge function. These tests lock the properties
 * that make the fix correct AND safe:
 *   1. the page no longer inserts into members client-side
 *   2. the edge function NEVER creates a member row (no INSERT — membership
 *      comes only from the paid join flow)
 *   3. linking requires a CONFIRMED email (account-takeover guard) and never
 *      re-links a row owned by a different auth user
 *   4. no RLS policy was touched — the fix is routing, not policy loosening
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/pages/auth/CompleteRegistration.tsx"),
  "utf8",
);
const fnSource = readFileSync(
  join(process.cwd(), "supabase/functions/complete-member-registration/index.ts"),
  "utf8",
);

describe("fix 1 — the client no longer inserts into members", () => {
  it("CompleteRegistration has no direct members insert", () => {
    expect(pageSource).not.toMatch(/from\(["']members["']\)\s*\.insert/);
  });

  it("CompleteRegistration calls the edge function instead", () => {
    expect(pageSource).toContain('invoke("complete-member-registration"');
  });

  it("the no-membership case routes to the paid join flow, not a free insert", () => {
    expect(pageSource).toMatch(/no_membership[\s\S]{0,300}navigate\("\/join"\)/);
  });
});

describe("fix 2 — the edge function can only LINK, never CREATE", () => {
  it("contains no INSERT into members anywhere", () => {
    expect(fnSource).not.toMatch(/from\(["']members["']\)[\s\S]{0,80}?\.insert/);
    // and no upsert either (which could create)
    expect(fnSource).not.toContain(".upsert");
  });

  it("updates are scoped to the single matched member row", () => {
    expect(fnSource).toMatch(/\.update\(\{ \.\.\.profileUpdates, user_id: user\.id \}\)\s*\.eq\("id", member\.id\)/);
  });

  it("only whitelisted profile fields can be written", () => {
    expect(fnSource).toContain("PROFILE_FIELDS");
    // email and user-controlled ids are NOT in the whitelist
    expect(fnSource).not.toMatch(/PROFILE_FIELDS = \[[^\]]*"email"/s);
    expect(fnSource).not.toMatch(/PROFILE_FIELDS = \[[^\]]*"user_id"/s);
  });
});

describe("fix 3 — linking guards", () => {
  it("requires a confirmed email before linking (account-takeover guard)", () => {
    expect(fnSource).toMatch(/email_confirmed_at[\s\S]{0,120}confirmed_at/);
    expect(fnSource).toContain("email_not_confirmed");
  });

  it("refuses to re-link a member owned by a different auth user (409)", () => {
    expect(fnSource).toMatch(/member\.user_id && member\.user_id !== user\.id/);
    expect(fnSource).toMatch(/status:\s*409/);
  });

  it("matches the member by the caller's own verified email only", () => {
    expect(fnSource).toMatch(/\.ilike\("email", user\.email\)/);
    // the client cannot supply a different lookup email
    expect(fnSource).not.toMatch(/profileInput\[["']email["']\]/);
  });
});

describe("fix 4 — no policy loosening, no other client-side member inserts appeared", () => {
  it("no migration in this change loosens members INSERT (fix is routing-only)", () => {
    // The fix ships no new migration at all; assert the members INSERT
    // policies on disk are still the original staff-scoped ones.
    const migrationsDir = join(process.cwd(), "supabase/migrations");
    const allMigrations = readdirSync(migrationsDir).filter((m) => m.endsWith(".sql"));
    const baseName = allMigrations.find((m) => m.startsWith("20260121143325"));
    expect(baseName, "base schema migration present").toBeTruthy();
    const base = readFileSync(join(migrationsDir, baseName!), "utf8");
    expect(base).toContain('CREATE POLICY "Staff can manage members"');
    for (const m of allMigrations) {
      const src = readFileSync(join(migrationsDir, m), "utf8");
      // No policy grants public/authenticated INSERT on members.
      const loosened = /CREATE POLICY[^;]*ON public\.members[^;]*FOR INSERT[^;]*(anon|authenticated)/is.test(src);
      expect(loosened, `members INSERT policy loosened in ${m}`).toBe(false);
    }
  });

  it("no non-staff page inserts into members client-side", () => {
    const SRC = join(process.cwd(), "src");
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(name)) out.push(p);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.includes("/test/")) continue;
      // Staff/admin surfaces legitimately insert as staff under RLS.
      if (file.includes("/admin/") || file.includes("/call-centre/")) continue;
      const src = readFileSync(file, "utf8");
      if (/from\(["']members["']\)\s*\.insert/.test(src)) offenders.push(file.replace(SRC, "src"));
    }
    // The list was `["src/components/partner/ResidentialDashboard.tsx"]` — the
    // partner "add resident" flow, pinned as known-broken. That insert is now
    // gone: no partner INSERT policy on `members` ever allowed it, it omitted
    // five NOT NULL columns, and the design it needs (who pays for a resident)
    // is still an open decision. The screen explains that instead.
    //
    // Empty is the correct state, and it must stay empty: any client-side
    // member insert outside a staff surface fails this test by name.
    expect(offenders, `Client-side member inserts outside staff surfaces: ${offenders.join(", ")}`).toEqual([]);
  });
});
