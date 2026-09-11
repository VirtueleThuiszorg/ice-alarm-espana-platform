// @vitest-environment node
//
// WHAT A LEGACY MEMBER IS CHARGED, and the default that used to answer for them.
//
// ── THE DEFECT ────────────────────────────────────────────────────────────────
//
// The switch link read the plan out of the member's `subscriptions` row:
//
//     .select("plan_type, billing_frequency")
//
// Those columns are not what Karma said. `mapMembership` parses Karma's free-text membership
// label and returns NULL when the label names no plan; `ice_import_member` then stores
//
//     COALESCE((s->>'plan_type')::plan_type, 'single'),
//     COALESCE((s->>'billing_frequency')::billing_frequency, 'annual')
//
// so "Karma said single" and "Karma said nothing" arrive identical. A couple whose label did not
// parse would have been sent a link for the SINGLE price; a monthly member whose label did not
// parse, a link for a WHOLE YEAR. Lee's brief names the source — the plan comes "from
// legacy_membership_type" — and these tests hold the code to it.
//
// ── THE RULE BEING TESTED ─────────────────────────────────────────────────────
//
// A default cannot confirm itself. `single` and `annual` are the import's fallbacks, so a stored
// one proves nothing; `couple` and `monthly` are never defaulted, so a stored one is evidence.
// Anything left over is UNCONFIRMED, and unconfirmed is refused rather than priced.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  billingFrequencyFromLabel,
  planNotConfirmedMessage,
  planTypeFromLabel,
  resolveLegacyPlan,
} from "../../supabase/functions/_shared/legacy-plan";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => stripComments(read(p));

/** The import's defaults, spelled out once so the tests below read as the trap they describe. */
const IMPORT_DEFAULTS = { storedPlanType: "single", storedBillingFrequency: "annual" };

describe("reading Karma's membership label", () => {
  it("finds the plan in the labels the export actually contains", () => {
    expect(planTypeFromLabel("Single")).toBe("single");
    expect(planTypeFromLabel("Couple Annual")).toBe("couple");
    expect(planTypeFromLabel("Couple 2 pendants")).toBe("couple");
    // Case and surrounding words do not matter; the label is typed by hand.
    expect(planTypeFromLabel("  COUPLE membership  ")).toBe("couple");
  });

  it("says nothing rather than guessing when the label names no plan", () => {
    expect(planTypeFromLabel("FOC — Ayuntamiento")).toBeNull();
    expect(planTypeFromLabel("")).toBeNull();
    expect(planTypeFromLabel(null)).toBeNull();
  });

  it("reads the frequency out of EITHER column, because either can carry it", () => {
    expect(billingFrequencyFromLabel("Couple Annual", null)).toBe("annual");
    expect(billingFrequencyFromLabel("Single", "Monthly")).toBe("monthly");
    expect(billingFrequencyFromLabel("Single", "Yearly")).toBe("annual");
    expect(billingFrequencyFromLabel(null, "monthly dd")).toBe("monthly");
  });

  it("does not let a word span the two columns", () => {
    // 'Annu' + 'al' must not become "annual" — the columns are joined with a space on purpose.
    expect(billingFrequencyFromLabel("Annu", "al")).toBeNull();
  });

  it("says nothing when neither column names one", () => {
    expect(billingFrequencyFromLabel("FOC — Ayuntamiento", "DD")).toBeNull();
  });
});

describe("resolveLegacyPlan", () => {
  it("takes both halves off the label when the label says both", () => {
    expect(
      resolveLegacyPlan({ label: "Couple Annual", paymentType: "DD", ...IMPORT_DEFAULTS }),
    ).toEqual({ confirmed: true, membershipType: "couple", billingFrequency: "annual" });
  });

  it("takes the frequency off Karma's Payment Type when the label is silent about it", () => {
    expect(
      resolveLegacyPlan({
        label: "Single",
        paymentType: "Monthly",
        storedPlanType: "single",
        storedBillingFrequency: "monthly",
      }),
    ).toEqual({ confirmed: true, membershipType: "single", billingFrequency: "monthly" });
  });

  /*
    THE WHOLE POINT, stated as the case that used to be charged.

    A label naming no plan, with the import's defaults sitting in the subscription row. The old
    code read those two columns and would have built a SINGLE, ANNUAL link — the wrong price if
    they are a couple, and a year's monitoring at once if they pay monthly. Both look exactly
    like a correct answer on the invoice.
  */
  it("refuses the import's own defaults — a default cannot confirm itself", () => {
    const resolution = resolveLegacyPlan({
      label: "FOC — Ayuntamiento",
      paymentType: "DD",
      ...IMPORT_DEFAULTS,
    });
    expect(resolution).toEqual({
      confirmed: false,
      missing: ["plan", "frequency"],
      label: "FOC — Ayuntamiento",
    });
  });

  it("refuses when the member has no CRM profile at all and only the defaults remain", () => {
    expect(
      resolveLegacyPlan({ label: null, paymentType: null, ...IMPORT_DEFAULTS }).confirmed,
    ).toBe(false);
  });

  /*
    AND THE OTHER HALF OF THE RULE: `couple` and `monthly` are never written by the COALESCE, so
    the only way either got into the column is that something read it off Karma. Those rows are
    confirmed even with the profile label missing — otherwise the refusal would be sweeping
    rather than accurate, and the office would be bell for members whose plan is perfectly well
    known.
  */
  it("accepts a stored couple / monthly, which the import never invents", () => {
    expect(
      resolveLegacyPlan({
        label: null,
        paymentType: null,
        storedPlanType: "couple",
        storedBillingFrequency: "monthly",
      }),
    ).toEqual({ confirmed: true, membershipType: "couple", billingFrequency: "monthly" });
  });

  it("names only the half it cannot establish", () => {
    expect(
      resolveLegacyPlan({ label: "Couple", paymentType: "DD", ...IMPORT_DEFAULTS }),
    ).toEqual({ confirmed: false, missing: ["frequency"], label: "Couple" });

    expect(
      resolveLegacyPlan({
        label: "Annual membership",
        paymentType: null,
        ...IMPORT_DEFAULTS,
      }),
    ).toEqual({ confirmed: false, missing: ["plan"], label: "Annual membership" });
  });
});

