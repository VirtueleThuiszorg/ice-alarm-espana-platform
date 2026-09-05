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

/** Digits only, for a wa.me link. Null when there is no number. */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s+]/g, "");
  return cleaned || null;
}
