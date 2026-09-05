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
 *  CLOSED since:
 *   - admin wizard PaymentStep client-side member+subscription activation:
 *     the whole orphaned wizard is deleted on fix/payment-activation. It was
 *     never caught by the sweep below — src/components/admin/wizard is a staff
 *     surface — so it is recorded here and nowhere else.
 *   - partner ResidentialDashboard members insert: removed. The insert could
 *     never have succeeded — no partner INSERT policy on `members`, and it
 *     omitted five NOT NULL columns — and the design it needs is still an open
 *     decision (payer vs monitored member, MEMBER_ONBOARDING.md Q1). The screen
 *     now says so instead of offering a button that fails.
 *
 *  KNOWN-BROKEN or RULE-VIOLATING, awaiting Lee's product decisions
 *  (pinned as an exact list — a NEW offender fails this suite):
 *   - none. The list is empty, and it must stay that way: a new entry means a
 *     non-staff surface started writing a sensitive table client-side again.
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
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function migration(prefix: string): string {
  const dir = join(ROOT, "supabase/migrations");
  const f = readdirSync(dir).find((m) => m.startsWith(prefix));
  expect(f, `migration ${prefix}* must exist`).toBeDefined();
  return readFileSync(join(dir, f!), "utf8");
}

describe("partner application goes through the server", () => {
  it("no client calls partner-apply at all — the public application path is retired", () => {
    // Stronger than the assertion this replaces. That one required the application
    // page to go through the server rather than inserting `partners` directly; the
    // page is now gone, so the sharper claim is that nothing in the client invokes
    // the function, and nothing inserts `partners` from the browser either.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
        if (full.includes(`${sep}test${sep}`)) continue;
        const src = readFileSync(full, "utf8");
        if (/functions\.invoke\(\s*["']partner-apply["']/.test(src)) offenders.push(full);
        if (/from\(["']partners["']\)\s*\.insert/.test(src)) offenders.push(full);
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders, `still reach the application path: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the application page itself is gone from the bundle", () => {
    expect(existsSync(join(ROOT, "src/pages/partner/PartnerOnboarding.tsx"))).toBe(false);
    expect(read("src/App.tsx")).not.toMatch(/PartnerOnboarding/);
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
  // Empty — and the assertion at the end of this test keeps it honest, so an
  // entry cannot be added here without the offending file actually existing.
  const KNOWN = new Set<string>([]);

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

  it("ResidentialDashboard does not write to members, and says why", () => {
    // The specific regression this closes: a partner-facing screen inserting a
    // monitored person straight from the browser. It is worth its own assertion
    // rather than relying on the sweep, because the sweep only fails when the
    // file reappears in a list — this fails on the exact write coming back.
    const dash = read("src/components/partner/ResidentialDashboard.tsx");
    expect(dash, "no client-side insert into members").not.toMatch(
      /from\(["']members["']\)\s*\.insert/,
    );
    expect(dash, "no client-side write to subscriptions either").not.toMatch(
      /from\(["']subscriptions["']\)\s*\.(insert|update|upsert|delete)/,
    );
    expect(
      dash,
      "the screen must explain that adding a resident is not available, not just drop the button",
    ).toMatch(/addUnavailable/);
  });
});
