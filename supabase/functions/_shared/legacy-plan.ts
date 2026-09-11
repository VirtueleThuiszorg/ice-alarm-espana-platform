/**
 * WHAT KARMA BILLED THIS MEMBER — read from the label Karma wrote, never from a default.
 *
 * ── THE DEFECT THIS MODULE EXISTS TO FIX ──────────────────────────────────────
 *
 * The switch link used to take the plan from the member's `subscriptions` row:
 *
 *     .select("plan_type, billing_frequency")      // send-payment-link, legacy_switch mode
 *
 * Those two columns are not what Karma said. The CRM import parses Karma's free-text
 * `Membership Type` label, and when the label is silent it hands back NULL — but
 * `ice_import_member` then writes
 *
 *     COALESCE((s->>'plan_type')::plan_type, 'single'),
 *     COALESCE((s->>'billing_frequency')::billing_frequency, 'annual')
 *
 * so "Karma said single" and "Karma said nothing" arrive in the same column looking identical.
 * A couple whose label did not parse would have been sent a link for the SINGLE price, and a
 * monthly member whose label did not parse a link for a YEAR of monitoring. Neither is a bug
 * anybody would notice before the money moved.
 *
 * Lee's brief names the source: the plan comes "from legacy_membership_type" — the verbatim
 * Karma label on `crm_profiles`. This module is that reading, and the refusal when it cannot.
 *
 * ── THE RULE: A DEFAULT CANNOT CONFIRM ITSELF ─────────────────────────────────
 *
 * `single` and `annual` are the import's fallbacks, so a stored `single`/`annual` proves
 * nothing. `couple` and `monthly` are never defaulted — the only way either got into the column
 * is that something read it off Karma — so a stored `couple` or `monthly` IS evidence, and is
 * accepted for the rows whose profile label was lost or never written.
 *
 * Everything else is UNCONFIRMED, and an unconfirmed plan is not a plan to charge. Staff
 * confirm it on the record; the unattended runner never guesses.
 *
 * ── ONE IMPLEMENTATION ────────────────────────────────────────────────────────
 *
 * `src/lib/iceCrmImport.ts` reads the same label at import time and imports the two readers
 * below rather than keeping its own copy of the regexes. Two parsers for one label is how the
 * import and the switch link end up disagreeing about what somebody is paying for.
 */

export type LegacyPlanType = "single" | "couple";
export type LegacyBillingFrequency = "monthly" | "annual";

/**
 * Single or couple, from Karma's free-text membership label.
 *
 * Real values in the export look like 'Single', 'Couple Annual', 'Couple 2 pendants',
 * 'FOC — Ayuntamiento'. The last of those names no plan at all, which is the case this returns
 * NULL for rather than assuming the cheaper one.
 */
export function planTypeFromLabel(label: string | null | undefined): LegacyPlanType | null {
  const l = (label ?? "").toLowerCase();
  if (/couple/.test(l)) return "couple";
  if (/single/.test(l)) return "single";
  return null;
}

/**
 * Monthly or annual, from the membership label and Karma's `Payment Type` together.
 *
 * BOTH columns, because either one can carry it: 'Couple Annual' says it in the membership
 * label, and a bare 'Single' with `Payment Type` = 'Monthly' says it in the other. Joined with a
 * space so a word cannot span the two.
 */
export function billingFrequencyFromLabel(
  label: string | null | undefined,
  paymentType: string | null | undefined,
): LegacyBillingFrequency | null {
  const l = `${label ?? ""} ${paymentType ?? ""}`.toLowerCase();
  if (/annual|yearly/.test(l)) return "annual";
  if (/month/.test(l)) return "monthly";
  return null;
}

/** What we know about a legacy member's plan, from the two places it could be written down. */
export interface LegacyPlanSource {
  /** `crm_profiles.legacy_membership_type` — the verbatim Karma "Membership Type". */
  label: string | null;
  /** `crm_profiles.legacy_payment_type` — Karma's "Payment Type" / "DD or TVP". */
  paymentType: string | null;
  /** `subscriptions.plan_type`, which MAY be the import's `single` default. */
  storedPlanType: string | null;
  /** `subscriptions.billing_frequency`, which MAY be the import's `annual` default. */
  storedBillingFrequency: string | null;
}

export type LegacyPlanResolution =
  | {
      confirmed: true;
      membershipType: LegacyPlanType;
      billingFrequency: LegacyBillingFrequency;
    }
  | {
      confirmed: false;
      /** Which half could not be established — what staff have to answer. */
      missing: Array<"plan" | "frequency">;
      /** Karma's own words, so the person confirming has something to read. */
      label: string | null;
    };

/**
 * The plan a switch link may charge, or the reason there isn't one.
 *
 * Note what is NOT here: any fallback to `single` or `annual`. That fallback is precisely the
 * defect — it is indistinguishable from a real answer, and it is the cheaper plan in one
 * direction and twelve times the money in the other.
 */
export function resolveLegacyPlan(source: LegacyPlanSource): LegacyPlanResolution {
  const membershipType =
    planTypeFromLabel(source.label) ??
    // A stored `couple` is never a default, so it can only have come off Karma.
    (source.storedPlanType === "couple" ? "couple" : null);

  const billingFrequency =
    billingFrequencyFromLabel(source.label, source.paymentType) ??
    // Likewise `monthly`: the import defaults to `annual`, never to this.
    (source.storedBillingFrequency === "monthly" ? "monthly" : null);

  if (membershipType && billingFrequency) {
    return { confirmed: true, membershipType, billingFrequency };
  }

  const missing: Array<"plan" | "frequency"> = [];
  if (!membershipType) missing.push("plan");
  if (!billingFrequency) missing.push("frequency");
  return { confirmed: false, missing, label: source.label ?? null };
}

/**
 * What staff are told when the plan cannot be established, naming the member and Karma's label.
 *
 * Deliberately does NOT tell them to send an ordinary payment link instead. An ordinary link
 * leaves `billing_source` on `legacy`, so the member stays in the Santander export and gets
 * collected from twice in the month they pay Stripe — the one outcome this whole item exists to
 * prevent. The fix is to confirm the plan here, on the switch.
 */
export function planNotConfirmedMessage(memberName: string, resolution: LegacyPlanResolution): string {
  if (resolution.confirmed) return "";
  const what =
    resolution.missing.length === 2
      ? "which plan they are on or how often they pay"
      : resolution.missing[0] === "plan"
        ? "whether they are single or a couple"
        : "whether they pay monthly or yearly";
  const quoted = resolution.label ? `Karma's record says "${resolution.label}".` : "Karma recorded no membership type for them.";
  return (
    `${memberName}: the import could not tell ${what}, so there is no price to charge. ` +
    `${quoted} Confirm the plan here and the link will be built from it — do not send an ` +
    "ordinary payment link, which would leave them in the Santander export as well."
  );
}
