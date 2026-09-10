// @vitest-environment node
//
// THE ADMIN SCREEN MUST WRITE THE KEY THE MONEY PATH READS.
//
// The registration fee had two families of key and nobody noticed for months. `SettingsPage.tsx`
// wrote `settings_registration_fee_enabled`; the wizard, the server and the shared quote all read
// `registration_fee_enabled`. So the switch labelled "charge a registration fee" changed a row
// nothing consulted, and turning it off still charged €59.99.
//
// Migration 20260908120000 (P5) settled it — copy any value across to the unprefixed rows, then
// DELETE the prefixed ones — and it is applied to production. But a migration cannot fix a
// constant in a TSX file, and for two days only the migration half had landed. That made the
// screen WORSE than the original bug rather than better: reading a row the migration had deleted,
// the toggle fell back to `?? "true"` and displayed the fee as ON no matter what was charged.
//
// WHY THIS TEST IS SOURCE-READ AND NOT A RENDER. The defect is not in behaviour that a rendered
// page shows — a rendered page reads and writes whatever key it holds, quite happily, and looks
// correct doing it. The defect is that two files disagree about a string. So the assertion has to
// be about those strings, taken from both sides, and it is the one shape of test that would have
// caught this on the day it was written.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** The `KEY` constant the admin Settings page writes through. */
function adminKey(name: string): string {
  const src = read("src/pages/admin/SettingsPage.tsx");
  const m = src.match(new RegExp(`${name}:\\s*"([a-z0-9_]+)"`));
  expect(m, `SettingsPage KEY.${name} not found`).not.toBeNull();
  return m![1];
}

/** Every `system_settings` key a file names in a plain string. */
function keysIn(path: string): string[] {
  return [...read(path).matchAll(/"([a-z0-9_]*registration_fee[a-z0-9_]*)"/g)].map((m) => m[1]);
}

/**
 * The three readers on the money path. Each one decides what a customer is charged, so each one
 * is a place the admin switch has to reach:
 *
 *   usePricingSettings.ts        the join wizard's own quote, shown to the customer
 *   submit-registration          the order it writes when they submit
 *   _shared/checkout-pricing.ts  the amount the checkout session is created with
 */
const READERS = [
  "src/hooks/usePricingSettings.ts",
  "supabase/functions/submit-registration/index.ts",
  "supabase/functions/_shared/checkout-pricing.ts",
];

describe("the registration-fee switch writes what the money path reads", () => {
  it("every reader reads the same key, and it is the unprefixed one", () => {
    for (const reader of READERS) {
      const keys = keysIn(reader);
      expect(keys.length, `${reader} names no registration-fee key`).toBeGreaterThan(0);
      expect(keys, `${reader} must read the canonical key`).toContain("registration_fee_enabled");
      // The prefixed family was deleted from production by 20260908120000. A reader that still
      // named it would be reading a row that does not exist.
      expect(keys, `${reader} still reads the deleted prefixed row`)
        .not.toContain("settings_registration_fee_enabled");
    }
  });

  it("the admin page writes that exact key, not a prefixed cousin", () => {
    expect(adminKey("REG_FEE_ENABLED")).toBe("registration_fee_enabled");
    expect(adminKey("REG_FEE_DISCOUNT")).toBe("registration_fee_discount");
  });

  it("and the page's own read uses the same constant, so the screen cannot disagree with the charge", () => {
    // The bug that landed in between: the page wrote one key and read another, so what it
    // DISPLAYED and what it CHARGED could differ in either direction.
    const src = read("src/pages/admin/SettingsPage.tsx");
    const block = src.slice(src.indexOf("setRegistrationFeeSettings({"));
    expect(block.slice(0, 300)).toContain("KEY.REG_FEE_ENABLED");
    expect(block.slice(0, 300)).not.toContain('"settings_registration_fee');
  });

  it("P5 is a migration in the repo, so the prefixed rows really are gone from production", () => {
    // Without this the test above asserts a convention; with it, it asserts the state of the
    // database the convention exists to match.
    const p5 = read("supabase/migrations/20260908120000_settings_read_policies.sql");
    expect(p5).toContain("DELETE FROM public.system_settings");
    expect(p5).toContain("settings_registration_fee_enabled");
    const applied = read("supabase/migrations/APPLIED_TO_PROD.txt");
    expect(applied, "P5 must be applied for the unprefixed key to be the live one")
      .toContain("20260908120000");
  });
});
