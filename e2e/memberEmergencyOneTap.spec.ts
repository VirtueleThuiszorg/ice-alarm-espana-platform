import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { installSupabaseStub } from "./helpers/supabaseStub";

/**
 * THE 24-HOUR NUMBER, IN ONE TAP, ON A PHONE.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * The number lived at the bottom of the member sidebar. Below 768px that sidebar is a Sheet
 * behind the hamburger, so on every phone and on an iPad in portrait, reaching it was: find the
 * hamburger, wait for the sheet, scroll to the bottom of it, tap. Four actions, the first of
 * them a glyph — for the one control on this product that somebody reaches for while frightened.
 *
 * ── WHY IN A BROWSER, AND NOT IN JSDOM ──────────────────────────────────────
 *
 * Every claim here is about SPACE. `ClientLayout`'s mobile bar is 64px tall and fixed, and the
 * question this change turns on is whether a phone number fits in it beside a logo, an A/A
 * control and a menu button at 360px — with the A/A set to LARGE, which grows every rem in the
 * bar by a quarter. jsdom has no viewport and no layout; it would answer "yes" to all of it.
 *
 * So the widths are measured and printed, the digits are checked for where they are supposed to
 * be and gone where they cannot fit, and nothing is allowed to push the page sideways.
 *
 * WHAT IS ASSERTED ELSEWHERE: that the control cannot become a dead one, that it is outside the
 * Sheet in the source, and that the A/A and the readiness bar keep their documented places, are
 * in `src/test/memberEmergencyOneTap.test.ts` — claims about the file, checked against the file.
 */

test.use({ serviceWorkers: "block" });

const MEMBER_ID = "mem-ana";
const USER_ID = "f330e208-3648-4c99-8e04-79876d204e50";
const EMAIL = "ana@example.test";
const PASSWORD = "Member123";
/** Stored as S16 asks for it: international, with the `+34` that `waNumber` needs. */
const NUMBER = "+34 950 473 199";

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

async function signInAsMember(page: Page, settings: { key: string; value: string }[]) {
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
      system_settings: settings,
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

const WITH_NUMBER = [
  { key: "settings_emergency_phone", value: NUMBER },
  { key: "settings_company_name", value: "ICE Alarm España" },
];
/** The row absent entirely — which is the state production is in until somebody sets it. */
const WITHOUT_NUMBER = [{ key: "settings_company_name", value: "ICE Alarm España" }];

/** Every member route, because the control is layout chrome and must be on all of them. */
const MEMBER_ROUTES = [
  "/dashboard",
  "/dashboard/profile",
  "/dashboard/medical",
  "/dashboard/contacts",
  "/dashboard/device",
  "/dashboard/subscription",
  "/dashboard/support",
  "/dashboard/messages",
];

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scroll,
    `page scrolls horizontally: ${overflow.scroll}px of content in ${overflow.client}px`,
  ).toBeLessThanOrEqual(overflow.client + 2);
}

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}

