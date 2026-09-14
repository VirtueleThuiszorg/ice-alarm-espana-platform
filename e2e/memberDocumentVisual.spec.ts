import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { installSupabaseStub, type StaffRow } from "./helpers/supabaseStub";
import { settle } from "./helpers/settle";

/**
 * THE MEMBER RECORD AS A DOCUMENT, PHOTOGRAPHED — and printed to an actual A4 PDF.
 *
 * ── WHY A BROWSER ───────────────────────────────────────────────────────────
 *
 * `memberDocument.test.ts` asserts the strings and the CSS rules. It cannot tell you whether the
 * sheet LOOKS like a document, whether the masthead survives 390px, or whether the fixed footer
 * lands on top of the last section. jsdom applies no stylesheet and has no pagination: @page,
 * break-inside and position:fixed are all no-ops there, which is to say the three rules that
 * make this a printable document are exactly the three no unit test can check.
 *
 * ── WHAT IS REAL HERE ───────────────────────────────────────────────────────
 *
 * The production build, Chromium, the router, staff login, the real dialog, and THE REAL PRINT
 * HTML: the PDF below is rendered from the document the app itself wrote into its print iframe,
 * lifted out of the page rather than rebuilt by the test. A test that re-rendered the document
 * from the library would be photographing its own work, not the product's. STUBBED: Supabase's
 * HTTP surface.
 *
 * David Evans is the brief's test record. Both states of the identity-numbers box are captured,
 * because "default OFF" is a claim about a document and the only honest proof is two documents.
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
const MEMBER_ID = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-09-14T13:04:00.000Z");
const OUT = "e2e/.report";

const member = {
  id: MEMBER_ID,
  user_id: null,
  first_name: "David",
  last_name: "Evans",
  email: "david.evans@example.com",
  phone: "+34600111222",
  date_of_birth: "1947-03-09",
  nie_dni: "X1234567L",
  passport_number: "PA0099887",
  an_ss_number: "28/12345678-90",
  nationality: "British",
  preferred_language: "en",
  address_line_1: "Calle Mayor 14",
  urbanizacion: "Vista del Mar",
  bloque: "3",
  portal: "B",
  escalera: "2",
  city: "Albox",
  province: "Almería",
  postal_code: "04800",
  country: "Spain",
  // The paragraph that proves the note box: squeezed into a value column this is unreadable.
  special_instructions:
    "Key safe is on the left of the gate, code with the daughter. The dog is friendly but barks. Ring twice — David is hard of hearing and takes a while to reach the door.",
  status: "active",
  photo_url: null,
  created_at: "2025-06-02T09:00:00.000Z",
};

const tables = {
  members: [member],
  medical_information: [
    {
      member_id: MEMBER_ID,
      blood_type: "O+",
      allergies: ["Penicillin", "Shellfish"],
      medical_conditions: ["Atrial fibrillation", "Type 2 diabetes"],
      current_medications: ["Apixaban 5mg", "Metformin 1g"],
      mobility_notes: "Walks with a stick indoors, wheelchair for distance.",
    },
  ],
  emergency_contacts: [
    {
      id: "c1",
      member_id: MEMBER_ID,
      contact_name: "Sarah Evans",
      relationship: "Daughter",
      phone: "+34600333444",
      email: "sarah@example.com",
      is_primary: true,
      speaks_spanish: true,
      can_attend_in_person: true,
      priority_order: 1,
    },
    {
      id: "c2",
      member_id: MEMBER_ID,
      contact_name: "Dr Pablo Ruiz",
      relationship: "Doctor",
      phone: "+34950473100",
      can_attend_in_person: false,
      priority_order: 2,
    },
  ],
  devices: [
    {
      id: "d1",
      member_id: MEMBER_ID,
      imei: "351111111111111",
      model: "Vivago SOS",
      sim_phone_number: "+34600999888",
      status: "active",
      is_online: true,
      battery_level: 87,
      last_checkin_at: "2026-09-14T06:15:00.000Z",
    },
  ],
  member_monitoring_readiness: [{ member_id: MEMBER_ID, device_tested_at: "2026-08-01T10:00:00Z" }],
  subscriptions: [
    {
      id: "s1",
      member_id: MEMBER_ID,
      plan_type: "premium",
      status: "active",
      billing_frequency: "monthly",
      amount: 39.99,
      payment_method: "sepa_debit",
      has_pendant: true,
      renewal_date: "2026-10-02",
      payer_id: null,
      created_at: "2025-06-02T09:00:00.000Z",
    },
  ],
  // The company block on the document comes from here, never from a literal in the code.
  system_settings: [
    { key: "settings_company_name", value: "ICE Alarm España" },
    { key: "settings_emergency_phone", value: "+34 950 473 199" },
    { key: "settings_support_email", value: "info@icealarm.es" },
    { key: "settings_address", value: "Calle Principal 1, Albox, 04800 Almería" },
  ],
  partner_attributions: [],
  tasks: [],
  alerts: [],
};

async function openOverview(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(NOW);
  await installSupabaseStub(page, { staff: { ...OPERATOR }, tables });

  await page.goto("/staff/login");
  await page.locator('input[type="email"]').fill(OPERATOR.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/call-centre$/);

  await page.goto(`/call-centre/members/${MEMBER_ID}`);
  await page.getByTestId("member-overview-trigger").click();
  await expect(page.getByTestId("member-document")).toBeVisible();
  await expect(page.getByTestId("member-document-section-identity")).toBeVisible();
  await settle(page);
}

/**
 * The print document the APP wrote, lifted out of its own iframe.
 *
 * `window.print()` is a no-op in headless Chromium, so the click leaves the frame in place with
 * its document already written — which is precisely the artefact we want to photograph. Reading
 * it beats rebuilding it: this is the HTML a member's printer receives.
 */
