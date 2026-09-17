import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { installSupabaseStub } from "./helpers/supabaseStub";

/**
 * "WHAT AN OPERATOR SEES" ON HOME — and, far more importantly, what Home does NOT show.
 *
 * `src/test/operatorSeesPointer.test.tsx` proves the component renders no medical column. This
 * proves the PAGE does not, which is a different claim and the one that matters: the dashboard
 * fans out half a dozen reads, and the question is whether a member's conditions, medication or
 * key-safe code can reach the screen most likely to be read over their shoulder.
 *
 * So the member seeded here has a FULL medical record with distinctive values, and the assertion
 * is that not one of them appears in the rendered page. A component test cannot make that claim —
 * it renders one component, and the leak would come from a sibling.
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
  billing_source: "stripe",
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
  has_pendant: true,
  amount: 24.95,
  renewal_date: "2026-10-01",
};

/**
 * A FULL record, with values nothing else on the page could produce by accident.
 *
 * Deliberately not "test" or "none": each string is unique enough that finding it anywhere in the
 * dashboard's text is proof of a leak rather than a coincidence.
 */
const MEDICAL_SECRETS = {
  medical_conditions: ["Atrial fibrillation"],
  medications: ["Apixaban 5mg"],
  meds_location: "Top drawer of the hall dresser",
  meds_notes: "Takes them with breakfast",
  allergies: ["Penicillin"],
  mobility: "Walks with a frame indoors",
  hearing_notes: "Deaf in the left ear",
  vision_notes: "Reads with a magnifier",
  doctor_name: "Dr Ignacio Belmonte",
  doctor_phone: "+34950111222",
  doctor_location: "Centro de Salud Albox",
  hospital_preference: "Hospital La Inmaculada",
  blood_type: "AB negative",
  private_insurer: "Sanitas",
  private_policy_number: "POL-99887766",
  additional_notes: "Daughter has a spare key",
};

const ACCESS_SECRETS = {
  key_safe_location: "Behind the gas meter",
  key_safe_code: "7392",
  gate_code: "1145",
  access_notes: "Dog in the back garden",
};

async function signInAsMember(page: Page, opts: { joined: boolean }) {
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
      // NO subscription row at all is what `membershipCondition` reads as `never_joined`.
      subscriptions: opts.joined ? [SUBSCRIPTION] : [],
      system_settings: [
        { key: "settings_emergency_phone", value: "+34 950 473 199" },
        { key: "settings_company_name", value: "ICE Alarm España" },
      ],
      medical_information: [{ member_id: MEMBER_ID, ...MEDICAL_SECRETS }],
      member_access: [{ member_id: MEMBER_ID, ...ACCESS_SECRETS }],
      devices: [],
      orders: [],
      order_items: [],
      alerts: [],
      emergency_contacts: [],
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

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}

for (const width of [1280, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 1280 ? 900 : 844 } });

    test("the pointer is there, and it points at the medical page", async ({ page }, testInfo) => {
      await signInAsMember(page, { joined: true });

      const pointer = page.getByTestId("operator-sees-pointer");
      await expect(pointer).toBeVisible();
      await expect(pointer).toContainText("our operator sees your medical details");
      await expect(page.getByTestId("operator-sees-action")).toHaveAttribute(
        "href",
        "/dashboard/medical",
      );

      /*
        R11: 44px of control to aim at. The reader here is somebody with a tremor.

        POLLED rather than measured once, and `ClientLayout` is the reason: `SidebarContent` is
        declared inside the component body, so every render is a new component type and React
        remounts that subtree. A handle taken a moment earlier can be detached by the time it is
        measured — which is exactly how this read 0 on a CI runner while passing here.
      */
      await expect
        .poll(async () =>
          page
            .getByTestId("operator-sees-action")
            .evaluate((el) => el.getBoundingClientRect().height),
        )
        .toBeGreaterThanOrEqual(44);

      // …and it goes where it says it goes.
      await page.getByTestId("operator-sees-action").click();
      await expect(page).toHaveURL(/\/dashboard\/medical$/);

      await shoot(page, testInfo, `operator-sees-${width}`);
    });

    test("NOT ONE medical value reaches Home", async ({ page }) => {
      /*
        The assertion the brief is actually about. Every value below is in the seeded record and
        would be rendered on the Medical page; none of them may appear here, and neither may a
        count of them. Checked against the rendered TEXT, because a summary somebody adds later
        would be text.
      */
      await signInAsMember(page, { joined: true });
      await expect(page.getByTestId("operator-sees-pointer")).toBeVisible();

      const body = (await page.locator("body").innerText()).toLowerCase();
      const secrets = [
        ...Object.values(MEDICAL_SECRETS).flat(),
        ...Object.values(ACCESS_SECRETS),
      ] as string[];
      for (const secret of secrets) {
        expect(body, `"${secret}" reached the dashboard`).not.toContain(secret.toLowerCase());
      }
      // The column names too — a heading is a disclosure as surely as a value.
      for (const column of [...Object.keys(MEDICAL_SECRETS), ...Object.keys(ACCESS_SECRETS)]) {
        expect(body, column).not.toContain(column.replace(/_/g, " "));
      }
    });

    test("nothing at all for somebody who never joined", async ({ page }) => {
      // "If you press your pendant" is not yet true for them.
      await signInAsMember(page, { joined: false });
      await expect(page.getByTestId("protection-checklist")).toBeVisible();
      await expect(page.getByTestId("operator-sees-pointer")).toHaveCount(0);
    });
  });
}

test.describe("what it did not push off the screen", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the checklist and Messages are both still on the first screen", async ({ page }) => {
    /*
      A signpost that costs a member the thing they came for is a bad trade. The pointer sits
      BELOW the protection/messages grid precisely so it cannot do that, and this is the
      assertion rather than the intention: both cards' boxes start and end inside the viewport
      with the page unscrolled.
    */
    await signInAsMember(page, { joined: true });
    /*
      WAIT FOR THE PAGE TO BE THE PAGE. `signInAsMember` returns on the URL, and the dashboard
      fans out half a dozen queries after that — measuring straight away found no checklist at
      all, which is a fact about timing rather than about layout.
    */
    await expect(page.getByTestId("protection-checklist")).toBeVisible();
    await expect(page.getByTestId("operator-sees-pointer")).toBeVisible();

    const viewport = page.viewportSize()!;
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    /*
      The Messages card has no test id of its own, and this PR is not the place to give it one —
      so it is located as what it IS: the second cell of the grid whose first cell is the
      checklist. That is the layout #455 established, and if somebody takes the card out of that
      grid this fails, which is the right time to look.
    */
    const boxes = await page.evaluate(() => {
      const checklist = document.querySelector('[data-testid="protection-checklist"]');
      const grid = checklist?.parentElement;
      const messages = grid?.children[1];
      const rect = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      };
      return { checklist: rect(checklist), messages: rect(messages) };
    });

    for (const [name, box] of Object.entries(boxes)) {
      expect(box, `${name} was not found`).not.toBeNull();
      expect(box!.bottom, `${name} is below the fold at 1280px`).toBeLessThanOrEqual(
        viewport.height,
      );
    }
  });
});
