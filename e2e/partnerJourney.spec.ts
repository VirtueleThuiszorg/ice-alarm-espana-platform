import { test, expect, type Page } from "@playwright/test";
import {
  installSupabaseStub,
  VALID_PARTNER_FORM,
  type PartnerStatus,
} from "./helpers/supabaseStub";

/**
 * The partner journey, driven in a real browser against the production bundle:
 * register at /partner/join → verify → log in → reach the dashboard.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Every leg of this journey broke in production this cycle, and each break was
 * invisible to the unit suite because each lived in the seam between two units:
 *
 *  1. `/partner/join` reported success having invoked NOTHING. `partner-register`
 *     had zero invocations for 16 days. A unit test of the submit handler passes
 *     while the real form never reaches it.
 *  2. Server errors surfaced as "Edge Function returned a non-2xx status code",
 *     because supabase-js hides the body on `error.context`. The partner was told
 *     nothing about which field was wrong.
 *  3. The client password rule was `min(8)` while the server also demanded upper,
 *     lower and a digit — so "password" passed the form and came back as
 *     `password: Invalid`.
 *  4. A newly-verified partner landed on the join wizard instead of the dashboard:
 *     the redirect fired before `refreshAuth`, so `ProtectedRoute` still saw no
 *     partner.
 *  5. `PartnerLogin` used a denylist while `get_user_role_info` uses an allowlist,
 *     so an `invited` partner signed in successfully and hit /unauthorized.
 *
 * ── WHAT IT PROVES, PRECISELY ───────────────────────────────────────────────
 *
 * Real: the built bundle, Chromium, React Router, `AuthContext`, `ProtectedRoute`,
 * `supabase-js` (including its own session persistence), the zod schemas, and the
 * wizard. Stubbed: Supabase's HTTP surface only — see `helpers/supabaseStub.ts`.
 *
 * It therefore proves the CLIENT journey and the request contract. It does NOT
 * prove a migration, an RLS policy, a DB constraint, GoTrue's real behaviour, or
 * email delivery. A full-stack run needs `supabase start`, i.e. Docker, which was
 * unavailable where this was written — so that leg is named here rather than
 * faked, and is NOT one of the two E2E paths the CI gates mandate
 * (checkout→activation, SOS→operator). Those remain owed.
 */

/**
 * The app registers a service worker, and it answers `GET /rest/v1/*` with a 503
 * offline fallback BEFORE `page.route()` is consulted — POSTs passed through, so
 * only the login's `partners` lookup broke, surfacing as "Failed to verify partner
 * account" rather than anything about the stub. Blocked here rather than in
 * `playwright.config.ts` so the public page audit keeps exercising the real
 * worker, which is part of what it audits.
 */
test.use({ serviceWorkers: "block" });

const DASHBOARD = "/partner-dashboard";
const PARTNER_ROW = { id: "p-1", status: "active" as PartnerStatus, contact_name: "Ana" };

/** Walk the wizard to the final step, filling only what the schema requires. */
async function fillJoinWizard(page: Page) {
  // info → type
  await page.getByRole("button", { name: /join now/i }).click();

  // type → contact ("referral" is the default and the only non-B2B type, so the
  // wizard skips the organization step; a B2B type would add one).
  await page.getByRole("button", { name: /continue/i }).click();

  // contact
  await page.locator('input[name="contact_name"]').fill(VALID_PARTNER_FORM.contact_name);
  await page.locator('input[name="last_name"]').fill(VALID_PARTNER_FORM.last_name);
  await page.locator('input[name="email"]').fill(VALID_PARTNER_FORM.email);
  await page.locator('input[name="phone"]').fill(VALID_PARTNER_FORM.phone);
  await page.getByRole("button", { name: /continue/i }).click();

  // additional — every field optional
  await page.getByRole("button", { name: /continue/i }).click();

  // payout
  await page
    .locator('input[name="payout_beneficiary_name"]')
    .fill(VALID_PARTNER_FORM.payout_beneficiary_name);
  await page.locator('input[name="payout_iban"]').fill(VALID_PARTNER_FORM.payout_iban);
  await page.getByRole("button", { name: /continue/i }).click();

  // account
  await page.locator('input[name="password"]').fill(VALID_PARTNER_FORM.password);
  await page.locator('input[name="confirmPassword"]').fill(VALID_PARTNER_FORM.password);
  await page.getByRole("checkbox").first().click();
}

// ============================================================
//  Leg 1 — register at /partner/join
// ============================================================

