import { test, expect } from "@playwright/test";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";

/**
 * An operator finds their own shifts, in a real browser: log in → the sidebar offers "My shifts"
 * → the page lists Thursday 10 September (Lee's rota brief, item 6).
 *
 * ── WHY A BROWSER AND NOT ANOTHER UNIT TEST ─────────────────────────────────
 *
 * `src/test/myShiftsPage.test.tsx` proves what the page renders from rows, and asserts every
 * filter the queries carry. It cannot prove the legs an operator actually depends on: that the
 * route is REACHABLE behind `ProtectedRoute` with a restored `supabase-js` session, that the
 * nav entry is there to click, and that the lazy chunk loads in the production bundle. A page
 * that works in jsdom and 404s in the app looks identical in a unit test.
 *
 * REAL here: the production build, Chromium, the router, `AuthContext`, `ProtectedRoute`, the
 * sidebar, `supabase-js`, react-query and the page. STUBBED: Supabase's HTTP surface only.
 *
 * NOT proven here, and not pretended: that RLS returns only this operator's rows. The stub
 * ignores filters, so the query's `.eq("staff_id", …)` is asserted in the vitest suite and the
 * policy itself in the RLS harness. A browser cannot see either.
 */

test.use({ serviceWorkers: "block" });

const OPERATOR: StaffRow = {
  id: "staff-carmen",
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Carmen",
  last_name: "Nicolás",
  email: "operator@icealarm.es",
  role: "call_centre",
  is_active: true,
  is_on_call: false,
};

const PASSWORD = "Operator123";

/** Thursday 10 September 2026 — the first day the seeded rota holds. */
const THE_DAY = "2026-09-10";

const shift = (id: string, shift_date: string, shift_type: string, start: string, end: string) => ({
  id,
  staff_id: OPERATOR.id,
  shift_date,
  shift_type,
  start_time: start,
  end_time: end,
  is_confirmed: false,
  notes: null,
  created_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
});

test.describe("an operator's own shifts", () => {
  test("reaches My shifts from the sidebar and sees Thursday 10 September", async ({ page }) => {
    // The page's windows are all relative to today, so the clock is pinned rather than the
    // fixtures being written relative to whenever CI happens to run. `setFixedTime` fakes Date
    // only — react-query's timers keep working.
    await page.clock.setFixedTime(new Date("2026-09-10T09:00:00+02:00"));

    await installSupabaseStub(page, {
      staff: { ...OPERATOR },
      tables: {
        staff_shifts: [
          shift("sh-1", THE_DAY, "morning", "07:00:00", "15:00:00"),
          shift("sh-2", "2026-09-11", "afternoon", "15:00:00", "23:00:00"),
        ],
      },
    });

    await page.goto("/staff/login");
    await page.locator('input[type="email"]').fill(OPERATOR.email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/call-centre$/);

    // Clicked, not typed into the address bar: the nav entry existing for a plain operator is
    // half of what item 1 asked for, and a route nobody can reach is not a feature.
    await page
      .getByRole("link", { name: /my shifts/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/call-centre\/my-shifts$/);

    const row = page.locator(`[data-testid="my-shift-row"][data-shift-date="${THE_DAY}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Thu 10 Sep");
    await expect(row).toContainText("07:00");
    await expect(row).toContainText("8h");

    // Grouped under its own week, with the week's hours — two shifts, sixteen hours.
    await expect(page.getByText("Week of 7 Sep")).toBeVisible();
    await expect(page.locator('[data-testid="my-shift-row"]')).toHaveCount(2);
  });

  test("the rota itself is NOT offered to a plain operator, and typing the URL lands here", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-09-10T09:00:00+02:00"));
    await installSupabaseStub(page, {
      staff: { ...OPERATOR },
      tables: { staff_shifts: [shift("sh-1", THE_DAY, "morning", "07:00:00", "15:00:00")] },
    });

    await page.goto("/staff/login");
    await page.locator('input[type="email"]').fill(OPERATOR.email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/call-centre$/);

    // No Rota entry: managing everyone's shifts is the supervisor's job.
    await expect(page.getByRole("link", { name: /^rota$/i })).toHaveCount(0);

    // And the guard sends a typed URL to the operator's own shifts rather than to an error.
    await page.goto("/call-centre/rota");
    await expect(page).toHaveURL(/\/call-centre\/my-shifts$/);
  });
});
