import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { installSupabaseStub } from "./helpers/supabaseStub";

/**
 * "LAST TESTED …" ON THE MEMBER'S OWN DASHBOARD, in a real browser.
 *
 * `protectionChecklist.test.tsx` proves what the rung DECIDES from a row, and it proves it against
 * a mocked `t` that substitutes placeholders the way i18next does. What it cannot prove is that
 * the sentence survives the whole chain — the readiness view read on the dashboard, the threshold
 * read from `system_settings` through react-query, the real i18n bundle with the real
 * interpolation, and `date-fns` formatting a real date in the reader's locale.
 *
 * That chain is where this kind of change actually breaks: a placeholder that reaches the screen
 * as `{{date}}`, a key that exists in en.json and not in the loaded namespace, or "Invalid Date"
 * printed in a sentence about somebody's alarm. All three look fine in jsdom with a stub.
 *
 * The three states the brief asks to see, and one more it does not: tested 10 days ago, tested
 * 200 days ago, never tested, and a threshold moved to 30 so the ROW is shown to be doing
 * something rather than assumed to be.
 */

test.use({ serviceWorkers: "block" });

const MEMBER_ID = "mem-ana";
const USER_ID = "f330e208-3648-4c99-8e04-79876d204e50";
const EMAIL = "ana@example.test";
const PASSWORD = "Member123";

const MEMBER_ROW = {
  id: MEMBER_ID,
  user_id: USER_ID,
  first_name: "Ana",
  last_name: "Ruiz",
  email: EMAIL,
  phone: "+34600111222",
  date_of_birth: "1943-04-11",
  address_line_1: "Calle Mayor 1",
  address_line_2: null,
  city: "Almería",
  province: "Almería",
  postal_code: "04001",
  country: "Spain",
  nie_dni: "X1234567L",
  preferred_language: "en",
  photo_url: null,
  status: "active",
  urbanizacion: null,
  bloque: null,
  portal: null,
  escalera: null,
  away_from: null,
  away_until: null,
  pendant_with_member: null,
  created_at: "2026-01-01T00:00:00Z",
};

/** A member WITH a pendant — the only shape in which a test date means anything. */
const SUBSCRIPTION = {
  id: "sub-1",
  member_id: MEMBER_ID,
  status: "active",
  plan_type: "single",
  billing_frequency: "monthly",
  has_pendant: true,
  amount: 24.95,
  renewal_date: "2026-10-01",
};

const DEVICE = {
  id: "dev-1",
  member_id: MEMBER_ID,
  device_type: "EV-07B",
  status: "live",
  is_online: true,
  battery_level: 82,
  last_checkin_at: new Date().toISOString(),
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

interface Case {
  testedAt: string | null;
  thresholdRow: string | null;
}

async function signInAsMember(page: Page, c: Case) {
  const settings = [
    { key: "settings_emergency_phone", value: "+34 950 473 199" },
    { key: "settings_company_name", value: "ICE Alarm España" },
    ...(c.thresholdRow === null
      ? []
      : [{ key: "pendant_test_reminder_days", value: c.thresholdRow }]),
  ];

  await installSupabaseStub(page, {
    staff: null,
    partner: null,
    roleInfo: {
      is_staff: false,
      staff_role: null,
      is_partner: false,
      partner_id: null,
      member_id: MEMBER_ID,
    },
    tables: {
      members: [MEMBER_ROW],
      subscriptions: [SUBSCRIPTION],
      devices: [DEVICE],
      system_settings: settings,
      member_monitoring_readiness: [
        {
          member_id: MEMBER_ID,
          monitoring_ready: true,
          emergency_contact_count: 2,
          device_tested_at: c.testedAt,
        },
      ],
      orders: [],
      order_items: [],
      alerts: [],
      emergency_contacts: [],
      medical_information: [],
      member_access: [],
      member_notification_optin: [],
      pricing_plans: [],
      pricing_settings: [],
    },
  });

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function pendantRung(page: Page) {
  const rung = page.getByTestId("protection-rung-pendant");
  await expect(rung).toBeVisible();
  return rung;
}

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}

/** Nothing in any of these states may render a raw placeholder or a broken date. */
async function expectNoLeakedTemplate(page: Page) {
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body, "an uninterpolated placeholder reached the screen").not.toContain("{{");
  expect(body, "date-fns printed its failure into a sentence").not.toContain("Invalid Date");
  expect(body, "a missing translation key rendered as its own key").not.toContain(
    "protection.pendant",
  );
}