async function liftPrintHtml(page: Page): Promise<string> {
  await page.getByRole("button", { name: /print \/ save as pdf/i }).click();
  return page.evaluate(() => {
    const frames = document.querySelectorAll("iframe");
    const frame = frames[frames.length - 1];
    return frame.contentDocument!.documentElement.outerHTML;
  });
}

for (const [label, width, height] of [
  ["1280", 1280, 900],
  ["390", 390, 844],
] as const) {
  test(`the member record document at ${label}px`, async ({ page }) => {
    await openOverview(page, width, height);

    const sheet = page.getByTestId("member-document");
    /*
      THE DIALOG, NOT THE ARTICLE INSIDE IT. The document is taller than its scroll area, and an
      element screenshot of it stitches the whole article — which drags the page behind the modal
      into the picture and reads as a rendering defect that is really a capture artefact. What a
      reviewer needs to see is what a staff member sees: the dialog.
    */
    await page
      .locator('[role="dialog"]')
      .screenshot({ path: `${OUT}/member-document-${label}.png` });

    // The masthead says which company holds this, and the notice says what it is. Both on the
    // SCREEN sheet, not only the printed one — that split is the defect this goal exists to fix.
    await expect(sheet).toContainText("ICE Alarm");
    await expect(sheet).toContainText("Member record");
    await expect(sheet).toContainText("David Evans");
    await expect(sheet).toContainText("Destroy securely when no longer needed");

    // Default OFF, on screen as on paper.
    await expect(sheet).toContainText("NIE / DNI");
    await expect(sheet).not.toContainText("X1234567L");

    /*
      THE ONE THING A PHOTOGRAPH CANNOT BE TRUSTED ON at 390px: whether the document forces the
      page to scroll sideways. A screenshot cropped to the viewport looks identical either way.
    */
    const escapes = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="member-document"]');
      if (!root) return ["the document is missing"];
      const limit = root.getBoundingClientRect().right;
      const out: string[] = [];
      root.querySelectorAll<HTMLElement>("*").forEach((el) => {
        if (el.getBoundingClientRect().right > limit + 1) {
          out.push(`${el.tagName}.${String(el.className).slice(0, 40)}`);
        }
      });
      return out.slice(0, 5);
    });
    expect(escapes, "nothing on the document may run past its own right edge").toEqual([]);
  });
}

