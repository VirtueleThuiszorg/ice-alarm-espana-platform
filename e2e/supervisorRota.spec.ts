import { test, expect } from "@playwright/test";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";

/**
 * The supervisor's two journeys from the rota brief's item 6, in a real browser:
 *
 *   1. log in → /call-centre/rota → all four operators are on the week → EDIT a shift
 *   2. log in → the holidays screen → Mary reads 18 used and 12 left
 *
 * ── WHY A BROWSER, GIVEN EVERYTHING ELSE THAT COVERS THIS ───────────────────
 *
 * Three other things already assert pieces of this and none of them can assert the whole:
 *
 *   src/test/rotaAccess.test.tsx      WHO may mount the page (a stubbed component)
 *   src/test/rotaPersonFilter.test.tsx  the grid, in jsdom, with the page imported directly
 *   scripts/rls/isolation.sql          that a supervisor's ROLE really does see all 339 rows
 *
 * What none of them touches is the leg an actual supervisor depends on: that logging in as
 * `call_centre_supervisor` gets you through `ProtectedRoute` to a route under `/call-centre`,
 * that the lazy chunk loads in the production bundle, and that the edit control on the grid is
 * reachable and writes. A page that works in jsdom and 404s behind the real route guard looks
 * identical in a unit test.
 *
 * REAL here: the production build, Chromium, the router, `AuthContext`, `ProtectedRoute`,
 * `supabase-js`, react-query, and both pages. STUBBED: Supabase's HTTP surface only.
 *
 * NOT proven here, and not pretended: that RLS returns those rows to her. The stub ignores
 * filters and answers as the database would for somebody allowed to read everything — which is
 * exactly why the policy itself is asserted in the RLS harness, where the claim can be tested
 * against real policies. A browser cannot see RLS at all.
 */

test.use({ serviceWorkers: "block" });

const SUPERVISOR: StaffRow = {
  id: "staff-mary",
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Mary",
  last_name: "Bonner",
  email: "supervisor@icealarm.es",
  role: "call_centre_supervisor",
  is_active: true,
  is_on_call: false,
};

const PASSWORD = "Supervisor123";

const ALBERT = "staff-albert";
const CARMEN = "staff-carmen";
const TRAVIS = "staff-travis";

/** Monday of the week containing Thursday 10 September 2026. */
const MONDAY = "2026-09-07";

const shift = (staffId: string, date: string, type: "morning" | "afternoon" | "night") => ({
  id: `${staffId}-${date}-${type}`,
  staff_id: staffId,
  shift_date: date,
  shift_type: type,
  start_time: { morning: "07:00:00", afternoon: "15:00:00", night: "23:00:00" }[type],
  end_time: { morning: "15:00:00", afternoon: "23:00:00", night: "07:00:00" }[type],
  is_confirmed: false,
  notes: null,
  created_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
});

/** The four operators on the rota, plus the supervisor who runs it. */
const STAFF_ROWS = [
  { id: SUPERVISOR.id, first_name: "Mary", last_name: "Bonner", role: "call_centre_supervisor", status: "active", is_active: true, personal_mobile: null, hire_date: "2019-03-01", annual_holiday_days: 30, email: SUPERVISOR.email, user_id: SUPERVISOR.user_id, is_on_call: false },
  { id: ALBERT, first_name: "Albert", last_name: "Soares", role: "call_centre", status: "active", is_active: true, personal_mobile: null, hire_date: "2020-01-06", annual_holiday_days: 30, email: "asoares@icealarm.es", user_id: null, is_on_call: false },
  { id: CARMEN, first_name: "Carmen", last_name: "Nicolas", role: "call_centre", status: "active", is_active: true, personal_mobile: null, hire_date: "2021-06-15", annual_holiday_days: 30, email: "cnicolas@icealarm.es", user_id: null, is_on_call: false },
  { id: TRAVIS, first_name: "Travis", last_name: "Nelison", role: "call_centre", status: "active", is_active: true, personal_mobile: null, hire_date: "2022-09-01", annual_holiday_days: 30, email: "travis@icealarm.es", user_id: null, is_on_call: false },
];

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/staff/login");
  await page.locator('input[type="email"]').fill(SUPERVISOR.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/call-centre$/);
}