/** The bar's own arithmetic, printed, so "it fits" is a number and not an opinion. */
async function measureBar(page: Page) {
  return page.evaluate(() => {
    const call = document.querySelector('[data-testid="mobile-emergency-number"]');
    const bar = call?.parentElement as HTMLElement | null;
    if (!bar) return null;
    const w = (el: Element | null | undefined) =>
      el ? Math.round(el.getBoundingClientRect().width) : 0;
    const children = Array.from(bar.children).map((el) => w(el));
    return {
      inner: Math.round(bar.getBoundingClientRect().width) - 32, // px-4 both sides
      used: children.reduce((a, b) => a + b, 0) + 8 * (children.length - 1), // gap-2
      call: w(call),
      digits: w(call?.querySelector("span")),
      rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
}

for (const width of [360, 390, 768]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("the number is one tap away on every member page, menu unopened", async ({
      page,
    }, testInfo) => {
      await signInAsMember(page, WITH_NUMBER);

      /*
        768px IS THE SIDEBAR'S WIDTH, NOT THE PHONE BAR'S. Tailwind's `md:` is min-width 768,
        so at exactly 768 the desktop rail is showing and its own block carries the number —
        one control per viewport, which is what the brief asks for. The claim being checked is
        the same at both: a `tel:` link on screen, reachable without opening anything.
      */
      const testId = width >= 768 ? "sidebar-emergency-number" : "mobile-emergency-number";

      for (const route of MEMBER_ROUTES) {
        await page.goto(route);
        const control = page.getByTestId(testId);
        await expect(control, `${route} at ${width}px`).toBeVisible();
        await expect(control).toHaveAttribute("href", `tel:${NUMBER.replace(/\s/g, "")}`);

        // ONE TAP: no dialog, no sheet, nothing opened first. `toBeVisible` is already a claim
        // about the rendered page, and the Sheet is not rendered until the hamburger is pressed.
        await expect(page.locator('[role="dialog"]')).toHaveCount(0);

        // …and 44px of it to aim at, per R11. The reader here is somebody with a tremor.
        const box = await control.boundingBox();
        expect(box?.height ?? 0, `${route}: touch target`).toBeGreaterThanOrEqual(44);

        /*
          WITHOUT SCROLLING, which `toBeVisible` does not say. Playwright calls an element visible
          when it has a box and is not `display:none` — an element a screen below the fold passes
          that happily, and "reachable in one tap" is exactly the claim that would then be false.
          So: the control's box is inside the viewport, and the page has not been scrolled to put
          it there.
        */
        const viewport = page.viewportSize()!;
        const scrolled = await page.evaluate(() => window.scrollY);
        expect(scrolled, `${route}: the page scrolled to reach the number`).toBe(0);
        expect(box!.y, `${route}: the number is above the viewport`).toBeGreaterThanOrEqual(0);
        expect(
          box!.y + box!.height,
          `${route}: the number is below the fold at ${width}px`,
        ).toBeLessThanOrEqual(viewport.height);

        /*
          NOTHING MAY SCROLL SIDEWAYS — with one named exception that is not this change's.

          `/dashboard` overflows at EXACTLY 768px — 12px here, 18px on the CI runner — and it did
          so before this branch: the
          member dashboard's own stat-tile grid, found and recorded during the "Your protection"
          layout work (#455) and reproduced there by reverting that file on the same harness. At
          768px this change is not even on screen — `md:hidden` means the mobile bar is gone and
          the desktop rail is what renders — so it cannot be the cause, and fixing a dashboard
          grid from a branch about the emergency number would be a second concern in one PR.

          PINNED IN BOTH DIRECTIONS, in the style of `localeParse`'s IDENTICAL_TO_EN_BY_DESIGN:
          the exception asserts the overflow is STILL THERE and still ~12px, so the day somebody
          fixes it this test goes red and the exception is deleted rather than quietly outliving
          the defect. Every other route at every other width must not scroll at all.
        */
        if (width === 768 && route === "/dashboard") {
          const overflow = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
          }));
          const by = overflow.scroll - overflow.client;
          /*
            A RANGE, NOT A NUMBER, and the first attempt here was the number. It measured 12px
            locally and 18px on the CI runner — the same defect through a different font stack, so
            an exact figure fails on whichever machine did not produce it. The range still bites
            in the direction that matters: `> 2` goes red the moment somebody fixes the grid, and
            the upper bound catches it getting worse rather than letting "some overflow" mean any
            amount at all.
          */
          expect(by, "the known /dashboard overflow at 768px was fixed — delete this exception").toBeGreaterThan(2);
          expect(by, "the known /dashboard overflow at 768px got worse — that IS worth looking at").toBeLessThanOrEqual(32);
        } else {
          await expectNoHorizontalOverflow(page);
        }

        /*
          EVERY MEMBER PAGE, SHOT — because "it is in the layout so it is on every page" is a
          claim about a component tree, and the thing being delivered is that a member on a phone
          can see the number wherever they happen to be. 390 and 768 are the two the brief names:
          the phone the bar was built for, and the first width at which the sidebar takes over.
        */
        if (width !== 360) {
          const slug = route.replace("/dashboard", "home").replace(/\//g, "-");
          await shoot(page, testInfo, `emergency-${width}-${slug}`);
        }
      }
    });

    test("the other two controls keep their places", async ({ page }) => {
      /*
        The brief names both, with their reasoning: the A/A must not go back behind the
        hamburger, and `MemberReadinessNotice variant="bar"` sits directly under the header by
        D10. This change adds a control; it does not get to move either of those.
      */
      await signInAsMember(page, WITH_NUMBER);
      /*
        EXACTLY ONE VISIBLE A/A, and `:visible` rather than `.first()`. Both copies are in the
        DOM at every width — the mobile bar's and the desktop header's — and the mobile one comes
        first, so `.first()` at 768px asks whether a deliberately hidden element is visible and
        fails for the wrong reason. Counting the visible ones says the real thing: the control is
        on screen, and there is not suddenly a second of it.
      */
      await expect(page.locator('[data-testid="text-size-control"]:visible')).toHaveCount(1);

      if (width < 768) {
        // The A/A is in the BAR, beside the new control — not in the Sheet.
        const together = await page.evaluate(() => {
          const call = document.querySelector('[data-testid="mobile-emergency-number"]');
          const bar = call?.parentElement;
          return !!bar?.querySelector('[data-testid="text-size-control"]');
        });
        expect(together, "the A/A must still be in the mobile bar").toBe(true);
      }
    });

    test("nothing at all when no number is configured", async ({ page }) => {
      // WP1b, and the rule the sidebar block already follows: show nothing, never a dead link.
      await signInAsMember(page, WITHOUT_NUMBER);
      await expect(page.getByTestId("mobile-emergency-number")).toHaveCount(0);
      await expect(page.getByTestId("sidebar-emergency-number")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    });
  });
}

