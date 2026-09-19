import { test, expect, type Page } from "@playwright/test";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";
import { settle } from "./helpers/settle";

/**
 * ADDING A LEAD, INTRODUCING ICE ALARM TO THEM, AND THE LINK THEY GET — in a real browser.
 *
 * ── WHY A BROWSER, GIVEN WHAT ALREADY COVERS THIS ───────────────────────────
 *
 *   src/test/staffLead.test.ts        what the server DECIDES about a hand-added lead
 *   src/test/leadMessage.test.ts      which channels, which template, which link
 *   src/test/leadConversion.test.ts   how a registration is matched back
 *   scripts/rls/isolation.sql         who may read a lead, on real PostgreSQL
 *
 * Not one of them can see whether the dialog OPENS, whether the phone number is echoed back as
 * the operator types, or whether `/join?lead=` actually arrives with the fields filled in. Those
 * are the three moments this feature is used at, and all three are invisible to jsdom: a
 * `useEffect` that never fires, a Select that renders nothing, and a route that drops its query
 * string all look identical to a passing unit test.
 *
 * REAL: the production build, Chromium, the router, AuthContext, ProtectedRoute, supabase-js,
 * both Leads pages and the join wizard. STUBBED: Supabase's HTTP surface only.
 */

test.use({ serviceWorkers: "block" });

const OPERATOR: StaffRow = {
  id: "staff-ana",
  // The stub signs everybody in as its own fixed USER_ID, so a staff row with any other
  // `user_id` is a staff row the app cannot find — which reads on screen as a sign-in that
  // never completes. That is how the first version of this spec failed.
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Ana",
  last_name: "Soares",
  email: "operator@icealarm.es",
  role: "call_centre",
  is_active: true,
  is_on_call: false,
};
const PASSWORD = "Operator123";

const JOIN_LINK = "https://icealarm.es/join?lead=Xk3p9QwTzR2vNm7bJ4hL";

/**
 * The tables the CALL-CENTRE SHELL reads on its way to /call-centre/leads, not just the ones
 * this feature uses. The stub answers an unlisted table with an empty array, but the shell's
 * own queries have to resolve for the redirect after sign-in to complete at all — which is what
 * the first version of this spec discovered by timing out on the login page.
 */
const BASE_TABLES = {
  members: [],
  alerts: [],
  staff_shifts: [],
  devices: [],
  subscriptions: [],
  emergency_contacts: [],
  notification_log: [],
  admin_ideas: [],
  member_monitoring_readiness: [],
  staff_on_shift_now: [],
  system_settings: [],
  lead_communications: [],
  tasks: [],
};

const ROSA = {
  id: "lead-rosa",
  first_name: "Rosa",
  last_name: "Delgado",
  email: "rosa@example.es",
  phone: "+34600111222",
  preferred_language: "es",
  enquiry_type: "general",
  message: "Met at the Mojácar stall",
  source: "staff_manual",
  status: "contacted",
  assigned_to: OPERATOR.id,
  notes: null,
  created_at: "2026-09-15T09:00:00.000Z",
  contacted_at: null,
  suspected_spam: false,
  spam_reasons: null,
  do_not_contact: false,
  last_contacted_at: null,
  last_contact_channel: null,
  heard_about: "event",
};

async function signIn(page: Page) {
  await page.goto("/staff/login");
  await page.locator('input[type="email"]').fill(OPERATOR.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/call-centre$/);
}

test.describe("adding a lead by hand", () => {
  test("the number is echoed back as it will be stored, and the lead reaches the server", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const stub = await installSupabaseStub(page, {
      staff: { ...OPERATOR },
      tables: { ...BASE_TABLES, staff: [OPERATOR], leads: [] },
    });

    await signIn(page);
    await page.goto("/call-centre/leads");
    await page.getByTestId("add-lead-open").click();

    await page.locator("#lead-first").fill("Rosa");
    await page.locator("#lead-last").fill("Delgado");

    /*
      THE ASSERTION THIS SPEC EXISTS FOR. An operator types a national number while the person
      is still on the telephone; seeing `+34 600 111 222` appear is how they know it was
      understood. Nothing appearing is the signal to check it before the person rings off.
    */
    await page.locator("#lead-phone").fill("600111222");
    await expect(page.getByTestId("lead-phone-e164")).toHaveText("+34 600 111 222");

    await page.locator("#lead-email").fill("rosa@example.es");
    await page.locator("#lead-heard").click();
    await page.getByRole("option").first().click();

    // THE CONSENT TICK IS NOT PRE-TICKED — asserted in the rendered page, not the markup.
    await expect(page.getByTestId("lead-consent")).not.toBeChecked();
    await page.getByTestId("lead-consent").click();

    await settle(page);
    await page.screenshot({ path: "e2e/.report/lead-add.png", fullPage: false });

    await page.getByTestId("lead-submit").click();
    // The dialog closes only on a confirmed insert, so this is the wait AND the assertion that
    // the happy path happened — no sleep to guess the length of.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const calls = stub.functionCalls("staff-lead");
    expect(calls, "the dialog must go through staff-lead").toHaveLength(1);
    const body = calls[0].body as { fields?: Record<string, string>; consent?: boolean };
    expect(body.consent).toBe(true);
    // Sent as typed; the SERVER normalises. The echo above is a courtesy, not the rule.
    expect(body.fields?.phone).toBe("600111222");
    expect(body.fields?.first_name).toBe("Rosa");

    // AND NOTHING WENT STRAIGHT AT THE TABLE.
    expect(stub.calls.filter((c) => c.path.includes("/rest/v1/leads") && c.method === "POST"))
      .toHaveLength(0);
  });

  test("a duplicate member is refused with somewhere to go", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installSupabaseStub(page, {
      staff: { ...OPERATOR },
      tables: { ...BASE_TABLES, staff: [OPERATOR], leads: [] },
      staffLeadResponse: {
        status: 409,
        body: {
          error: "This person is already a member",
          reason: "duplicate_member",
          fields: [],
          existing: { kind: "member", id: "member-rosa", name: "Rosa Delgado" },
        },
      },
    });

    await signIn(page);
    await page.goto("/call-centre/leads");
    await page.getByTestId("add-lead-open").click();
    await page.locator("#lead-first").fill("Rosa");
    await page.locator("#lead-phone").fill("600111222");
    await page.locator("#lead-heard").click();
    await page.getByRole("option").first().click();
    await page.getByTestId("lead-consent").click();
    await page.getByTestId("lead-submit").click();

    /*
      A REFUSAL WITH NOWHERE TO GO gets worked around by typing the number in differently —
      which produces the duplicate it was meant to prevent. So the refusal carries the record.
    */
    const dup = page.getByTestId("lead-duplicate");
    await expect(dup).toBeVisible();
    await expect(dup).toContainText("Rosa Delgado");
    await expect(dup.getByRole("link")).toHaveAttribute("href", /member-rosa/);

    await settle(page);
    await page.screenshot({ path: "e2e/.report/lead-duplicate.png", fullPage: false });
  });
});

