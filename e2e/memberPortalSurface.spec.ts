import { test, expect, type Page } from "@playwright/test";
import { installSupabaseStub } from "./helpers/supabaseStub";
import { settle, fullViewportOverlays } from "./helpers/settle";

/**
 * THE MEMBER PORTAL, PHOTOGRAPHED ONCE IT HAS STOPPED MOVING.
 *
 * ── THE DEFECT THIS WAS OPENED FOR DOES NOT EXIST ───────────────────────────
 *
 * I reported that the portal's Profile page "renders with a dimming overlay over its content",
 * from a screenshot taken during the visual pass. There is no overlay. `ProfilePage` wraps its
 * body in `animate-fade-in` (`opacity: 0 → 1` over 300ms) and the capture was taken partway
 * through it, so every card was uniformly darkened. A photograph of a state no human ever sees,
 * reported as a rendering fault.
 *
 * ── SO WHAT IS ACTUALLY FIXED ───────────────────────────────────────────────
 *
 * The mechanism that produced the false reading. `settle()` asks the browser whether anything
 * is still animating instead of guessing with a sleep, and every screenshot in this repo's
 * visual specs now goes through it. That is the real defect: a proof mechanism that can invent
 * defects is worse than no screenshots, because somebody spends an afternoon looking for a
 * stuck dialog backdrop.
 *
 * ── AND THE GUARD IS STILL WORTH HAVING ─────────────────────────────────────
 *
 * A Dialog or Sheet whose overlay stays mounted after close IS a real failure mode, it looks
 * exactly like the artefact above, and nothing was checking for it. `fullViewportOverlays()`
 * tells the two apart by asking whether the layer is actually in the DOM. Every portal page,
 * both widths, no dialog open.
 */

test.use({ serviceWorkers: "block" });

const MEMBER_ID = "22222222-2222-2222-2222-222222222222";
const EMAIL = "member@example.com";
const PASSWORD = "Member123";

const MEMBER_ROW = {
  id: MEMBER_ID,
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Rosa",
  last_name: "Beta",
  email: EMAIL,
  phone: "+34600000009",
  date_of_birth: "1946-02-20",
  nie_dni: null,
  address_line_1: "Calle Real 3",
  address_line_2: null,
  city: "Mojácar",
  province: "Almería",
  postal_code: "04638",
  country: "Spain",
  status: "active",
  preferred_language: "es",
  photo_url: null,
  home_lat: null,
  home_lng: null,
  home_location_source: null,
  home_location_set_at: null,
};

async function signInAsMember(page: Page) {
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
      subscriptions: [],
      system_settings: [{ key: "settings_emergency_phone", value: "+34 950 473 199" }],
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
      conversations: [],
      messages: [],
      support_tickets: [],
    },
  });

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Every page a signed-in member can reach from the portal's own navigation. */
const PORTAL_PAGES = [
  ["home", "/dashboard"],
  ["profile", "/dashboard/profile"],
  ["medical", "/dashboard/medical"],
  ["contacts", "/dashboard/contacts"],
  ["device", "/dashboard/device"],
  ["subscription", "/dashboard/subscription"],
  ["alerts", "/dashboard/alerts"],
  ["support", "/dashboard/support"],
  ["messages", "/dashboard/messages"],
] as const;

for (const width of [1280, 390] as const) {
  test(`no portal page is covered by an overlay at ${width}px`, async ({ page }) => {
    /*
      Nine real page loads against the production preview build, plus a sign-in, does not fit the
      90s default. Raised rather than split into nine tests: each of those would pay for its own
      sign-in, which is most of the cost, and the failure message already names the page.
    */
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await signInAsMember(page);

    const covered: string[] = [];
    for (const [name, path] of PORTAL_PAGES) {
      await page.goto(path);
      // The page's own content, not just the shell — a route that failed to render has no
      // overlay either, and would pass this vacuously.
      await expect(page.locator("main, [role='main']").first()).toBeVisible();
      await settle(page);

      const overlays = await fullViewportOverlays(page);
      if (overlays.length) covered.push(`${name} (${path}): ${overlays.join(" | ")}`);

      await page.screenshot({
        path: `e2e/.report/portal-${name}-${width}.png`,
        fullPage: false,
      });
    }

    expect(covered, "portal pages with a full-viewport layer over them and no dialog open")
      .toEqual([]);
  });
}

test("the guard can actually see an overlay — it is not vacuously green", async ({ page }) => {
  /*
    A GUARD THAT CANNOT FAIL IS NOT A GUARD. Nine pages returning an empty array proves nothing
    on its own: the same result comes from a selector that matches nothing, a filter that is too
    strict, or a typo. So an overlay of the exact shape a stuck Radix backdrop has is injected,
    and the helper must find it — and must stop finding it when it goes away.
  */
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsMember(page);
  await page.goto("/dashboard/profile");
  await settle(page);

  expect(await fullViewportOverlays(page)).toEqual([]);

  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "injected-backdrop";
    el.className = "fixed inset-0 z-50 bg-black/80";
    el.setAttribute("style", "position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:50");
    document.body.appendChild(el);
  });
  const seen = await fullViewportOverlays(page);
  expect(seen.length, "the guard must see an injected full-viewport backdrop").toBe(1);
  expect(seen[0]).toContain("rgba(0, 0, 0, 0.8)");

  await page.evaluate(() => document.getElementById("injected-backdrop")?.remove());
  expect(await fullViewportOverlays(page)).toEqual([]);
});
