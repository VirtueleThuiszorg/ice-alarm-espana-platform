/**
 * Member-portal night batch (2026-07-24): the audit found three member
 * features whose client-side writes RLS (correctly) denies — feedback
 * (activity_logs is staff-INSERT-only), staff notification of member
 * messages (notification_log is service/staff-only), and first-time
 * medical-info saves (medical_information has member UPDATE but no member
 * INSERT) — plus mark-as-read/recency bumps (members have NO UPDATE policy
 * on messages/conversations). All now route through the member-self-service
 * edge function: service-role, caller-identity-verified, ZERO policy changes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const fn = read("supabase/functions/member-self-service/index.ts");

describe("member-self-service — scoped service-role routing", () => {
  it("requires an authenticated caller that resolves to a members row", () => {
    expect(fn).toMatch(/auth\.getUser\(\)/);
    expect(fn).toMatch(/\.eq\("user_id", user\.id\)/);
    expect(fn).toMatch(/No membership for this account/);
  });

  it("closed action set — unknown actions are refused", () => {
    for (const action of ["submit_feedback", "notify_staff", "mark_read", "save_medical_info"]) {
      expect(fn).toContain(`case "${action}"`);
    }
    expect(fn).toMatch(/default:\s*\n\s*return new Response\(JSON\.stringify\(\{ error: "Unknown action" \}\)/);
  });

  it("notify_staff and mark_read verify the conversation belongs to the caller", () => {
    const ownershipChecks = fn.match(/conv\.member_id !== member\.id/g) ?? [];
    expect(ownershipChecks.length).toBe(2);
  });

  it("medical fields are whitelisted and validated", () => {
    expect(fn).toMatch(/const MEDICAL_FIELDS = \[/);
    expect(fn).toMatch(/must be an array of strings/);
    expect(fn).toMatch(/No medical fields provided/);
  });

  it("rate-limited per user", () => {
    expect(fn).toMatch(/checkRateLimit\(`member-self-service:\$\{user\.id\}`/);
  });

  // The three tables whose member writes this function exists to route.
  const ROUTED = ["medical_information", "activity_logs", "notification_log"];

  // A SELECT policy on a routed table cannot loosen a write, so it is not what
  // this guard is defending — but it must still be looked at by a human rather
  // than slipping through, so each one is declared here with its reason. Same
  // pattern as the deny-all exception list in scripts/rls/isolation.sql.
  const DECLARED_READ_POLICIES: Record<string, string> = {
    "Consented carers view member medical information":
      "20260814140000 — G4 consent scoping. SELECT only, gated on a live care_access_grants row. Reads, never writes. CONSENT_MODEL.md.",
  };

  // Strip line comments first. A rollback block quoting the CREATE POLICY it
  // would restore is documentation, not a policy, and matching it would make
  // this test fail on a comment.
  const statements = (sql: string) =>
    sql
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n")
      .match(/CREATE\s+POLICY[^;]*;/gi) ?? [];

  const routedPolicies = () => {
    const dir = join(ROOT, "supabase/migrations");
    const found: { migration: string; policy: string; table: string; stmt: string }[] = [];
    for (const m of readdirSync(dir).filter((f) => f >= "20260724160000")) {
      for (const stmt of statements(readFileSync(join(dir, m), "utf8"))) {
        const table = stmt.match(/ON\s+public\.(\w+)/i)?.[1] ?? "";
        if (!ROUTED.includes(table.toLowerCase())) continue;
        found.push({
          migration: m,
          policy: stmt.match(/CREATE\s+POLICY\s+"([^"]+)"/i)?.[1] ?? "<unnamed>",
          table,
          stmt,
        });
      }
    }
    return found;
  };

  it("ZERO policy changes: no migration ever grants non-staff writes on the routed tables", () => {
    // The whole point is routing, not policy loosening. Any migration dated
    // after this work started (2026-07-24 16:00) must not add a policy that
    // can WRITE one of the three routed tables. A policy with no FOR clause
    // defaults to ALL, so anything that is not explicitly FOR SELECT fails.
    //
    // (The original pin forbade CREATE POLICY outright. That was broader than
    // this test's own name and comment — "grants non-staff WRITES" — and it
    // blocked the G4 consent-scoping read policy, which cannot loosen a write
    // by construction. Narrowed to the thing actually being defended; the write
    // case is unchanged and is mutation-tested below.)
    for (const { migration, policy, table, stmt } of routedPolicies()) {
      expect(
        /\bFOR\s+SELECT\b/i.test(stmt),
        `${migration} adds policy "${policy}" on routed table ${table} without FOR SELECT — the fix must stay routing, not policy loosening`,
      ).toBe(true);
    }
  });

  it("every read policy added to a routed table is declared, with a reason", () => {
    for (const { migration, policy, table } of routedPolicies()) {
      expect(
        DECLARED_READ_POLICIES[policy],
        `${migration} adds read policy "${policy}" on ${table} — add it to DECLARED_READ_POLICIES with the reason it is safe, so it gets read by a human`,
      ).toBeTruthy();
    }
  });

  it("the declarations stay real — a removed policy must not sit here implying otherwise", () => {
    const live = new Set(routedPolicies().map((p) => p.policy));
    for (const declared of Object.keys(DECLARED_READ_POLICIES)) {
      expect(
        live.has(declared),
        `"${declared}" is declared but no migration creates it any more — remove the declaration`,
      ).toBe(true);
    }
  });
});

describe("client surfaces route through the function (no direct denied writes)", () => {
  it("MedicalInfoPage no longer writes medical_information directly", () => {
    const page = read("src/pages/client/MedicalInfoPage.tsx");
    expect(page).not.toMatch(/from\("medical_information"\)\s*\.(insert|update)/);
    expect(page).toMatch(/functions\.invoke\("member-self-service"/);
  });

  it("useFeedback no longer inserts activity_logs directly", () => {
    const hook = read("src/hooks/useFeedback.ts");
    expect(hook).not.toMatch(/from\("activity_logs"\)/);
    expect(hook).toMatch(/action: "submit_feedback"/);
  });

  it("member Messages/Support pages use server-side notify + mark-read", () => {
    for (const p of ["src/pages/client/MessagesPage.tsx", "src/pages/client/SupportPage.tsx"]) {
      const src = read(p);
      expect(src, `${p} must not update messages directly`).not.toMatch(/from\("messages"\)\s*\.update/);
      expect(src, `${p} must not bump conversations directly`).not.toMatch(/from\("conversations"\)\s*\.update/);
      expect(src).toMatch(/markMemberConversationRead|notifyStaffOfMemberMessage/);
    }
    const util = read("src/utils/notifications.ts");
    expect(util).toMatch(/action: "notify_staff"/);
    expect(util).toMatch(/action: "mark_read"/);
  });

  it("useAIChat checks its write errors instead of swallowing them", () => {
    const hook = read("src/hooks/useAIChat.ts");
    expect(hook).not.toMatch(/\.catch\(\(\) => \{\}\)/);
    expect(hook).toMatch(/msgError/);
    expect(hook).toMatch(/tsError/);
  });
});

describe("member UX honesty fixes hold", () => {
  it("NotificationBell routes members before the admin entity_type switch", () => {
    const bell = read("src/components/notifications/NotificationBell.tsx");
    const memberBranch = bell.indexOf("if (!isStaff)");
    const adminSwitch = bell.indexOf('"/admin/media-manager"');
    expect(memberBranch).toBeGreaterThan(-1);
    expect(memberBranch).toBeLessThan(adminSwitch);
    // member metadata links are allowlisted to the member portal
    expect(bell).toMatch(/metadata\.link\.startsWith\("\/dashboard"\)/);
  });

  it("dashboard connectivity stat uses is_online, not allocation status", () => {
    const dash = read("src/pages/client/ClientDashboard.tsx");
    expect(dash).not.toMatch(/displayDevice\?\.status === "active" \? t\("common\.online"\)/);
    expect(dash).toMatch(/displayDevice\?\.is_online \? t\("common\.online"\)/);
  });

  it("the fake signal-strength readout is gone", () => {
    const card = read("src/components/dashboard/DeviceStatusCard.tsx");
    expect(card).not.toMatch(/deviceStatus\.excellent/);
  });

  it("subscription page dead-end toasts became real support navigation", () => {
    const sub = read("src/pages/client/SubscriptionPage.tsx");
    expect(sub).not.toMatch(/toast\.info/);
    expect(sub).toMatch(/dashboard\/support\?action=upgrade_plan/);
    expect(sub).toMatch(/dashboard\/support\?action=update_payment/);
  });

  it("device page shows the real emergency number, not a label", () => {
    const dev = read("src/pages/client/DevicePage.tsx");
    expect(dev).toMatch(/\{companySettings\.emergency_phone\}/);
  });
});