test.describe("a supervisor runs the rota", () => {
  test("sees all four operators on the week, and can edit a shift", async ({ page }) => {
    // The grid is anchored on today's week, so the clock is pinned rather than the fixture being
    // written relative to whenever CI happens to run.
    await page.clock.setFixedTime(new Date("2026-09-10T09:00:00+02:00"));

    const stub = await installSupabaseStub(page, {
      staff: { ...SUPERVISOR },
      tables: {
        // The stub ignores filters, so this list doubles as "what the staff query returns".
        staff: STAFF_ROWS,
        staff_shifts: [
          shift(ALBERT, MONDAY, "morning"),
          shift(CARMEN, MONDAY, "afternoon"),
          shift(TRAVIS, MONDAY, "night"),
          shift(SUPERVISOR.id, "2026-09-10", "morning"),
        ],
        staff_on_shift_now: [],
      },
    });

    await signIn(page);

    // Clicked from the nav, not typed: the entry existing for a supervisor is half of what the
    // brief asked for, and a route nobody can reach is not a feature.
    await page.getByRole("link", { name: /^rota$/i }).first().click();
    await expect(page).toHaveURL(/\/call-centre\/rota$/);

    // All four operators have a row on this week.
    for (const name of ["Mary B.", "Albert S.", "Carmen N.", "Travis N."]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // The one thing a supervisor must NOT gain with the rota.
    await expect(page.getByText("Escalation", { exact: true })).toHaveCount(0);

    // EDIT: open Mary's own Thursday morning shift and save it.
    await page
      .getByRole("button", { name: /Edit Mary Bonner's Morning shift on 10 Sep/i })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /save|update/i }).click();

    // The write reached Supabase, against `staff_shifts`. Asserted on the RECORDED CALL rather
    // than on a toast: a toast can appear on an optimistic update that never left the browser.
    await expect
      .poll(() =>
        stub.calls.filter(
          (c) => c.path.startsWith("/rest/v1/staff_shifts") && c.method === "PATCH",
        ).length,
      )
      .toBeGreaterThan(0);
  });

  test("adding a shift is reachable by name, not by counting cells", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-10T09:00:00+02:00"));
    const stub = await installSupabaseStub(page, {
      staff: { ...SUPERVISOR },
      tables: { staff: STAFF_ROWS, staff_shifts: [], staff_on_shift_now: [] },
    });

    await signIn(page);
    await page.goto("/call-centre/rota");

    // Every cell's add button carries the person and the date. Before this it announced as
    // "button" with a plus icon inside, which is unusable with a screen reader and untestable
    // except by position.
    await page.getByRole("button", { name: /Add a shift for Travis Nelison on 10 Sep/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /add|create|save/i }).first().click();

    await expect
      .poll(() =>
        stub.calls.filter(
          (c) => c.path.startsWith("/rest/v1/staff_shifts") && c.method === "POST",
        ).length,
      )
      .toBeGreaterThan(0);
  });
});

test.describe("a supervisor reads the holiday balances", () => {
  test("Mary reads 18 used and 12 left, with the dates behind them", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-10T09:00:00+02:00"));

    await installSupabaseStub(page, {
      staff: { ...SUPERVISOR },
      tables: {
        staff: STAFF_ROWS,
        // The balances the 2026 backfill produces, as `staff_holiday_balance` reports them.
        staff_holiday_balance: [
          { staff_id: SUPERVISOR.id, first_name: "Mary", last_name: "Bonner", annual_holiday_days: 30, days_approved: 18, days_pending: 0, days_remaining: 12, days_used_or_pending: 18 },
          { staff_id: CARMEN, first_name: "Carmen", last_name: "Nicolas", annual_holiday_days: 30, days_approved: 28, days_pending: 0, days_remaining: 2, days_used_or_pending: 28 },
          { staff_id: ALBERT, first_name: "Albert", last_name: "Soares", annual_holiday_days: 30, days_approved: 16, days_pending: 0, days_remaining: 14, days_used_or_pending: 16 },
        ],
        staff_holidays: [
          {
            id: "hol-mary-jul",
            staff_id: SUPERVISOR.id,
            start_date: "2026-07-18",
            end_date: "2026-07-21",
            total_days: 4,
            status: "approved",
            reason: "imported from 2026 rota sheet",
            reviewed_by: null,
            reviewed_at: "2026-09-10T00:00:00Z",
            review_notes: null,
            created_at: "2026-09-10T00:00:00Z",
            staff: { first_name: "Mary", last_name: "Bonner", role: "call_centre_supervisor" },
          },
        ],
        staff_shifts: [],
        system_settings: [],
      },
    });

    await signIn(page);

    // The holidays screen a supervisor reaches — the same admin page, mounted for her.
    await page.goto("/call-centre/holiday-approvals");

    const maryRow = page.locator('[data-testid="per-person-row"]', { hasText: "Mary Bonner" });
    await expect(maryRow).toHaveCount(1);
    // 30 entitlement, 18 approved, 12 remaining — the figures the backfill asserts on production.
    await expect(maryRow).toContainText("30");
    await expect(maryRow).toContainText("18");
    await expect(maryRow).toContainText("12");
    // And the dates behind the number, because a balance with no dates cannot be checked.
    await expect(maryRow).toContainText("18 Jul–21 Jul (4)");

    // The other two operators the sheet names, on the same screen.
    await expect(
      page.locator('[data-testid="per-person-row"]', { hasText: "Carmen Nicolas" }),
    ).toContainText("2");
    await expect(
      page.locator('[data-testid="per-person-row"]', { hasText: "Albert Soares" }),
    ).toContainText("14");
  });
});
