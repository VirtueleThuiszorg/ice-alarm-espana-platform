import { test, expect } from "@playwright/test";
import { installSupabaseStub } from "./helpers/supabaseStub";
import { settle } from "./helpers/settle";

/**
 * THE PUBLIC CONTACT FORM, END TO END — the half no unit test can reach.
 *
 * `publicSubmit.test.ts` proves the decision. What it cannot prove is that the FORM still works
 * after being taken off its direct table write: that the submit button reaches the function at
 * all, that the honeypot is invisible to a visitor rather than a field they are asked to leave
 * blank, and that a refusal marks the boxes instead of saying "something went wrong".
 *
 * That last one is the reason this exists. The whole change is only an improvement if a person
 * who mistypes their email is told WHICH box — otherwise a server-side rule is just a form that
 * fails more often, on a site read mostly by people in their seventies and eighties.
 *
 * REAL: the production build, Chromium, the router, the page, the invoke call.
 * STUBBED: Supabase's HTTP surface, including the function's answer.
 */

test.use({ serviceWorkers: "block" });

const FILLED = {
  first_name: "María",
  last_name: "Ruiz",
  email: "maria.ruiz@example.com",
  phone: "600111222",
  message: "Hola, quería preguntar por el colgante para mi padre, que vive solo.",
};

async function fillContactForm(page: import("@playwright/test").Page) {
  await page.locator("#first_name").fill(FILLED.first_name);
  await page.locator("#last_name").fill(FILLED.last_name);
  await page.locator("#email").fill(FILLED.email);
  await page.locator("#phone").fill(FILLED.phone);
  await page.locator("#message").fill(FILLED.message);
}

test("a real enquiry goes through the function, not the table", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stub = await installSupabaseStub(page, {
    tables: {
      system_settings: [
        { key: "settings_emergency_phone", value: "+34 950 473 199" },
        { key: "settings_support_email", value: "info@icealarm.es" },
      ],
    },
  });

  await page.goto("/contact");
  await fillContactForm(page);
  await page.getByRole("button", { name: /send message|enviar/i }).click();

  // The confirmation the visitor sees.
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: "e2e/.report/contact-form-sent.png", fullPage: false });

  const submits = stub.functionCalls("public-submit");
  expect(submits, "the form must call public-submit").toHaveLength(1);

  const body = submits[0].body as {
    form?: string;
    fields?: Record<string, string>;
    company?: string;
  };
  expect(body.form).toBe("contact");
  expect(body.fields?.email).toBe(FILLED.email);
  expect(body.fields?.phone).toBe(FILLED.phone);
  // The honeypot travels with every submission, empty — that is what makes a filled one a signal.
  expect(body.company).toBe("");

  /*
    AND NOTHING WENT STRAIGHT AT THE TABLE. This is the assertion the whole change is about: the
    page used to POST to /rest/v1/leads with the anon key.
  */
  const direct = stub.calls.filter(
    (c) => c.path.includes("/rest/v1/leads") && c.method === "POST",
  );
  expect(direct, "nothing may write leads directly from the browser").toHaveLength(0);
});

test("a refusal marks the boxes it names", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installSupabaseStub(page, {
    tables: { system_settings: [] },
    // Exactly what the function answers for a bad email and an undialable phone.
    publicSubmitResponse: {
      status: 400,
      body: { error: "Invalid submission", fields: ["email", "phone"] },
    },
  });

  await page.goto("/contact");
  await fillContactForm(page);
  await page.getByRole("button", { name: /send message|enviar/i }).click();

  // Named, not just "something went wrong".
  await expect(page.getByTestId("contact-field-errors")).toBeVisible();
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#phone")).toHaveAttribute("aria-invalid", "true");
  // And the boxes it did NOT name are left alone.
  await expect(page.locator("#first_name")).not.toHaveAttribute("aria-invalid", "true");

  await settle(page);
  await page.screenshot({ path: "e2e/.report/contact-form-refused.png", fullPage: false });

  // The form is still there with the answers in it — a refusal that clears the form is worse
  // than no validation at all.
  await expect(page.locator("#first_name")).toHaveValue(FILLED.first_name);
  await expect(page.locator("#message")).toHaveValue(FILLED.message);

  // Typing in a marked box clears its mark straight away, rather than on the next submit.
  await page.locator("#email").fill("maria@example.com");
  await expect(page.locator("#email")).not.toHaveAttribute("aria-invalid", "true");
});

test("the honeypot is invisible to a visitor and to a screen reader", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installSupabaseStub(page, { tables: { system_settings: [] } });
  await page.goto("/contact");

  const pot = page.getByTestId("contact-honeypot");
  await expect(pot).toBeHidden();

  /*
    A TRAP THAT CATCHES ASSISTIVE TECHNOLOGY IS A BARRIER, NOT A TRAP. A screen-reader user
    would be asked for a company name that has to be left blank, with nothing to tell them so;
    a keyboard user would tab into a field they cannot see. Both are checked in the rendered
    page rather than in the markup, because `hidden` and `aria-hidden` are easy to write and
    easy to get wrong.
  */
  const hidden = await pot.evaluate((el) => {
    const container = el.closest("[aria-hidden]");
    return {
      ariaHidden: container?.getAttribute("aria-hidden"),
      tabIndex: (el as HTMLInputElement).tabIndex,
      displayed: (el as HTMLElement).offsetParent !== null,
    };
  });
  expect(hidden.ariaHidden).toBe("true");
  expect(hidden.tabIndex).toBe(-1);
  expect(hidden.displayed).toBe(false);

  // Tabbing through the form never lands on it.
  await page.locator("#first_name").focus();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.id ?? "");
    expect(id).not.toBe("company");
  }
});