test.describe("register at /partner/join", () => {
  test("the submit actually reaches partner-register, with the submitted values", async ({
    page,
  }) => {
    const stub = await installSupabaseStub(page, { partner: null });
    await page.goto("/partner/join");

    await fillJoinWizard(page);
    await page.getByRole("button", { name: /submit|register|create/i }).last().click();

    // THE assertion this whole file was worth writing for: the function is called.
    // A green form with zero invocations is what shipped for 16 days.
    await expect
      .poll(() => stub.functionCalls("partner-register").length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const body = stub.functionCalls("partner-register")[0].body as Record<string, unknown>;
    expect(body.email).toBe(VALID_PARTNER_FORM.email);
    expect(body.contact_name).toBe(VALID_PARTNER_FORM.contact_name);
    expect(body.password).toBe(VALID_PARTNER_FORM.password);
    expect(body.partner_type).toBe("referral");
    // A non-B2B partner is sent as an individual, not with an empty org type.
    expect(body.organization_type).toBe("individual");
    // The server stamps the legal record from this, so it must actually be sent.
    expect(body.accept_terms).toBe(true);
  });

  test("a weak password is refused by the form, before the server sees it", async ({ page }) => {
    const stub = await installSupabaseStub(page, { partner: null });
    await page.goto("/partner/join");

    await fillJoinWizard(page);
    // "password" satisfies the OLD client rule (min 8) and fails the server's.
    await page.locator('input[name="password"]').fill("password");
    await page.locator('input[name="confirmPassword"]').fill("password");
    await page.getByRole("button", { name: /submit|register|create/i }).last().click();

    // Told which rule was missed, on the page — not "Invalid" from the server.
    await expect(page.getByText(/uppercase/i).first()).toBeVisible();
    // And the request never left the browser.
    expect(stub.functionCalls("partner-register")).toHaveLength(0);
  });

  test("a server validation failure surfaces the field, not 'non-2xx status code'", async ({
    page,
  }) => {
    const stub = await installSupabaseStub(page, {
      partner: null,
      registerResponse: {
        status: 400,
        body: { error: "Invalid request data", details: ["email: already registered"] },
      },
    });
    await page.goto("/partner/join");

    await fillJoinWizard(page);
    await page.getByRole("button", { name: /submit|register|create/i }).last().click();

    await expect
      .poll(() => stub.functionCalls("partner-register").length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // The `details` array reaches the partner…
    await expect(page.getByText(/already registered/i).first()).toBeVisible({ timeout: 10_000 });
    // …and supabase-js's useless generic message does not.
    await expect(page.getByText(/non-2xx status code/i)).toHaveCount(0);
  });
});

// ============================================================
//  Leg 2 — verify
// ============================================================

test.describe("verify", () => {
  test("a token is exchanged with partner-verify and confirms the account", async ({ page }) => {
    const stub = await installSupabaseStub(page, { partner: PARTNER_ROW });
    await page.goto("/partner/verify?token=stub-verification-token");

    await expect
      .poll(() => stub.functionCalls("partner-verify").length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const body = stub.functionCalls("partner-verify")[0].body as Record<string, unknown>;
    expect(body.token).toBe("stub-verification-token");
    await expect(page.getByText(/verified|success/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("a missing token is refused without calling the function", async ({ page }) => {
    const stub = await installSupabaseStub(page, { partner: PARTNER_ROW });
    await page.goto("/partner/verify");

    await expect(page.getByText(/no verification token/i)).toBeVisible({ timeout: 10_000 });
    expect(stub.functionCalls("partner-verify")).toHaveLength(0);
  });
});

// ============================================================
//  Leg 3 — log in
// ============================================================

test.describe("log in", () => {
  async function signIn(page: Page) {
    await page.locator('input[name="email"], input[type="email"]').first().fill(
      VALID_PARTNER_FORM.email
    );
    await page.locator('input[type="password"]').first().fill(VALID_PARTNER_FORM.password);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  }

  test("an active partner reaches the dashboard", async ({ page }) => {
    await installSupabaseStub(page, { partner: PARTNER_ROW });
    await page.goto("/partner/login");
    await signIn(page);

    // Leg 4 in the same act: past `ProtectedRoute requirePartner`, which needs
    // `get_user_role_info` to have been re-read AFTER sign-in. Landing anywhere
    // else — /join, /unauthorized — is the redirect-race regression.
    await expect(page).toHaveURL(new RegExp(`${DASHBOARD}$`), { timeout: 20_000 });
    await expect(page).not.toHaveURL(/unauthorized|\/join/);
  });

  // The allowlist: every non-active status is refused, with a message that says
  // something true and actionable. `invited` is the one that used to slip through.
  const REFUSALS: { status: PartnerStatus; expect: RegExp }[] = [
    { status: "invited", expect: /invitation/i },
    { status: "pending", expect: /verification/i },
    { status: "suspended", expect: /suspended/i },
  ];

  for (const { status, expect: expected } of REFUSALS) {
    test(`a ${status} partner is refused and not left on the dashboard`, async ({ page }) => {
      await installSupabaseStub(page, {
        partner: { id: "p-1", status, contact_name: "Ana" },
      });
      await page.goto("/partner/login");
      await signIn(page);

      await expect(page.getByText(expected).first()).toBeVisible({ timeout: 20_000 });
      await expect(page).not.toHaveURL(new RegExp(`${DASHBOARD}$`));
      await expect(page).not.toHaveURL(/unauthorized/);
    });
  }

  test("an applicant with no linked login is not told their email is unknown", async ({ page }) => {
    // The application row HAS their email and no `user_id`; the lookup is by
    // `user_id`, so "no account found for this email" was false for exactly the
    // people most likely to read it.
    await installSupabaseStub(page, { partner: null });
    await page.goto("/partner/login");
    await signIn(page);

    await expect(page.getByText(/no partner account is linked/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/found for this email/i)).toHaveCount(0);
  });
});

// ============================================================
//  Leg 4 — the dashboard guard, on its own
// ============================================================

test.describe("the dashboard guard", () => {
  test("an anonymous visitor is sent to the partner login, not the member login", async ({
    page,
  }) => {
    await installSupabaseStub(page, { partner: null });
    await page.goto(DASHBOARD);
    await expect(page).toHaveURL(/\/partner\/login$/, { timeout: 20_000 });
  });

  test("a signed-in non-partner is refused rather than shown a partner dashboard", async ({
    page,
  }) => {
    await installSupabaseStub(page, {
      partner: PARTNER_ROW,
      // Signed in, but the RPC says not a partner — the authority that decides.
      roleInfo: { is_partner: false, partner_id: null },
    });
    await page.goto("/partner/login");
    await page.locator('input[name="email"], input[type="email"]').first().fill(
      VALID_PARTNER_FORM.email
    );
    await page.locator('input[type="password"]').first().fill(VALID_PARTNER_FORM.password);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();

    await expect(page).not.toHaveURL(new RegExp(`${DASHBOARD}$`), { timeout: 20_000 });
  });
});
