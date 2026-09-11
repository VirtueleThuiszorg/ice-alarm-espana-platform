import { test, expect, type Page } from "@playwright/test";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";

/**
 * THE CALL-CENTRE SHELL MUST FIT THE PHONE IT IS READ ON.
 *
 * ── HOW THIS WAS FOUND ──────────────────────────────────────────────────────
 *
 * Not by a test. While photographing the member record at 390px for the visual pass, the whole
 * document turned out to be 325px wider than the viewport. Most of that was the member header's
 * own action row and it was fixed there; 34px was left over and belonged to the SHELL — the
 * sticky bar with the duty toggle on the left and five icon buttons on the right, neither group
 * able to wrap or shrink. That is on EVERY call-centre page, not one record.
 *
 * ── WHY IT MATTERS MORE HERE THAN ON A MARKETING PAGE ───────────────────────
 *
 * A page that scrolls sideways puts its right-hand controls off-screen until somebody swipes.
 * On this shell the right-hand end is the notification bell and the user menu, and the LEFT end
 * is the duty toggle — the control that decides whether the escalation ladder rings this
 * operator's mobile. An operator checking their duty state on a phone should not have to
 * discover that the page moves.
 *
 * ── WHAT THIS ASSERTS ───────────────────────────────────────────────────────
 *
 * `documentElement.scrollWidth` against `clientWidth`, on four pages at two widths. 390 is the
 * iPhone the on-call supervisor actually carries; 360 is the floor for Android, and it is here
 * because a fix tuned to exactly 390 is a fix that fails on the next phone.
 *
 * When it fails it names the widest offending element rather than just the number, because
 * "the page is 34px too wide" sends you looking and "the header's right-hand group ends at
 * 424" tells you.
 */

test.use({ serviceWorkers: "block" });

const OPERATOR: StaffRow = {
  id: "staff-operator-1",
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Carmen",
  last_name: "Nicolás",
  email: "operator@icealarm.es",
  role: "call_centre",
  is_active: true,
  is_on_call: true,
};
const PASSWORD = "Operator123";

/**
 * ON DUTY, deliberately. It is the wider of the two states — the button reads "On Duty" with a
 * shield — and a width test that quietly picks the narrow state is a width test that passes.
 */
const tables = {
  members: [],
  alerts: [],
  staff_shifts: [],
  devices: [],
  subscriptions: [],
  emergency_contacts: [],
  notification_log: [],
  admin_ideas: [],
  member_monitoring_readiness: [],
};

async function signIn(page: Page) {
  await installSupabaseStub(page, { staff: { ...OPERATOR }, tables });
  await page.goto("/staff/login");
  await page.locator('input[type="email"]').fill(OPERATOR.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/call-centre$/);
}

/** The widest thing sticking out past the right edge, so a failure says where to look. */
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const excess = root.scrollWidth - root.clientWidth;
    if (excess <= 1) return { excess, worst: [] as string[] };
    const vw = root.clientWidth;
    const worst: { right: number; label: string }[] = [];
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0) {
        worst.push({
          right: r.right,
          label: `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> right=${r.right.toFixed(0)}`,
        });
      }
    });
    worst.sort((a, b) => b.right - a.right);
    return { excess, worst: worst.slice(0, 4).map((w) => w.label) };
  });
}

const PAGES = [
  ["Dashboard", "/call-centre"],
  ["Members", "/call-centre/members"],
  ["Alerts", "/call-centre/alerts"],
  ["My shifts", "/call-centre/my-shifts"],
] as const;

/** 390 is the iPhone in the supervisor's pocket; 360 is the Android floor. */
const WIDTHS = [390, 360] as const;

for (const width of WIDTHS) {
  test(`the call-centre shell fits ${width}px on every page`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page);

    const failures: string[] = [];
    for (const [name, path] of PAGES) {
      await page.goto(path);
      // The shell, not the route's content — the header is what this is about, and waiting on
      // it means a slow page cannot make the measurement pass by being empty.
      await expect(page.getByTestId("duty-toggle")).toBeVisible();

      const { excess, worst } = await overflowReport(page);
      if (excess > 1) failures.push(`${name} (${path}): ${excess}px over — ${worst.join(" | ")}`);

      await page.screenshot({
        path: `e2e/.report/shell-${name.toLowerCase().replace(/\s+/g, "-")}-${width}.png`,
        fullPage: false,
      });
    }

    expect(failures, `pages scrolling sideways at ${width}px`).toEqual([]);
  });
}
