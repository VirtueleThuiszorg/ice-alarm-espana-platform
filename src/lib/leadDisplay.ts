/**
 * HOW A LEAD READS WHEN A FIELD IS MISSING.
 *
 * A spam submission arrived with no name, no email and no phone. The staff list rendered it as an
 * envelope icon followed by nothing, a telephone icon followed by nothing, and a blank where the
 * name goes — and beside them a Call button and an email button that both looked exactly like the
 * ones on a real enquiry. Pressing either did nothing at all: `tel:` and `mailto:` with an empty
 * address are a no-op in every browser.
 *
 * That is worse than it sounds on a call-centre screen. An operator working a queue does not read
 * a row, they scan it; an icon means "there is a way to reach this person", and one with nothing
 * after it means the same thing three feet from the monitor. The honest rendering says which of
 * the two it is — we were not given this, or we hold nothing here — and takes the button away.
 *
 * `public-submit` now refuses an incomplete contact enquiry, so new ones cannot look like this.
 * These rules are for the rows already in the table, for the other sources that legitimately hold
 * less (a `product_interest` lead is an email and nothing else by design), and for the next import.
 */

/** What stands in for a value we do not hold. An em dash, the same one the member record uses. */
export const EMPTY_VALUE = "—";

/** True when a field holds something a person could act on. Whitespace is not something. */
export function hasValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** The value, or the em dash. Never an empty string, which renders as a gap. */
export function orEmpty(value: string | null | undefined): string {
  return hasValue(value) ? value.trim() : EMPTY_VALUE;
}

/**
 * The name to show for a lead, and whether it is a real one.
 *
 * `given: false` is what the caller uses to render it in muted type: an actual name and the words
 * standing in for one must not look alike, or the list quietly gains several people called
 * "Name not given".
 */
export function leadDisplayName(
  lead: { first_name?: string | null; last_name?: string | null },
  notGiven: string,
): { text: string; given: boolean } {
  const parts = [lead.first_name, lead.last_name].filter(hasValue).map((p) => p.trim());
  return parts.length > 0 ? { text: parts.join(" "), given: true } : { text: notGiven, given: false };
}

/** `tel:` for a number we hold, or null — and null is what removes the button. */
export function leadTelHref(phone: string | null | undefined): string | null {
  return hasValue(phone) ? `tel:${phone.replace(/\s+/g, "")}` : null;
}

/** `mailto:` for an address we hold, or null. */
export function leadMailHref(email: string | null | undefined): string | null {
  return hasValue(email) ? `mailto:${email.trim()}` : null;
}
