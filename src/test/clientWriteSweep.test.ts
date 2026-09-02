/**
 * Client-write sweep (Lee, 2026-07-24): every client-side insert/update into
 * an RLS-protected sensitive table was enumerated and classified. This suite
 * pins the results so the class cannot regress or silently grow:
 *
 *  FIXED here:
 *   - /partner application: anon INSERT into partners → partner-apply fn
 *   - staff self-writes (on-call toggle, own preferences): new self-update
 *     policy + privilege-escalation guard trigger
 *
 *  KNOWN-BROKEN or RULE-VIOLATING, awaiting Lee's product decisions
 *  (pinned as an exact list — a NEW offender fails this suite):
 *   - partner ResidentialDashboard members insert (no partner RLS path)
 *
 *  CLOSED since:
 *   - admin wizard PaymentStep client-side member+subscription activation.
 *     AddMemberWizard was replaced with an honest "not available" notice, which
 *     left all ten step components orphaned — nothing imported them, and they
 *     still referenced a WizardData type the page no longer exported, so they
 *     could not compile either. Deleted 2026-09-02. That removed the golden
 *     rule #4 violation and, with it, a form that collected a card number,
 *     expiry and CVC into React state and sent them nowhere.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function migration(prefix: string): string {
  const dir = join(ROOT, "supabase/migrations");
  const f = readdirSync(dir).find((m) => m.startsWith(prefix));
  expect(f, `migration ${prefix}* must exist`).toBeDefined();
  return readFileSync(join(dir, f!), "utf8");
}

describe("partner application goes through the server", () => {
  it("PartnerOnboarding invokes partner-apply and no longer inserts partners", () => {
    const page = read("src/pages/partner/PartnerOnboarding.tsx");
    expect(page).toMatch(/functions\.invoke\("partner-apply"/);
    expect(page).not.toMatch(/from\(["']partners["']\)\s*\.insert/);
  });

  it("partner-apply is service-role scoped, whitelisted, deduped, rate-limited, and NEVER creates an auth account", () => {
    const fn = read("supabase/functions/partner-apply/index.ts");
    expect(fn).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(fn).toMatch(/APPLICATION_FIELDS/);
    expect(fn).toMatch(/checkRateLimit/);
    expect(fn).toMatch(/duplicate: true/);
    expect(fn).toMatch(/status: "pending"/);
    expect(fn).not.toMatch(/auth\.admin|createUser|signUp/);
  });

  it("partner-apply is registered anon-callable in config.toml", () => {
    const config = read("supabase/config.toml");
    expect(config).toMatch(/\[functions\.partner-apply\]\s*\n\s*verify_jwt = false/);
  });

  it("no migration loosens the partners INSERT policy for anon/authenticated", () => {
    const dir = join(ROOT, "supabase/migrations");
    for (const m of readdirSync(dir)) {
      const sql = readFileSync(join(dir, m), "utf8");
      const anonPartnerInsert = /CREATE POLICY[^;]*ON public\.partners[^;]*FOR INSERT[^;]*;/gi;
      for (const match of sql.match(anonPartnerInsert) ?? []) {
        expect(match, `${m} adds a partners INSERT policy — the fix must be routing, not policy loosening`).toMatch(/service_role/);
      }
    }
  });
});

describe("staff self-update policy + escalation guard (20260724150000)", () => {
  const sql = migration("20260724150000");

  it("self-update policy is scoped to the caller's own row", () => {
    expect(sql).toMatch(/"Staff update own row"[\s\S]{0,120}FOR UPDATE TO authenticated[\s\S]{0,80}USING \(user_id = auth\.uid\(\)\)/);
  });

  it("guard trigger keeps ALL privileged fields immutable for non-super-admins", () => {
    for (const field of ["role", "is_active", "status", "user_id", "escalation_priority", "annual_holiday_days"]) {
      expect(sql, `guard must protect ${field}`).toMatch(new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`));
    }
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it("guard exempts service role (edge functions must keep working)", () => {
    expect(sql).toMatch(/auth\.role\(\) = 'service_role'/);
  });
});

describe("sweep invariant — the broken/violating list cannot silently grow", () => {
  // Tables where a NON-STAFF surface writing client-side is the bug class.
  const SENSITIVE = ["members", "partners", "staff", "subscriptions"];
  // Surfaces executed by non-staff users (anon / member / partner).
  const NON_STAFF_DIRS = ["src/pages/auth", "src/pages/client", "src/pages/partner", "src/pages/join", "src/components/partner"];
  // The pinned, Lee-acknowledged exceptions (awaiting product decisions).
  const KNOWN = new Set([
    "src/components/partner/ResidentialDashboard.tsx", // partner→members insert, broken, needs partner-member design
  ]);

  it("no NEW client-side write to a sensitive table from a non-staff surface", () => {
    const pattern = new RegExp(
      `\\.from\\(["'](${SENSITIVE.join("|")})["']\\)\\s*\\.(insert|update|upsert|delete)`,
      "s",
    );
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && pattern.test(readFileSync(p, "utf8"))) {
          offenders.push(p.replace(ROOT + "/", ""));
        }
      }
    };
    for (const d of NON_STAFF_DIRS) {
      try { walk(join(ROOT, d)); } catch { /* dir may not exist */ }
    }
    const allowedSelfService = new Set([
      // Members' own-row writes are covered by real RLS policies (verified):
      "src/pages/client/ProfilePage.tsx",           // members self-UPDATE policy
      "src/pages/client/EmergencyContactsPage.tsx", // "Members can manage own contacts"
      "src/pages/partner/PartnerSettingsPage.tsx",  // "Partners can update own record"
      "src/components/partner/AgreementRequiredModal.tsx", // "Partners can sign agreements" + own-record update
    ]);
    const unexpected = offenders.filter((o) => !KNOWN.has(o) && !allowedSelfService.has(o));
    expect(
      unexpected,
      `NEW client-side sensitive-table write on a non-staff surface: ${unexpected.join(", ")} — route it through a server-side function (pattern: complete-member-registration / partner-apply)`,
    ).toEqual([]);
    // …and the known-broken pin must still be accurate (fixing it should update this test)
    expect(offenders.filter((o) => KNOWN.has(o))).toEqual([...KNOWN]);
  });
});