describe("what staff are told when it cannot be established", () => {
  const unresolved = resolveLegacyPlan({
    label: "FOC — Ayuntamiento",
    paymentType: "DD",
    ...IMPORT_DEFAULTS,
  });

  it("quotes Karma's own words, because that is what the person will be reading", () => {
    const message = planNotConfirmedMessage("Mary Doe", unresolved);
    expect(message).toContain("Mary Doe");
    expect(message).toContain("FOC — Ayuntamiento");
  });

  /*
    AND IT MUST NOT SEND THEM TO THE ORDINARY PAYMENT LINK, which the first version of this
    refusal did ("or send an ordinary payment link naming it"). An ordinary link leaves
    `billing_source` on `legacy`, so the member stays in the Santander export and is collected
    from twice in the month they pay Stripe — the exact outcome `switch_pending` exists to stop.
  */
  it("does not tell them to send an ordinary payment link instead", () => {
    expect(planNotConfirmedMessage("Mary Doe", unresolved)).toMatch(
      /do not send an ordinary payment link/i,
    );
  });

  it("has nothing to say about a plan that IS confirmed", () => {
    const confirmed = resolveLegacyPlan({ label: "Couple Annual", paymentType: null, ...IMPORT_DEFAULTS });
    expect(planNotConfirmedMessage("Mary Doe", confirmed)).toBe("");
  });
});

describe("one implementation of the label, not two", () => {
  /*
    The import reads this label at import time and the switch link reads it years later. Two
    parsers for one label is how they end up disagreeing about whether somebody is a couple, and
    the disagreement is about money — so the import IMPORTS the readers rather than keeping its
    own regexes.
  */
  it("the CRM import calls the shared readers", () => {
    const importer = code("src/lib/iceCrmImport.ts");
    expect(importer).toMatch(/from "\.\.\/\.\.\/supabase\/functions\/_shared\/legacy-plan"/);
    expect(importer).toMatch(/planType[^;]*=\s*planTypeFromLabel\(label\)/);
    expect(importer).toMatch(/billingFrequencyFromLabel\(label, paymentType\)/);
  });

  it("and keeps no copy of the patterns", () => {
    const mapper = code("src/lib/iceCrmImport.ts");
    const fn = mapper.slice(mapper.indexOf("export function mapMembership"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).not.toContain("/couple/");
    expect(body).not.toContain("annual|yearly");
  });
});

describe("the switch link reads the label, not the subscription row", () => {
  const fn = code("supabase/functions/send-payment-link/index.ts");

  it("loads the member's CRM profile", () => {
    expect(fn).toMatch(/from\("crm_profiles"\)[\s\S]{0,200}legacy_membership_type, legacy_payment_type/);
  });

  it("decides through the shared module rather than reading the columns directly", () => {
    expect(fn).toMatch(/resolveLegacyPlan\(\{/);
    // The selection is built from what the resolution (or a staff confirmation) says, never
    // straight off `existing.plan_type` as it used to be.
    expect(fn).not.toMatch(/legacySwitchSelection\(\{[\s\S]{0,120}existing\.plan_type/);
  });

  it("refuses before it asks Stripe for anything", () => {
    expect(fn).toContain("PLAN_NOT_CONFIRMED");
    expect(fn.indexOf("PLAN_NOT_CONFIRMED")).toBeLessThan(
      fn.indexOf("stripe.checkout.sessions.create"),
    );
  });

  /*
    THE CONFIRMATION IS NARROW, and it has to be: a request field that names a plan is the F7
    defect with a different name. Two guards, both asserted, because either one alone is not
    enough — the runner has nobody behind it, and a browser must never overrule a plan the server
    could read for itself.
  */
  it("takes a staff confirmation only when it could not read the plan, and never from the runner", () => {
    expect(fn).toMatch(/!resolution\.confirmed && !isRunner \? body\.confirmPlan : undefined/);
  });
});