test("the printed sheet is an A4 document, with and without identity numbers", async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await openOverview(page, 1280, 900);

  // ── DEFAULT: the numbers stay in the building ──
  const off = await liftPrintHtml(page);
  expect(off).not.toContain("X1234567L");
  expect(off).not.toContain("PA0099887");
  expect(off).toContain("Held — not printed");

  // ── TICKED: printed in full, because somebody decided so on this sheet ──
  await page.getByTestId("member-overview-identity-numbers").click();
  const on = await liftPrintHtml(page);
  expect(on).toContain("X1234567L");
  expect(on).toContain("PA0099887");

  for (const [name, html] of [
    ["identity-off", off],
    ["identity-on", on],
  ] as const) {
    fs.writeFileSync(path.join(OUT, `member-document-print-${name}.html`), html);

    const sheet = await page.context().newPage();
    await sheet.setContent(html, { waitUntil: "load" });
    await sheet.emulateMedia({ media: "print" });
    // A4 at the print stylesheet's own margins, so the PDF is the page, not a screenshot of it.
    await sheet.pdf({ path: path.join(OUT, `member-document-${name}.pdf`), format: "A4" });

    /*
      A PNG OF THE PAGE, at A4 proportions, because a PDF is not reviewable in a pull request.
      794 x 1123 CSS px is A4 at 96dpi — the same page the PDF holds, in a form somebody can
      look at without downloading anything.
    */
    await sheet.setViewportSize({ width: 794, height: 1123 });
    await sheet.screenshot({ path: path.join(OUT, `member-document-page1-${name}.png`) });

    /*
      THE MARKING THAT REPEATS IS IN THE PAGE MARGIN, AND THE FULL NOTICE IS AT THE END.

      This is where the mechanism was settled by looking rather than reasoning. The first two
      attempts used `position: fixed` — once at the foot of the content box, once pulled into a
      widened margin with a negative offset — and the rendered PDF showed the notice printed
      across the middle of the Emergency contacts section on page two both times. Chrome paints a
      fixed element at the same offset on every sheet and lets the text flow on underneath it.

      So: one line in the @page bottom margin (which text can never enter) carries the member,
      the company and the word "confidential" in three languages on every sheet, plus the page
      counter; the full three-language notice is an ordinary block at the end. What this asserts
      is that the in-flow footer is NOT pinned — if anybody reintroduces position:fixed here, the
      overlap comes back and this goes red.
    */
    const footer = await sheet.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".doc-footer")!;
      return { position: getComputedStyle(el).position, text: el.textContent ?? "" };
    });
    expect(footer.position, "a pinned footer overlaps the text on every page but the last").toBe(
      "static",
    );
    expect(footer.text).toContain("Destroy securely when no longer needed");
    expect(html).toContain("@bottom-left");
    expect(html).toContain('counter(page) " / " counter(pages)');

    await sheet.close();
  }

  for (const f of [
    "member-document-identity-off.pdf",
    "member-document-identity-on.pdf",
    "member-document-page1-identity-off.png",
  ]) {
    expect(fs.statSync(path.join(OUT, f)).size, `${f} is empty`).toBeGreaterThan(1000);
  }
});

/**
 * THE MEMBER'S OWN COPY — the same document, from the other side of the product.
 *
 * The whole point of one template is that these two surfaces cannot drift. A class-name test
 * proves the component is imported; only a photograph of both shows that a member's own record
 * and the staff record are recognisably the same document, and only a rendered PDF shows that
 * the member's copy is A4 rather than a printed modal.
 *
 * The identity rule is INVERTED here, on purpose: a NIE is withheld on the staff sheet, which is
 * printed about a member by somebody else, and printed on this one, which is the member's own
 * answer to "what do you hold about me".
 */
test("the member's own record is the same document", async ({ page }) => {
  const OWN_ID = "44444444-4444-4444-4444-444444444444";
  const EMAIL = "david.evans@example.com";

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(NOW);
  await installSupabaseStub(page, {
    staff: null,
    partner: null,
    roleInfo: {
      is_staff: false,
      staff_role: null,
      is_partner: false,
      partner_id: null,
      member_id: OWN_ID,
    },
    tables: {
      ...tables,
      members: [{ ...member, id: OWN_ID, user_id: "f330e208-3648-4c99-8e04-79876d204e50" }],
      medical_information: [{ ...tables.medical_information[0], member_id: OWN_ID }],
      emergency_contacts: tables.emergency_contacts.map((c) => ({ ...c, member_id: OWN_ID })),
      devices: [],
      orders: [],
      order_items: [],
      member_access: [],
      member_notification_optin: [],
      pricing_plans: [],
      pricing_settings: [],
      subscriptions: [],
    },
  });

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill("Member123");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByTestId("dashboard-review-details").click();
  await expect(page.getByTestId("member-document")).toBeVisible();
  await settle(page);
  await page
    .locator('[role="dialog"]')
    .screenshot({ path: `${OUT}/member-document-portal-1280.png` });

  const sheet = page.getByTestId("member-document");
  await expect(sheet).toContainText("ICE Alarm");
  await expect(sheet).toContainText("David Evans");
  await expect(sheet).toContainText("Destroy securely when no longer needed");
  // Their own NIE, in full — the inversion this surface exists to get right.
  await expect(sheet).toContainText("X1234567L");
  await expect(sheet).not.toContainText("Held — not printed");

  await page.getByTestId("review-details-print").click();
  const html = await page.evaluate(() => {
    const frames = document.querySelectorAll("iframe");
    return frames[frames.length - 1].contentDocument!.documentElement.outerHTML;
  });
  expect(html).toContain("@bottom-left");
  expect(html).toContain("X1234567L");

  const printed = await page.context().newPage();
  await printed.setContent(html, { waitUntil: "load" });
  await printed.emulateMedia({ media: "print" });
  await printed.pdf({ path: path.join(OUT, "member-document-portal.pdf"), format: "A4" });
  expect(fs.statSync(path.join(OUT, "member-document-portal.pdf")).size).toBeGreaterThan(1000);
  await printed.close();
});
