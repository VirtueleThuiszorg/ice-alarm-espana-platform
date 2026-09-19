/**
 * Phone-number helpers that refuse to invent a number.
 *
 * `system_settings.settings_emergency_phone` may be unset, in which case `useCompanySettings`
 * returns `null` rather than a placeholder — see the comment on `CompanySettings.emergency_phone`.
 * These helpers propagate that null so a caller renders NOTHING instead of a dead `tel:` link or
 * a number the company does not own.
 *
 * A wrong emergency number is worse than no emergency number: no number sends you to look for
 * the right one; a wrong one sends you somewhere confidently.
 */

/** `tel:` href, or null when there is no number to dial. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\s/g, "");
  return cleaned ? `tel:${cleaned}` : null;
}

/**
 * Digits for a `wa.me` link — INTERNATIONAL ONLY, and null for anything else.
 *
 * `wa.me/<digits>` needs the country code. There is no default and no way for WhatsApp to guess:
 * it reads the digits as a full international number, so `wa.me/950473199` is not "the Spanish
 * number 950 473 199" — it is a number in some other country, or nothing at all.
 *
 * `settings_emergency_phone` currently holds `950 473 199`, a national format, and three
 * surfaces were building `wa.me` links out of it: the public How It Works page, partner support,
 * and (nearly) the member's WhatsApp opt-in. All of them went nowhere.
 *
 * So this requires a leading `+` rather than prepending `34`. Prepending a country code because
 * the company is Spanish is inventing part of a phone number, which is the one thing this module
 * exists not to do — and a member reaching the wrong WhatsApp account is worse than reaching
 * none, for the same reason a wrong emergency number is worse than no emergency number.
 *
 * `PENDING_FOR_LEE.md` S16: storing the number as `+34 950 473 199` turns every one of those
 * links back on, and nothing else needs to change. `telHref` is unaffected — a national number
 * dials perfectly well.
 */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed.startsWith("+")) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits || null;
}

/**
 * E.164, Spanish numbers assumed +34 — THE app-side door to the platform's one phone rule.
 *
 * It lives in `supabase/functions/_shared/phone.ts` because the edge functions run in Deno and
 * can only reach their own directory and `_shared`; `src/` is not on that path. Re-exported here
 * so every app file writes `@/lib/phone` and there is still exactly one implementation — the same
 * arrangement this repo already uses for `pricing-calc`, `holiday-policy` and `legacy-plan`.
 *
 * It used to exist twice, identically, kept in step by a comment. The cost of the two drifting
 * was never cosmetic: every match between a lead and a member is a string comparison on this
 * column, so a form storing `600111222` against an import storing `+34600111222` makes the same
 * person two people — and the duplicate check on a hand-added lead then says "no match" for
 * somebody who is already a customer.
 *
 * Unlike `telHref` and `waNumber` above, this one ACCEPTS a national number and returns an
 * international one. That is not a contradiction of "never invent part of a phone number": nine
 * digits beginning 6/7/8/9 is unambiguously Spanish, and a staff member typing a number off a
 * business card types it the way it is printed.
 */
export { toE164 } from "../../supabase/functions/_shared/phone";