test.describe("introducing ICE Alarm", () => {
  test("the SMS is previewed in the lead's language before anything is sent", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const stub = await installSupabaseStub(page, {
      staff: { ...OPERATOR },
      tables: { ...BASE_TABLES, staff: [OPERATOR], leads: [ROSA] },
      sendLeadMessageResponse: {
        status: 200,
        body: {
          ok: true, preview: true, locale: "es", joinLink: JOIN_LINK,
          report: [{
            channel: "sms", to: ROSA.phone, outcome: "skipped_channel_off",
            body: `ICE Alarm España: hola Rosa, soy Ana Soares. Aquí puede darse de alta: ${JOIN_LINK}`,
          }],
        },
      },
    });

    await signIn(page);
    await page.goto("/call-centre/leads");
    await page.getByText("Rosa").first().click();

    await page.getByTestId("lead-intro-sms").click();

    // THE PREVIEW IS NOT OPTIONAL. Nobody here reads Dutch; an operator sending a template they
    // have never seen is trusting a row in a table to a person they just promised to look after.
    const preview = page.getByTestId("lead-preview");
    await expect(preview).toBeVisible();
    await expect(page.getByTestId("lead-preview-body")).toHaveValue(/hola Rosa, soy Ana Soares/);

    // THE LINK IS ON SCREEN EVEN THOUGH THE CHANNEL IS OFF. With every channel off in
    // production, this is not a fallback — it is how the link actually reaches anybody.
    await expect(page.getByTestId("lead-join-link")).toHaveText(JOIN_LINK);

    await settle(page);
    await page.screenshot({ path: "e2e/.report/lead-intro-preview.png", fullPage: false });

    // Nothing was sent by opening a preview.
    const sends = stub.functionCalls("send-lead-message");
    expect(sends).toHaveLength(1);
    expect((sends[0].body as { preview?: boolean }).preview).toBe(true);
  });
});

test.describe("the personal join link", () => {
  for (const width of [1280, 390]) {
    test(`pre-fills what we already know at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await installSupabaseStub(page, {
        tables: { system_settings: [] },
        leadPrefillResponse: {
          status: 200,
          body: {
            firstName: "Rosa", lastName: "Delgado",
            phone: "+34600111222", email: "rosa@example.es", language: "es",
          },
        },
      });

      /*
        `&plan=&billing=` so the wizard skips its plan step and lands on the personal details —
        the same deep link the pricing CTAs use. Without it step 1 is the plan chooser and there
        is nothing on screen to pre-fill, which would make this spec pass against an empty page.
      */
      await page.goto("/join?lead=Xk3p9QwTzR2vNm7bJ4hL&plan=single&billing=monthly");

      /*
        THE THING NO UNIT TEST CAN SEE. Somebody in their eighties who has just been sent this
        by the person they spoke to. If the effect does not fire, or the router drops the query
        string, or the wizard's state is replaced on mount, the boxes are empty and they are
        asked to retype what we wrote down half an hour ago — which is where a share of them
        stop. All three failures look identical to a passing jsdom test.
      */
      await expect(page.locator('[id$="-firstName"]').first())
        .toHaveValue("Rosa", { timeout: 10000 });
      await expect(page.locator('[id$="-lastName"]').first())
        .toHaveValue("Delgado");
      await expect(page.locator('[id$="-phone"]').first())
        .toHaveValue("+34600111222");

      await settle(page);
      await page.screenshot({ path: `e2e/.report/lead-join-prefilled-${width}.png`, fullPage: false });
    });
  }

  test("and an unknown token simply leaves the form empty", async ({ page }) => {
    // An expired or invented token answers 200-with-nulls, so the wizard is the wizard it has
    // always been. A visitor must never see an error about a lookup they did not ask for.
    await page.setViewportSize({ width: 1280, height: 900 });
    await installSupabaseStub(page, { tables: { system_settings: [] } });

    await page.goto("/join?lead=not-a-real-token&plan=single&billing=monthly");
    await expect(page.locator('[id$="-firstName"]').first())
      .toHaveValue("", { timeout: 10000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
