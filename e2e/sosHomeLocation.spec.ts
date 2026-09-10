import { test, expect } from "@playwright/test";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";

/**
 * AN OPERATOR OPENS AN SOS AND SEES WHERE TO SEND HELP — in a real browser.
 *
 * ── WHY A BROWSER AND NOT ANOTHER UNIT TEST ─────────────────────────────────
 *
 * `src/test/sosHomeLocation.test.tsx` renders the panel and proves the rule. What it cannot
 * prove is that the takeover screen — the one an operator is actually looking at during an SOS —
 * assembles the two locations at all: the alert comes from one query, the member's home pin from
 * another, and the screen only exists once ownership resolves. A card that is correct in jsdom
 * and blank on `/call-centre/sos-alert` looks identical in a unit test.
 *
 * BOTH STATES, because the whole feature is the difference between them:
 *   live fresh  → the pendant's fix leads, the home pin is beside it, and the distance between
 *                 them is on screen
 *   no live fix → the card says "No recent pendant location — showing home", IN WORDS
 *
 * REAL here: the production build, Chromium, the router, ProtectedRoute, staff ownership,
 * `useSOSTakeover`, `useMemberHomeLocation` and the panel. STUBBED: Supabase's HTTP surface.
 *
 * NOT proven here: that RLS lets this operator read the pin and keeps it from everyone else.
 * That is asserted by execution against a real PostgreSQL in `scripts/rls/isolation.sql`.
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
/** Albox: the member's door, and a point measured 1.2 km away. */
const HOME = { lat: 37.388, lng: -2.148 };
const AWAY = { lat: 37.3985, lng: -2.1465 };
const NOW = new Date("2026-09-10T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

/** The member, with a pin THEY confirmed — the label under test says exactly that. */
const member = {
  id: MEMBER_ID,
  user_id: null,
  first_name: "Ana",
  last_name: "Alpha",
  email: "member@example.com",
  phone: "+34600000001",
  date_of_birth: "1950-01-01",
  address_line_1: "Calle A 1",
  address_line_2: null,
  city: "Albox",
  province: "Almeria",
  postal_code: "04800",
  country: "Spain",
  status: "active",
  preferred_language: "en",
  photo_url: null,
  special_instructions: null,
  home_lat: HOME.lat,
  home_lng: HOME.lng,
  home_location_accuracy_m: null,
  home_location_source: "member_pin",
  home_location_set_at: "2026-06-03T09:30:00.000Z",
  home_location_set_by: null,
};

const alert = (over: Record<string, unknown>) => ({
  id: "alert-1",
  alert_type: "sos_button",
  status: "in_progress",
  member_id: MEMBER_ID,
  received_at: minutesAgo(4),
  // Already this operator's, so the takeover screen has an active alert to render.
  accepted_by_staff_id: OPERATOR.id,
  accepted_at: minutesAgo(4),
  conference_id: null,
  location_address: null,
  location_lat: null,
  location_lng: null,
  is_false_alarm: false,
  resolution_notes: null,
  ...over,
});

async function signInAsOperator(page: import("@playwright/test").Page) {
  await page.goto("/staff/login");
  await page.locator('input[type="email"]').fill(OPERATOR.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/call-centre$/);
}

test.describe("the SOS card's two locations", () => {
  test("a FRESH pendant fix leads, and the member's front door is beside it with the distance", async ({
    page,
  }) => {
    await page.clock.setFixedTime(NOW);
    await installSupabaseStub(page, {
      staff: { ...OPERATOR },
      tables: {
        members: [member],
        alerts: [
          alert({
            location_lat: AWAY.lat,
            location_lng: AWAY.lng,
            location_address: "Calle Larga 4, Albox",
            received_at: minutesAgo(4),
          }),
        ],
      },
    });

    await signInAsOperator(page);
    await page.goto("/call-centre/sos-alert");

    const home = page.locator('[data-testid="sos-home-location"]');
    await expect(home).toBeVisible();

    /*
      THE LABEL. This is the sentence the whole feature exists to be able to say truthfully —
      and it is asserted VISIBLE, not merely present. The first version of this spec used
      `toHaveText`, which a clipped element satisfies perfectly: the block was rendered inside a
      fixed-height card with `overflow-hidden` and could not be seen at all. The screenshots
      below are what found it.
    */
    await expect(page.locator('[data-testid="sos-home-label"]')).toBeVisible();
    await expect(page.locator('[data-testid="sos-home-label"]')).toHaveText(
      "Home location (set by member on 3 Jun 2026)",
    );

    // Secondary, because the pendant reported four minutes ago.
    await expect(home).toHaveAttribute("data-home-primary", "false");
    await expect(home).toHaveAttribute("data-home-source", "member_pin");

    // NEGATIVE: the card must not claim to be showing home while the fix is fresh.
    await expect(page.locator('[data-testid="sos-no-recent-fix"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="sos-map-label"]')).toHaveText("Last Known Location");

    // The one line that answers "do I send help to the house?" on its own.
    await expect(page.locator('[data-testid="sos-home-distance"]')).toBeVisible();
    await expect(page.locator('[data-testid="sos-home-distance"]')).toHaveText(
      "Pendant is 1.2 km from home",
    );

    await page.screenshot({ path: "e2e/.report/sos-card-live-fresh.png", fullPage: false });
  });

  test("NO pendant fix: the card says so in words and the home pin leads", async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await installSupabaseStub(page, {
      staff: { ...OPERATOR },
      tables: {
        members: [member],
        alerts: [alert({ location_lat: null, location_lng: null, location_address: null })],
      },
    });

    await signInAsOperator(page);
    await page.goto("/call-centre/sos-alert");

    const banner = page.locator('[data-testid="sos-no-recent-fix"]');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText("No recent pendant location — showing home");
    await expect(page.locator('[data-testid="sos-home-location"]')).toBeVisible();
    await expect(page.locator('[data-testid="sos-home-location"]')).toHaveAttribute(
      "data-home-primary",
      "true",
    );
    await expect(page.locator('[data-testid="sos-map-label"]')).toHaveText("Home location");
    await expect(page.locator('[data-testid="sos-home-label"]')).toBeVisible();
    await expect(page.locator('[data-testid="sos-home-label"]')).toHaveText(
      "Home location (set by member on 3 Jun 2026)",
    );
    // No fix to measure from, so no distance is claimed.
    await expect(page.locator('[data-testid="sos-home-distance"]')).toHaveCount(0);

    await page.screenshot({ path: "e2e/.report/sos-card-no-live-fix.png", fullPage: false });
  });

  test("a fix older than half an hour: home leads, and the STALE FIX IS STILL ON SCREEN", async ({
    page,
  }) => {
    await page.clock.setFixedTime(NOW);
    await installSupabaseStub(page, {
      staff: { ...OPERATOR },
      tables: {
        members: [member],
        alerts: [
          alert({
            location_lat: AWAY.lat,
            location_lng: AWAY.lng,
            location_address: "Calle Larga 4, Albox",
            received_at: minutesAgo(75),
          }),
        ],
      },
    });

    await signInAsOperator(page);
    await page.goto("/call-centre/sos-alert");

    await expect(page.locator('[data-testid="sos-no-recent-fix"]')).toBeVisible();
    await expect(page.locator('[data-testid="sos-home-location"]')).toHaveAttribute(
      "data-home-primary",
      "true",
    );
    /*
      THE PROPERTY THIS WHOLE FEATURE TURNS ON. Home may lead, but it must never be shown IN
      PLACE OF a pendant fix: the map is still the pendant's, because an operator deciding
      whether the member went out needs to see where the pendant was — and the distance says how
      far that is from the door.
    */
    await expect(page.locator('[data-testid="sos-map-label"]')).toHaveText("Last Known Location");
    await expect(page.locator('[data-testid="sos-home-distance"]')).toBeVisible();
    await expect(page.locator('[data-testid="sos-home-distance"]')).toHaveText(
      "Pendant is 1.2 km from home",
    );

    await page.screenshot({ path: "e2e/.report/sos-card-stale-fix.png", fullPage: false });
  });
});
