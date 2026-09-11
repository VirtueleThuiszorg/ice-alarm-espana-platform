import { test, expect, type Page } from "@playwright/test";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";
import { settle } from "./helpers/settle";

/**
 * THE MEMBER RECORD, PHOTOGRAPHED — the visual pass, at the two widths it is used at.
 *
 * ── WHY A BROWSER, AND WHY SCREENSHOTS ──────────────────────────────────────
 *
 * Every other test in this series asserts a CLASS NAME or a TOKEN VALUE. That is the right bar
 * for "is the contrast AA" and "is red used once", and it is worth nothing for "does this look
 * like one product". jsdom applies no stylesheet: a rule that never matches, a token that
 * resolves to nothing, a strip whose tabs overflow off the side of a phone — all of those pass
 * a class-name test and are obvious in a photograph.
 *
 * This spec exists to produce the photographs, and it asserts only the handful of things a
 * picture cannot be trusted on by itself (the tab row is there, the record rendered, the strip
 * does not force the PAGE to scroll sideways at 390px).
 *
 * 1280 and 390: the desk the record is worked at, and the phone it is read from during a
 * courtesy call.
 *
 * REAL here: the production build, Chromium, the router, ProtectedRoute, staff ownership and
 * every card on the tab. STUBBED: Supabase's HTTP surface.
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
const MEMBER_ID = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-09-11T10:00:00.000Z");

const member = {
  id: MEMBER_ID,
  user_id: null,
  first_name: "Ana",
  last_name: "Alpha",
  email: "ana.alpha@example.com",
  phone: "+34600000001",
  date_of_birth: "1948-04-12",
  nie_dni: "X1234567L",
  address_line_1: "Calle Mayor 14",
  address_line_2: null,
  city: "Albox",
  province: "Almería",
  postal_code: "04800",
  country: "Spain",
  status: "active",
  billing_source: "stripe",
  preferred_language: "es",
  photo_url: null,
  special_instructions: null,
  home_lat: null,
  home_lng: null,
  home_location_accuracy_m: null,
  home_location_source: null,
  home_location_set_at: null,
  home_location_set_by: null,
  last_checkin_at: "2026-09-10T08:15:00.000Z",
  created_at: "2025-11-02T09:00:00.000Z",
  notify_channel_sms: true,
};

const contacts = [
  {
    id: "c1",
    member_id: MEMBER_ID,
    name: "Lucía Alpha",
    relationship: "Daughter",
    phone: "+34600000002",
    email: "lucia@example.com",
    contact_type: "primary",
    priority: 1,
    can_attend_in_person: true,
    has_key: true,
  },
  {
    id: "c2",
    member_id: MEMBER_ID,
    name: "Dr Pablo Ruiz",
    relationship: "Doctor",
    phone: "+34600000003",
    email: null,
    contact_type: "medical",
    priority: 2,
    can_attend_in_person: false,
    has_key: false,
  },
];

const subscription = {
  id: "s1",
  member_id: MEMBER_ID,
  status: "active",
  plan_type: "premium",
  billing_frequency: "monthly",
  monthly_amount: 39.99,
  renewal_date: "2026-10-02",
  start_date: "2025-11-02",
  registration_fee_paid: true,
  stripe_subscription_id: "sub_stub",
};

/**
 * Every table any card on the record reads. An unstubbed one answers 501 and the card renders
 * its error state, which would photograph as a design defect that is really a fixture gap.
 */
const tables = {
  members: [member],
  emergency_contacts: contacts,
  subscriptions: [subscription],
  devices: [],
  medical_information: [],
  member_monitoring_readiness: [],
  partner_attributions: [],
  tasks: [],
  alerts: [],
};

async function openRecord(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(NOW);
  await installSupabaseStub(page, { staff: { ...OPERATOR }, tables });

  await page.goto("/staff/login");
  await page.locator('input[type="email"]').fill(OPERATOR.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/call-centre$/);

  await page.goto(`/call-centre/members/${MEMBER_ID}`);
  await expect(page.getByRole("tab", { name: /profile/i })).toBeVisible();
  // The record has loaded, not just the shell.
  await expect(page.getByTestId("profile-card-fields")).toBeVisible();
}

/** Radix tabs activate on pointerDown, so a bare click does not switch them. */
async function openTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  await tab.scrollIntoViewIfNeeded();
  await tab.dispatchEvent("pointerdown");
  await tab.click();
  await expect(tab).toHaveAttribute("data-state", "active");
}

