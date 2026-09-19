import { test, expect } from "@playwright/test";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";

/**
 * The operator's courtesy call, in a real browser, at the two widths the layout changes at.
 *
 * ── WHY A BROWSER, GIVEN WHAT ALREADY COVERS THIS ───────────────────────────
 *
 *   src/test/courtesyCallDialog.test.tsx  what the dialog WRITES (jsdom, component imported)
 *   src/test/courtesyCall.test.ts         the outcome vocabulary, cross-checked against the SQL
 *   scripts/rls/isolation.sql             what `close_courtesy_call` does, on real PostgreSQL
 *
 * None of them can see a layout. `xl:grid-cols-5` is a class string in jsdom: a typo in the
 * breakpoint, a parent without `min-h-0`, or a `ScrollArea` that collapses to nothing all look
 * identical to a passing unit test, and the operator gets a letterbox they cannot work a call in.
 * This is also the only place that proves the dashboard row OPENS the thing at all.
 *
 * REAL: the production build, Chromium, the router, AuthContext, ProtectedRoute, supabase-js,
 * react-query, the dashboard and the dialog. STUBBED: Supabase's HTTP surface only.
 */

test.use({ serviceWorkers: "block" });

const OPERATOR: StaffRow = {
  id: "staff-cora",
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Cora",
  last_name: "Operator",
  email: "operator@icealarm.es",
  role: "call_centre",
  is_active: true,
  is_on_call: false,
};

const PASSWORD = "Operator123";

const MEMBER_ID = "member-rosa";
const TASK_ID = "task-rosa-september";

const courtesyTask = {
  id: TASK_ID,
  title: "Monthly Courtesy Call - Rosa Cortes",
  description: "Monthly check-in call for Rosa Cortes.",
  member_id: MEMBER_ID,
  task_type: "courtesy_call",
  priority: "normal",
  status: "pending",
  due_date: "2026-09-19T17:00:00.000Z",
  created_at: "2026-09-19T08:00:00.000Z",
  completed_at: null,
  assigned_to: null,
  created_by: null,
  draft_notes: null,
  outcome: null,
  attempt_count: 0,
  member: { id: MEMBER_ID, first_name: "Rosa", last_name: "Cortes", phone: "+34600300001" },
};

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/staff/login");
  await page.locator('input[type="email"]').fill(OPERATOR.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/call-centre$/);
}

async function openTheCall(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date("2026-09-19T09:00:00+02:00"));
  await installSupabaseStub(page, {
    staff: { ...OPERATOR },
    tables: {
      staff: [OPERATOR],
      tasks: [courtesyTask],
      members: [
        {
          id: MEMBER_ID,
          first_name: "Rosa",
          last_name: "Cortes",
          phone: "+34600300001",
          status: "active",
          courtesy_calls_enabled: true,
          courtesy_call_frequency: "monthly",
          next_courtesy_call_date: "2026-09-19",
        },
      ],
      member_notes: [],
      alerts: [],
      staff_on_shift_now: [],
    },
  });

  await signIn(page);
  await page.getByTestId("courtesy-row").first().click();
  await expect(page.getByTestId("courtesy-call-dialog")).toBeVisible();
}

test.describe("the courtesy call workspace", () => {
  test("at 1280 the record and the call sit side by side", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTheCall(page);

    const record = page.getByTestId("courtesy-call-record");
    const panel = page.getByTestId("courtesy-call-panel");
    await expect(record).toBeVisible();
    await expect(panel).toBeVisible();

    const left = await record.boundingBox();
    const right = await panel.boundingBox();
    expect(left, "the record column has no box").toBeTruthy();
    expect(right, "the call panel has no box").toBeTruthy();

    // SIDE BY SIDE, not stacked: the panel starts to the right of where the record ends.
    expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width - 2);

    // 60/40, give or take a pixel of rounding. A 50/50 split would pass "side by side" while
    // leaving the record too narrow to read a whole address in.
    const total = left!.width + right!.width;
    expect(left!.width / total).toBeGreaterThan(0.5);
    expect(left!.width / total).toBeLessThan(0.7);
  });

  test("at 1024 it is one column, full height, and still workable", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await openTheCall(page);

    const record = page.getByTestId("courtesy-call-record");
    const panel = page.getByTestId("courtesy-call-panel");
    const left = await record.boundingBox();
    const right = await panel.boundingBox();

    // STACKED: the panel begins below the record rather than beside it.
    expect(right!.y).toBeGreaterThan(left!.y);

    // And nothing has collapsed to a sliver — the notes box is the control the operator types
    // into for the whole call, so it is the one worth asserting is actually usable.
    const notes = await page.getByTestId("courtesy-call-notes").boundingBox();
    expect(notes!.height).toBeGreaterThan(60);
    expect(notes!.width).toBeGreaterThan(300);
  });

  test("the operator can work the call: number, checklist, notes, outcome", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTheCall(page);

    // Scoped to the panel: the dashboard row behind the dialog shows the number too, and an
    // unscoped locator would be ambiguous — and would pass even if the panel showed nothing.
    await expect(
      page.getByTestId("courtesy-call-panel").getByText("+34600300001", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("courtesy-call-dial")).toHaveAttribute(
      "href",
      "tel:+34600300001",
    );

    // Close is refused until the operator says how the call ended — the one field that decides
    // whether the member is marked as seen.
    await expect(page.getByTestId("courtesy-close-call")).toBeDisabled();

    await page.getByLabel("Is the pendant being worn?").click();
    await page.getByTestId("courtesy-call-notes").fill("All well. Daughter visiting Sunday.");
    await page.getByLabel("Spoke to member").click();

    await expect(page.getByTestId("courtesy-close-call")).toBeEnabled();
  });

  test("an unanswered call says out loud that it stays open", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTheCall(page);

    await page.getByLabel("No answer").click();
    await expect(page.getByText(/stays open and a retry is raised/)).toBeVisible();
  });
});
