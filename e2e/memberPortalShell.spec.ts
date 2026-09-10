import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { installSupabaseStub } from "./helpers/supabaseStub";

/**
 * THE MEMBER PORTAL, IN A REAL BROWSER, AT THE TWO WIDTHS MEMBERS ACTUALLY USE.
 *
 * ── WHY A BROWSER AND NOT ANOTHER UNIT TEST ─────────────────────────────────
 *
 * `src/test/myPendantPage.test.tsx` proves what My pendant renders from rows, and
 * `memberPendantView.test.ts` proves the state derivation. Neither can prove the things this
 * page's redesign is actually about:
 *
 *   - that the route is REACHABLE behind `ProtectedRoute` with a restored session, and the lazy
 *     chunk loads in the PRODUCTION bundle;
 *   - that it LAYS OUT at 390px, which is the width most of these members read on. A card that
 *     overflows horizontally looks identical in jsdom, which has no viewport;
 *   - that no raw hex survived. `#25D366` was a computed background, and the assertion that it
 *     is gone is worth making against a real rendered style rather than against the source.
 *
 * REAL here: the production build, Chromium, the router, `AuthContext`, `ProtectedRoute`, the
 * sidebar, `supabase-js`, react-query and the pages. STUBBED: Supabase's HTTP surface only.
 *
 * The screenshots are the deliverable as much as the assertions: 390px and 1280px of My pendant
 * beside Profile, uploaded by the Page Audit workflow as artifacts.
 */

test.use({ serviceWorkers: "block" });

const MEMBER_ID = "mem-ana";
const USER_ID = "f330e208-3648-4c99-8e04-79876d204e50";
const EMAIL = "ana@example.test";
const PASSWORD = "Member123";

/** A phone-only member: no device, no pendant order. The state that may be sold to. */
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

const SUBSCRIPTION = {
  id: "sub-1",
  member_id: MEMBER_ID,
  status: "active",
  plan_type: "single",
  billing_frequency: "monthly",
  has_pendant: false,
  amount: 24.95,
  renewal_date: "2026-10-01",
};

const SETTINGS = [
  { key: "settings_emergency_phone", value: "+34 950 473 199" },
  { key: "settings_company_name", value: "ICE Alarm España" },
];

async function signInAsMember(page: Page) {
  await installSupabaseStub(page, {
    // No staff row and no partner row: `get_user_role_info` must answer with a member_id, which
    // is what sends the login to /dashboard rather than to the staff surface.
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
      system_settings: SETTINGS,
      // Every other table the portal fans out to answers empty, which is the phone-only
      // member's real shape: no device, no order, no alerts, no contacts.
      devices: [],
      orders: [],
      order_items: [],
      alerts: [],
      emergency_contacts: [],
      medical_information: [],
      member_access: [],
      member_notification_optin: [],
      member_monitoring_readiness: [],
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

/**
 * A screenshot ON DISK, not an inline attachment.
 *
 * `testInfo.attach({ body })` keeps the PNG in the report's own store, and the JSON reporter
 * this project uses does not write those out — so the screenshots existed only inside a run
 * that had already finished. Writing to `testInfo.outputPath` puts them under `test-results/`,
 * which is exactly what `page-audit.yml` uploads as an artifact, and attaching BY PATH keeps
 * them in the HTML report too.
 */
async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);
  /*
    `animations: "disabled"` because every portal page carries `animate-fade-in`, and the first
    1280px capture came out at about 15% opacity — a screenshot of a page mid-fade, which is
    worthless as a record of a layout. Playwright finishes running CSS animations and holds them
    at their end state, so the shot is the settled page.
  */
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}

/**
 * Nothing on the page may be wider than the page.
 *
 * The single most common phone defect, and the one jsdom cannot see at all. Checked on
 * `documentElement` rather than by walking every node: a horizontal scrollbar is the symptom a
 * member meets, whichever element causes it. 2px of tolerance for sub-pixel rounding.
 */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
  expect(
    overflow.scroll,
    `page scrolls horizontally: ${overflow.scroll}px of content in ${overflow.client}px`,
  ).toBeLessThanOrEqual(overflow.client + 2);
}

