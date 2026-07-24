/**
 * Staff-holiday workflow — "never silent" + supervisor-as-primary-owner
 * (Lee's requirements, 2026-07-24).
 *
 * Locks, at the source-contract level:
 *  1. The RLS migration: targeted reads, staff inserts, mark-read, and the
 *     cover-staff shift-takeover policy (fixes the silent rota corruption).
 *  2. Every workflow link fires a TARGETED notification via the single
 *     write path (src/lib/staffNotify.ts).
 *  3. The shift-reassign error is CHECKED (an agent's Accept can no longer
 *     silently fail to move the shift).
 *  4. Supervisor can reach approvals: route, role-gated page, sidebar item.
 *  5. Locale keys exist in en/es/nl.
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

describe("1 — RLS migration (20260724130000)", () => {
  const sql = migration("20260724130000");

  it("notifications: targeted read + staff broadcast + admin oversight", () => {
    expect(sql).toMatch(/admin_user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/admin_user_id IS NULL AND public\.is_staff\(auth\.uid\(\)\)/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Admins view notification logs"/);
  });

  it("staff can INSERT notifications (scoped to is_staff, not WITH CHECK(true))", () => {
    expect(sql).toMatch(/"Staff create notifications"[\s\S]{0,120}FOR INSERT TO authenticated[\s\S]{0,60}WITH CHECK \(public\.is_staff\(auth\.uid\(\)\)\)/);
  });

  it("mark-as-read UPDATE policy exists (own rows / admins)", () => {
    expect(sql).toMatch(/"Users mark own notifications read"[\s\S]{0,150}FOR UPDATE/);
  });

  it("cover staff can take over ONLY their accepted shifts, ONLY to themselves", () => {
    expect(sql).toMatch(/"Cover staff take over accepted shifts"[\s\S]{0,700}c\.status = 'accepted'/);
    expect(sql).toMatch(/WITH CHECK \(\s*staff_id = \(SELECT id FROM public\.staff WHERE user_id = auth\.uid\(\) LIMIT 1\)\s*\)/);
  });
});

describe("2 — every link notifies, through the single write path", () => {
  const holidays = read("src/hooks/useStaffHolidays.ts");
  const covers = read("src/hooks/useShiftCovers.ts");

  it("request → approvers (supervisor primary + admin oversight)", () => {
    expect(holidays).toMatch(/getApproverUserIds\(\)/);
    expect(holidays).toMatch(/eventType: "holiday\.requested"/);
  });

  it("review → the requesting agent, with the outcome", () => {
    expect(holidays).toMatch(/eventType: `holiday\.\$\{status\}`/);
    expect(holidays).toMatch(/getStaffContact\(data\.staff_id\)/);
  });

  it("cover request → the covering staff member, actionable wording", () => {
    expect(covers).toMatch(/eventType: "shift_cover\.requested"/);
    expect(covers).toMatch(/accept or decline/i);
  });

  it("cover response → supervisors/admins + the requester", () => {
    expect(covers).toMatch(/eventType: `shift_cover\.\$\{status\}`/);
    expect(covers).toMatch(/getApproverUserIds\(\)/);
  });

  it("staffNotify targets every row (no broadcast rows from this workflow)", () => {
    const lib = read("src/lib/staffNotify.ts");
    expect(lib).toMatch(/admin_user_id/);
    expect(lib).toMatch(/filter\(\(u\): u is string => !!u\)/);
    // insert errors are checked, never swallowed
    expect(lib).toMatch(/if \(error\)[\s\S]{0,120}console\.error/);
  });

  it("INVARIANT: no notification_log write outside staffNotify/notifications utils", () => {
    const allowed = ["src/lib/staffNotify.ts", "src/utils/notifications.ts"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) {
          const rel = p.replace(ROOT + "/", "");
          if (allowed.includes(rel) || rel.startsWith("src/test/") || rel.includes("integrations/supabase")) continue;
          const src = readFileSync(p, "utf8");
          if (/from\(["']notification_log["']\)\s*\.\s*insert/.test(src)) offenders.push(rel);
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});

describe("3 — shift reassignment can no longer fail silently", () => {
  it("respondToCover checks the staff_shifts update error and throws", () => {
    const covers = read("src/hooks/useShiftCovers.ts");
    expect(covers).toMatch(/const \{ error: reassignError \}/);
    expect(covers).toMatch(/if \(reassignError\)[\s\S]{0,200}throw new Error/);
  });
});

describe("4 — supervisor reaches approvals", () => {
  it("route exists on the call-centre surface (requireStaff, NOT requireAdmin)", () => {
    const app = read("src/App.tsx");
    expect(app).toMatch(/path="holiday-approvals" element=\{<HolidayApprovalsPage \/>\}/);
  });

  it("page gates on the approver roles and reuses the shared implementation", () => {
    const page = read("src/pages/call-centre/HolidayApprovalsPage.tsx");
    expect(page).toMatch(/HOLIDAY_APPROVER_ROLES/);
    expect(page).toMatch(/from "@\/pages\/admin\/HolidaysPage"/);
    expect(page).toMatch(/Navigate to="\/call-centre\/holidays"/);
  });

  it("approver roles = supervisor primary + admins", () => {
    const lib = read("src/lib/staffNotify.ts");
    expect(lib).toMatch(/"call_centre_supervisor",\s*\n\s*"admin",\s*\n\s*"super_admin",/);
  });

  it("sidebar shows the item only to approver roles", () => {
    const sidebar = read("src/components/layout/CallCentreSidebar.tsx");
    expect(sidebar).toMatch(/canApproveHolidays/);
    expect(sidebar).toMatch(/staffRole === "call_centre_supervisor"/);
    expect(sidebar).toMatch(/sidebar\.holidayApprovals/);
  });
});

describe("5 — locale keys", () => {
  it.each(["en", "es", "nl"])("%s has sidebar.holidayApprovals", (loc) => {
    const d = JSON.parse(read(`src/i18n/locales/${loc}.json`));
    expect(d.sidebar?.holidayApprovals, `${loc}: sidebar.holidayApprovals`).toBeTruthy();
  });
});
