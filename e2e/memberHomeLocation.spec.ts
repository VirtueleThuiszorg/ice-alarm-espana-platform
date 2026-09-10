import { test, expect } from "@playwright/test";
import { installSupabaseStub } from "./helpers/supabaseStub";

/**
 * A MEMBER MARKS THEIR OWN FRONT DOOR, in a real browser.
 *
 * ── WHY A BROWSER AND NOT ANOTHER UNIT TEST ─────────────────────────────────
 *
 * `src/test/memberHomeLocation.test.tsx` proves what the dialog renders and what Save sends. It
 * cannot prove the three legs a member actually depends on, and each of them has broken
 * something in this repo before:
 *
 *   - the route is REACHABLE behind `ProtectedRoute requireMember` with a restored session
 *   - the LAZY CHUNK loads in the production bundle. Leaflet is code-split, and a chunk that
 *     resolves in jsdom and 404s in the built app looks identical in a unit test
 *   - the browser's REAL Geolocation API — permission, and an accuracy figure this app then
 *     has an opinion about. jsdom has no geolocation at all, so the unit suite necessarily
 *     drives a double
 *
 * REAL here: the production build, Chromium, the router, AuthContext, ProtectedRoute, the
 * client layout, supabase-js, react-query, the lazily-loaded Leaflet map, and Chromium's own
 * geolocation. STUBBED: Supabase's HTTP surface, Nominatim, and the OSM tile server.
 *
 * NOT proven here, and not pretended: that RLS keeps one member's pin away from another, or
 * that `guard_member_home_location()` refuses a forged source. Those are asserted by execution
 * in `scripts/rls/isolation.sql` against a real PostgreSQL — a browser cannot see either.
 */

test.use({
  serviceWorkers: "block",
  permissions: ["geolocation"],
  // Albox, Almería. Accuracy is overridden per test — it is the value under test.
  geolocation: { latitude: 37.3882, longitude: -2.1478, accuracy: 20 },
});

const MEMBER_ID = "11111111-1111-1111-1111-111111111111";
const EMAIL = "member@example.com";
const PASSWORD = "Member123";

const memberRow = (pin: Record<string, unknown> = {}) => ({
  id: MEMBER_ID,
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Ana",
  last_name: "Alpha",
  email: EMAIL,
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
  nie_dni: "X1234567L",
  urbanizacion: null,
  bloque: null,
  portal: null,
  escalera: null,
  away_from: null,
  away_until: null,
  pendant_with_member: true,
  photo_url: null,
  special_instructions: null,
  home_lat: null,
  home_lng: null,
  home_location_accuracy_m: null,
  home_location_source: null,
  home_location_set_at: null,
  home_location_set_by: null,
  ...pin,
});

/**
 * Nominatim and the tile server, both off the network.
 *
 * The tiles are ABORTED rather than answered with a fake image: Leaflet renders its container,
 * its attribution and the pin regardless, which is everything these assertions touch, and a
 * suite that waits on 20 tile requests per test is a suite somebody will switch off. Nominatim
 * is answered, because its reply is what centres the picker.
 */
async function stubMaps(page: import("@playwright/test").Page) {
  // REGEXPS, NOT GLOBS. `"**://host/**"` matches nothing — Playwright's glob has no `://`
  // wildcard — so the first version of this helper intercepted neither, the real Nominatim
  // request hung with no deadline, and both tests sat on the picker's loading skeleton. That
  // was two failures with one cause, and the cause was a real defect in the app as well: see
  // `forwardGeocode`'s AbortController.
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  await page.route(/nominatim\.openstreetmap\.org/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([{ lat: "37.3886", lon: "-2.1487" }]),
    }),
  );
}

