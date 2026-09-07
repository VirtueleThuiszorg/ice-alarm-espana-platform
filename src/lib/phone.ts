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