test.describe("My pendant, on the one page shell", () => {
  test("a phone-only member reaches it from the nav and is never called phone-only", async ({
    page,
  }) => {
    await signInAsMember(page);

    /*
      CLICKED, NOT TYPED — a route nobody can reach is not a feature. And it takes TWO clicks,
      which is worth writing down rather than working around.

      The portal sidebar groups its items under collapsible headings (Home / My Account /
      Services / Billing / Support), and a group is open only when a route inside it is already
      active. So on the dashboard, "My device" is not merely hidden — it is not in the DOM at
      all, which is why locating it by href found nothing here while `page.goto` worked fine.

      The test therefore does what a member does: open "Services", then choose the item. That
      is the existing nav design, not a defect this PR invents or silently changes; it is
      recorded in the portal-nav walk instead.
    */
    await page.getByRole("button", { name: /^services$/i }).click();
    const deviceLink = page.locator('a[href="/dashboard/device"]').first();
    await expect(deviceLink).toBeVisible();
    await deviceLink.click();
    await expect(page).toHaveURL(/\/dashboard\/device$/);

    // R5: the one page shell, and the subtitle from the state derivation.
    await expect(page.getByTestId("page-header")).toBeVisible();
    await expect(page.getByTestId("device-monitored-line")).toBeVisible();
    await expect(page.getByTestId("device-pendant-offer")).toBeVisible();

    /*
      THE WORD ITSELF. `hasPendant` was `subscription?.has_pendant && device`, so this branch
      was titled "Phone-Only membership" — and every member between paying for a pendant and the
      device being assigned landed in it too, told they had chosen a service they had paid to
      leave. Nobody is named for it now.
    */
    await expect(page.getByText(/phone.only/i)).toHaveCount(0);

    // "What You're Missing" — four red ✗ rows on the page a worried member opens.
    await expect(page.getByText(/what you.re missing/i)).toHaveCount(0);
  });

  test("no WhatsApp green anywhere on it — brand tokens only", async ({ page }) => {
    /*
      `bg-[#25D366] hover:bg-[#128C7E] text-white` was the last raw hex on the member surface:
      a third party's brand colour outside the token system, and white on #25D366 is 2.1:1 —
      below WCAG AA for text of any size, so it failed the bar GOALS.md sets while looking
      deliberate.

      Asserted against COMPUTED styles rather than the source, because a colour is a fact about
      what renders. rgb(37, 211, 102) is #25D366; rgb(18, 140, 126) is #128C7E.
    */
    await signInAsMember(page);
    await page.goto("/dashboard/device");
    await expect(page.getByTestId("device-monitored-line")).toBeVisible();

    const greens = await page.evaluate(() => {
      const banned = ["rgb(37, 211, 102)", "rgb(18, 140, 126)"];
      const hits: string[] = [];
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const style = getComputedStyle(el);
        for (const value of [style.backgroundColor, style.color, style.borderTopColor]) {
          if (banned.includes(value)) hits.push(`${el.tagName}.${el.className}: ${value}`);
        }
      }
      return hits;
    });
    expect(greens, `WhatsApp green still rendered: ${greens.join(" | ")}`).toEqual([]);

    // …and the WhatsApp affordance itself is still there, so this is not passing by deletion.
    await expect(page.getByTestId("device-whatsapp")).toBeVisible();
  });

  test("the emergency number is a link, not the biggest type in the portal", async ({ page }) => {
    // It was `text-3xl md:text-4xl font-bold` — 36-40px, larger than the page title R5 sets at
    // 28px, for a useful detail rather than the page's subject.
    await signInAsMember(page);
    await page.goto("/dashboard/device");

    const number = page.getByTestId("device-emergency-number");
    await expect(number).toBeVisible();
    await expect(number).toHaveAttribute("href", /^tel:/);

    const size = await number.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const title = await page
      .getByTestId("page-header")
      .locator("h1")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size, "the number outranks the page title").toBeLessThan(title);
    // …and still above R10's 16px body floor, because it is a number somebody reads out.
    expect(size).toBeGreaterThanOrEqual(16);
  });
});

/**
 * 390px is an iPhone 12/13/14 in portrait — the width most of these members read on. 1280px is
 * the desktop the office uses. Both, for both pages, because the redesign is a layout claim.
 */
for (const { name, width, height } of [
  { name: "390", width: 390, height: 844 },
  { name: "1280", width: 1280, height: 900 },
]) {
  test.describe(`at ${name}px`, () => {
    test.use({ viewport: { width, height } });

    test("My pendant lays out and does not scroll sideways", async ({ page }, testInfo) => {
      await signInAsMember(page);
      await page.goto("/dashboard/device");
      await expect(page.getByTestId("device-monitored-line")).toBeVisible();
      await expect(page.getByTestId("device-pendant-offer")).toBeVisible();
      // The product photograph, not a phone glyph standing in for the thing we sell.
      await expect(page.getByTestId("device-pendant-image")).toBeVisible();

      await expectNoHorizontalOverflow(page);

      await shoot(page, testInfo, `device-${name}`);
    });

    test("Profile lays out beside it and does not scroll sideways", async ({
      page,
    }, testInfo) => {
      /*
        PROFILE IS THE REFERENCE, which is why it is shot at the same two widths in the same
        run. "My pendant should look like Profile" is the whole design instruction, and two
        screenshots taken minutes apart in different conditions cannot settle whether it does.

        What Profile's own cards DO is asserted in `src/test/lockedIdentityFields.test.tsx` and
        proved in a browser by the locked-until-Edit work; here it is the comparison shell and
        the phone-width layout.
      */
      await signInAsMember(page);
      await page.goto("/dashboard/profile");
      await expect(page.getByTestId("page-header")).toBeVisible();
      // The record actually loaded — otherwise this is a screenshot of a skeleton.
      await expect(page.getByTestId("profile-locked-nie")).toContainText("X1234567L");

      await expectNoHorizontalOverflow(page);

      await shoot(page, testInfo, `profile-${name}`);
    });
  });
}
