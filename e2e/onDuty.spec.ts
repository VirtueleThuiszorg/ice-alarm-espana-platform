import { test, expect } from "@playwright/test";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";

/**
 * On duty, in a real browser: log in → go on duty → RELOAD → still on duty (Lee's dashboard
 * notes, 9 Sep, item 7).
 *
 * ── WHY A BROWSER AND NOT ANOTHER UNIT TEST ─────────────────────────────────
 *
 * `src/test/onDutyDeclaration.test.tsx` proves what the header WRITES. It cannot prove the leg
 * that actually matters to an operator: that the flag is READ BACK on the next page load, by a
 * real `supabase-js` session restored from localStorage, through the real router and the real
 * `AuthContext`. A duty flag that is written and then not re-read looks identical in a unit
 * test and puts an operator who believes they are on duty outside the escalation ladder.
 *
 * REAL here: the production bundle, Chromium, the router, `AuthContext`, `ProtectedRoute`,
 * `supabase-js` and its session persistence, and the header. STUBBED: Supabase's HTTP surface
 * only — and the `staff` row is stateful in the stub, so a reload reads back what the app wrote
 * rather than a value this test handed it.
 *
 * NOT proven here (and not pretended): RLS on `staff`, the migration, GoTrue's real behaviour,
 * or that `sos-escalation-runner` picks the operator up. The last of those is a live-backend
 * question and stays owed.
 */

test.use({ serviceWorkers: "block" });

const STAFF: StaffRow = {
  id: "s-1",
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Cara",
  last_name: "Ruiz",
  email: "operator@icealarm.es",
  role: "call_centre",
  is_active: true,
  is_on_call: false,
};

const PASSWORD = "Operator123";

test.describe("call-centre duty state", () => {
  test("goes on duty, survives a reload, and survives a logout", async ({ page }) => {
    const stub = await installSupabaseStub(page, { staff: { ...STAFF } });

    // ── log in ────────────────────────────────────────────────────────────
    await page.goto("/staff/login");
    await page.locator('input[type="email"]').fill(STAFF.email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    await expect(page).toHaveURL(/\/call-centre$/);

    // ── go on duty ────────────────────────────────────────────────────────
    const duty = page.getByTestId("duty-toggle");
    await expect(duty).toHaveAttribute("data-on-duty", "false");
    await duty.click();
    await expect(duty).toHaveAttribute("data-on-duty", "true");

    // It wrote the declaration, and wrote it against this operator's row.
    //
    // POLLED, not read straight after the click: the header updates the button OPTIMISTICALLY,
    // so `data-on-duty="true"` is on screen before the request has left. Asserting immediately
    // measured the optimistic paint and reported zero writes — which is also exactly the shape
    // of the bug an optimistic update can hide, so it is worth waiting for the real thing.
    const staffPatches = () =>
      stub.calls.filter((c) => c.path.startsWith("/rest/v1/staff?") && c.method === "PATCH");
    await expect.poll(() => staffPatches().length).toBeGreaterThanOrEqual(1);
    const patches = staffPatches();
    expect(patches.at(-1)!.body).toEqual({ is_on_call: true });
    expect(patches.at(-1)!.path).toContain("id=eq.s-1");
    expect(stub.staffRow()!.is_on_call).toBe(true);

    // The heartbeat opened a presence session — an observation, separate from the declaration.
    await expect
      .poll(() => stub.calls.filter((c) => c.path.startsWith("/rest/v1/staff_presence")).length)
      .toBeGreaterThanOrEqual(1);

    // ── reload: STILL ON DUTY ─────────────────────────────────────────────
    // The assertion Lee asked for. Read back from the stub's stored row, not from anything this
    // test is holding in memory.
    await page.reload();
    await expect(page.getByTestId("duty-toggle")).toHaveAttribute("data-on-duty", "true");
    await expect(page.getByTestId("duty-toggle")).toContainText(/on duty/i);

    // ── log out: warned, and the declaration is left standing ─────────────
    await page.getByRole("button", { name: /log out/i }).first().click();
    const warning = page.getByTestId("duty-logout-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/does not end your shift/i);

    await warning.getByRole("button", { name: /stay on duty and log out/i }).click();
    await expect(page).toHaveURL(/\/staff\/login/);
    expect(stub.staffRow()!.is_on_call).toBe(true); // <-- load-bearing

    // ── log back in: STILL ON DUTY ────────────────────────────────────────
    await page.locator('input[type="email"]').fill(STAFF.email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/call-centre$/);
    await expect(page.getByTestId("duty-toggle")).toHaveAttribute("data-on-duty", "true");
  });

  test("ending the shift from the logout warning does clear the flag", async ({ page }) => {
    // The other branch, so "stay on duty" is a CHOICE rather than the only outcome.
    const stub = await installSupabaseStub(page, {
      staff: { ...STAFF, is_on_call: true },
    });

    await page.goto("/staff/login");
    await page.locator('input[type="email"]').fill(STAFF.email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByTestId("duty-toggle")).toHaveAttribute("data-on-duty", "true");

    await page.getByRole("button", { name: /log out/i }).first().click();
    const warning = page.getByTestId("duty-logout-warning");
    await expect(warning).toBeVisible();
    await warning.getByRole("button", { name: /end shift and log out/i }).click();

    await expect(page).toHaveURL(/\/staff\/login/);
    await expect.poll(() => stub.staffRow()!.is_on_call).toBe(false);
  });
});