test.describe("the member dashboard", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("tested 10 days ago — the date is shown and nothing is being asked", async ({
    page,
  }, testInfo) => {
    await signInAsMember(page, { testedAt: daysAgo(10), thresholdRow: "90" });
    const rung = await pendantRung(page);

    await expect(rung).toHaveAttribute("data-state", "ok");
    // The DATE, formatted — the thing that was read from the view and then thrown away.
    await expect(rung).toContainText(/Last tested \d{1,2} \w+/);
    await expect(rung).toContainText("Your pendant is tested and checking in.");
    await expect(page.getByTestId("protection-action-pendant")).toHaveText("See your pendant");
    await expect(page.getByTestId("protection-action-pendant")).toHaveAttribute(
      "href",
      "/dashboard/device",
    );

    await expectNoLeakedTemplate(page);
    await shoot(page, testInfo, "pendant-tested-10-days");
  });

  test("tested 200 days ago — a different sentence, a different button, STILL ok", async ({
    page,
  }, testInfo) => {
    /*
      `data-state` is asserted here in a browser as well as in the unit suite because it is the
      one thing in this change that must not drift: `action_needed` paints the rung in the alert
      family and tells a member something is WRONG with their alarm. Nothing is — the pendant is
      online, the membership is active, an operator is watching.
    */
    await signInAsMember(page, { testedAt: daysAgo(200), thresholdRow: "90" });
    const rung = await pendantRung(page);

    await expect(rung).toHaveAttribute("data-state", "ok");
    await expect(rung).toContainText("It has been a while since your pendant was tested.");
    await expect(rung).toContainText(/Last tested \d{1,2} \w+/);
    await expect(page.getByTestId("protection-action-pendant")).toHaveText("Arrange a test");
    // The SAME destination the awaiting-test branch uses. One way to arrange a test with us.
    await expect(page.getByTestId("protection-action-pendant")).toHaveAttribute(
      "href",
      "/dashboard/support",
    );

    await expectNoLeakedTemplate(page);
    await shoot(page, testInfo, "pendant-tested-200-days");
  });

  test("NEVER tested — the old sentence, and no talk of 'a while'", async ({ page }, testInfo) => {
    // "It has been a while" is false about something that has not happened yet.
    await signInAsMember(page, { testedAt: null, thresholdRow: "90" });
    const rung = await pendantRung(page);

    await expect(rung).toHaveAttribute("data-state", "in_progress");
    await expect(rung).toContainText("We still need to test your pendant with you on the phone.");
    await expect(rung).not.toContainText("a while");
    await expect(rung).not.toContainText("Last tested");

    await expectNoLeakedTemplate(page);
    await shoot(page, testInfo, "pendant-never-tested");
  });

  /*
    THE ROW MOVES THE THRESHOLD — the point of the setting existing at all. Without this pair the
    row could be absent, misspelled or unreadable and every assertion above would still pass on
    the built-in default, which is exactly the silent failure the whitelist migration exists to
    prevent: a number an admin edits that changes nothing.

    TWO TESTS AND NOT ONE, and the first attempt was one. Signing in twice in a single test
    reuses the page, and `usePendantTestReminderDays` has a five-minute `staleTime` — so the
    second sign-in read the FIRST threshold out of react-query's cache and the assertion failed
    on a fact about caching rather than about the setting. Playwright gives each test a fresh
    context, which is what a member gets too.
  */
  test("45 days is current when the row says 90", async ({ page }) => {
    await signInAsMember(page, { testedAt: daysAgo(45), thresholdRow: "90" });
    await expect(await pendantRung(page)).toContainText("Your pendant is tested and checking in.");
  });

  test("…and overdue when the row says 30", async ({ page }) => {
    await signInAsMember(page, { testedAt: daysAgo(45), thresholdRow: "30" });
    await expect(await pendantRung(page)).toContainText("It has been a while");
  });

  test("a missing row falls back to 90 and does NOT switch the prompt off", async ({ page }) => {
    // "We could not read the threshold" must never become "your fourteen-month-old test is
    // current". The fallback is the default, never a disabled prompt.
    await signInAsMember(page, { testedAt: daysAgo(400), thresholdRow: null });
    await expect(await pendantRung(page)).toContainText("It has been a while");
  });
});