/**
 * THE MEASUREMENT THE PLACEMENT WAS CHOSEN FROM, kept as an assertion.
 *
 * The brief said measure rather than trust an estimate. These are the numbers, and they are
 * checked rather than recorded, so the day somebody adds a fifth control to this bar the digits
 * do not quietly start overflowing a phone.
 */
for (const width of [360, 390]) {
  for (const textSize of ["normal", "large"] as const) {
    test.describe(`${width}px at the ${textSize} text size`, () => {
      test.use({ viewport: { width, height: 800 } });

      test("the bar's contents fit inside the bar", async ({ page }, testInfo) => {
        await signInAsMember(page, WITH_NUMBER);
        await page.evaluate((level) => {
          window.localStorage.setItem("ice.textSize", level);
        }, textSize);
        await page.reload();
        await expect(page.getByTestId("mobile-emergency-number")).toBeVisible();

        const m = await measureBar(page);
        expect(m).not.toBeNull();
        /*
          WHAT IT MEASURED when this was written, printed on every run so a regression shows the
          number that moved rather than only that something did:

            360px, default text  inner 328  used 313  call 147  digits 95   (15px spare)
            390px, default text  inner 358  used 313  call 147  digits 95   (45px spare)
            360px, large text    inner 328  used 256  call  55  digits  0   (handset only)
            390px, large text    inner 358  used 256  call  55  digits  0   (handset only)
        */
        console.log(`[bar ${width}px/${textSize}] ${JSON.stringify(m)}`);

        expect(m!.rootFontPx).toBeCloseTo(textSize === "large" ? 20 : 16, 1);
        expect(m!.used, "the bar's children overflow it").toBeLessThanOrEqual(m!.inner);
        await expectNoHorizontalOverflow(page);

        /*
          DIGITS WHERE THEY FIT, THE HANDSET WHERE THEY DO NOT — and this is the whole of the
          fallback rule, pinned in both directions so neither half can rot:

            default size, 360 and 390  →  the number is on screen
            large size,   under 420px  →  the handset alone, the number in the aria-label

          Pinning the negative matters as much as the positive. Without it, a change that hid
          the digits everywhere would pass every other assertion in this file.
        */
        const digits = page.getByTestId("mobile-emergency-number").locator("span").first();
        if (textSize === "normal") {
          await expect(digits).toBeVisible();
          await expect(digits).toHaveText(NUMBER);
        } else {
          await expect(digits).toBeHidden();
        }

        // The number is announced either way — the icon-only fallback must still say what it is.
        await expect(page.getByTestId("mobile-emergency-number")).toHaveAttribute(
          "aria-label",
          new RegExp(NUMBER.replace(/\+/g, "\\+")),
        );

        await shoot(page, testInfo, `emergency-${width}-${textSize}`);
      });
    });
  }
}