async function signInAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("a member sets their home location", () => {
  test("from their own account page, with the browser's fix, and it is saved as member_gps", async ({
    page,
    context,
  }) => {
    await context.setGeolocation({ latitude: 37.3882, longitude: -2.1478, accuracy: 20 });
    await stubMaps(page);
    const stub = await installSupabaseStub(page, {
      roleInfo: { is_staff: false, staff_role: null, is_partner: false, partner_id: null, member_id: MEMBER_ID },
      tables: { members: [memberRow()] },
    });

    await signInAsMember(page);

    // Clicked, not typed: a control nobody can reach is not a feature.
    await page.goto("/dashboard/profile");
    const row = page.locator('[data-testid="home-location-row"]');
    await expect(row).toBeVisible();
    // The empty state is one button and one sentence.
    await expect(page.locator('[data-testid="home-location-set"]')).toBeVisible();
    await expect(row).toContainText(/where we send help if your pendant cannot tell us/i);

    await page.locator('[data-testid="home-location-set"]').click();
    const dialog = page.locator('[data-testid="set-home-location-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      /this is where we send help if your pendant cannot tell us where you are/i,
    );

    // THE LAZY CHUNK. If Leaflet's code-split bundle does not resolve in the production build,
    // this never appears — which is the leg a unit test cannot see.
    await expect(page.locator('[data-testid="home-location-map"]')).toBeVisible();
    await expect(dialog).toContainText(/OpenStreetMap/);

    await page.locator('[data-testid="home-location-use-current"]').click();
    await expect(page.locator('[data-testid="home-location-accuracy"]')).toContainText(
      /about 20 metres/i,
    );

    await page.locator('[data-testid="home-location-save"]').click();
    await expect(dialog).toBeHidden();

    const save = stub.calls.find(
      (c) =>
        c.path.startsWith("/functions/v1/member-self-service") &&
        (c.body as { action?: string })?.action === "save_home_location",
    );
    expect(save, "the member's Save must reach member-self-service").toBeTruthy();
    expect(save?.body).toMatchObject({
      action: "save_home_location",
      source: "member_gps",
      accuracy_m: 20,
      lat: 37.3882,
      lng: -2.1478,
    });

    // The server has the pin now. What the member sees on their next visit is the other half of
    // the feature, so the backend's answer is changed and the page re-read — the same way
    // partnerJourney.spec.ts models verification.
    stub.patch({
      tables: {
        members: [
          memberRow({
            home_lat: 37.3882,
            home_lng: -2.1478,
            home_location_accuracy_m: 20,
            home_location_source: "member_gps",
            home_location_set_at: "2026-09-10T12:00:00.000Z",
          }),
        ],
      },
    });
    await page.reload();

    await expect(page.locator('[data-testid="home-location-set-at"]')).toContainText(
      "10 September 2026",
    );
    await expect(page.locator('[data-testid="home-location-open-maps"]')).toBeVisible();
    await expect(page.locator('[data-testid="home-location-change"]')).toBeVisible();
    // and the empty-state button is gone
    await expect(page.locator('[data-testid="home-location-set"]')).toHaveCount(0);
  });

  test("REFUSES a fix that is not close enough, and saves nothing", async ({ page, context }) => {
    // What a phone indoors on wifi actually reports. The pin must not move to it.
    await context.setGeolocation({ latitude: 37.3882, longitude: -2.1478, accuracy: 640 });
    await stubMaps(page);
    const stub = await installSupabaseStub(page, {
      roleInfo: { is_staff: false, staff_role: null, is_partner: false, partner_id: null, member_id: MEMBER_ID },
      tables: { members: [memberRow()] },
    });

    await signInAsMember(page);
    await page.goto("/dashboard/profile");
    await page.locator('[data-testid="home-location-set"]').click();
    await page.locator('[data-testid="home-location-use-current"]').click();

    const refusal = page.locator('[data-testid="home-location-accuracy-refused"]');
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText(/please stand at your front door and try again/i);
    await expect(refusal).toContainText("640");
    // No accuracy line, because there is no accepted fix.
    await expect(page.locator('[data-testid="home-location-accuracy"]')).toHaveCount(0);

    // The pin is still the geocoded address, not the 640 m fix.
    await expect(page.locator('[data-testid="home-location-coords"]')).toContainText(
      "37.388600, -2.148700",
    );

    // And nothing has been sent. A refusal that still saves is the defect.
    expect(
      stub.calls.filter((c) => c.path.startsWith("/functions/v1/member-self-service")),
    ).toHaveLength(0);
  });
});