for (const [label, width, height] of [
  ["1280", 1280, 900],
  ["390", 390, 844],
] as const) {
  test(`the member record at ${label}px`, async ({ page }) => {
    await openRecord(page, width, height);

    /*
      SETTLE BEFORE EVERY CAPTURE. Without it these screenshots are taken partway through the
      page's entrance animation, and this file has already produced one false defect that way —
      the portal shot below was reported as "renders with a dimming overlay" when it was
      `animate-fade-in` caught mid-opacity. See e2e/helpers/settle.ts.
    */
    const shot = async (name: string) => {
      await settle(page);
      await page.screenshot({ path: `e2e/.report/member-record-${name}-${label}.png`, fullPage: false });
    };

    await shot("profile");
    await settle(page);
    await page.getByRole("tablist").screenshot({
      path: `e2e/.report/member-record-tabstrip-${label}.png`,
    });
    await page.getByTestId("member-header").screenshot({
      path: `e2e/.report/member-record-header-${label}.png`,
    });

    await openTab(page, /contacts/i);
    await shot("contacts");

    await openTab(page, /subscription/i);
    await shot("subscription-locked");

    // The two other tabs the field primitive reaches, so the walk is photographed rather than
    // asserted only in class names.
    await openTab(page, /device/i);
    await shot("device");

    await openTab(page, /crm/i);
    await shot("crm");

    /*
      THE ONE THING THE PICTURE CANNOT BE TRUSTED ON, and the reason it is asserted about the
      STRIP rather than the document.

      A tab strip whose CONTENT overflows is the intended behaviour — that is what makes it
      scroll. A strip whose BOX is wider than the viewport is the bug, and the two look
      identical in a screenshot cropped to the viewport. So: the strip's own box must fit.

      SCOPED TO THE RECORD, and that boundary was drawn by measurement rather than by taste.

      At 390px the document overflowed by 325px. The member header's action row was 291 of it —
      four buttons in a flex row that could not wrap — and that is fixed. The remaining 34px is
      the CALL-CENTRE SHELL's own sticky top bar (the operator's name and the icon buttons
      beside it), which is on every call-centre page and has nothing to do with this record. A
      document-level assertion here would either stay red for a defect this goal does not own,
      or quietly become the place somebody "fixes" an app-shell bug inside a member-record PR.

      So the assertion walks the record's own subtree. It is a real regression test for the 291
      that were ours, and it will not go green if the shell is ever fixed and this rots.
    */
    const strip = page.getByRole("tablist");
    const stripBox = (await strip.boundingBox())!;
    expect(stripBox.width, "the tab strip's box must fit the viewport; its content may scroll")
      .toBeLessThanOrEqual(width);

    const escapes = await page.evaluate(() => {
      const root = document.querySelector(".member-record-page");
      if (!root) return ["the record root is missing"];
      const limit = root.getBoundingClientRect().right;
      const out: string[] = [];
      root.querySelectorAll<HTMLElement>("*").forEach((el) => {
        // The tab strip is a scroller: its CONTENT is meant to be wider than its box.
        if (el.closest(".member-tab-strip")) return;
        const r = el.getBoundingClientRect();
        if (r.right > limit + 1) out.push(`${el.tagName}.${String(el.className).slice(0, 50)}`);
      });
      return out.slice(0, 5);
    });
    expect(escapes, "nothing on the record may run past its own right edge").toEqual([]);
  });
}

/**
 * THE OTHER SURFACE, photographed for the same reason.
 *
 * `EditableCard`, `FieldLabel` and `NotAdded` are shared with the member's own pages, so every
 * change in this series reached them whether or not anybody looked. A class-name test proves
 * the constant is imported; it cannot prove the member's profile still reads properly with a
 * caption style that was retuned for a dense staff screen.
 */
test("the member's own profile page still reads properly", async ({ page }) => {
  const MEMBER_ID = "22222222-2222-2222-2222-222222222222";
  const EMAIL = "member@example.com";

  await page.setViewportSize({ width: 1280, height: 900 });
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
      members: [
        {
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
        },
      ],
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
    },
  });

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill("Member123");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/dashboard/profile");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  /*
    THE CAPTURE THAT INVENTED A DEFECT. Without `settle`, this fires during ProfilePage's
    `animate-fade-in` and every card comes out uniformly darkened — which was reported as a
    dimming overlay and investigated as a stuck dialog backdrop that never existed.
  */
  await settle(page);
  await page.screenshot({ path: "e2e/.report/member-portal-profile-1280.png", fullPage: false });

  // The empty state is the shared one, not a blank line or a dash — the thing the staff record
  // now also uses, so a regression on either surface shows up on both.
  const notAdded = page.getByTestId("not-added");
  expect(await notAdded.count()).toBeGreaterThan(0);
});
