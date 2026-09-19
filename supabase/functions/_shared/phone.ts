/**
 * ONE PHONE NUMBER RULE, FOR THE WHOLE PLATFORM.
 *
 * It existed twice, identically, kept in step by a comment: `iceCrmImport.normalisePhone` (the
 * rule the imported 431 members' numbers went through) and `public-submit.normalisePublicPhone`
 * (the rule a contact enquiry goes through). The comment on the second one said "deliberately the
 * same rule as" the first, which is an accurate description of a duplicate parallel
 * implementation and not a defence of one.
 *
 * THE COST OF THEM DRIFTING IS NOT COSMETIC. Every match between a lead and a member is a string
 * comparison on this column. A form that stores `600111222` while the import stored
 * `+34600111222` makes the same person two people — so the duplicate check on a hand-added lead
 * says "no match" for somebody who is already a member, and a staff member rings an existing
 * customer to introduce them to a product they already pay for.
 *
 * WHY THIS FILE LIVES UNDER `supabase/functions/_shared/` and not in `src/lib/`. The edge
 * functions run in Deno and can only reach their own directory and `_shared`; `src/` is not on
 * that path. The app side reaches it the way this repo already reaches a dozen other shared
 * rules — `pricing-calc`, `holiday-policy`, `legacy-plan` — by importing it directly.
 * `src/lib/phone.ts` re-exports it, so every app file writes `@/lib/phone` and there is still
 * exactly one implementation.
 */

/**
 * E.164 where it can be determined; Spanish mobiles and landlines assumed `+34`.
 *
 * Returns "" when it cannot be determined, and every caller refuses rather than storing it. A
 * number we cannot dial is not better than no number — it is indistinguishable from one we can
 * until somebody tries it in front of a customer.
 *
 * `+34` is assumed ONLY for the shape that is unambiguously a Spanish national number: nine
 * digits beginning 6, 7, 8 or 9. Anything else long enough to be a phone number is taken as
 * already-international and given a `+`; anything shorter is refused rather than guessed at.
 */
export function toE164(raw: string): string {
  let v = (raw ?? "").replace(/[^\d+]/g, "");
  if (!v) return "";
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (!v.startsWith("+")) {
    // Nine digits beginning 6/7/8/9 is a Spanish national number.
    if (/^[6789]\d{8}$/.test(v)) v = `+34${v}`;
    else if (/^\d{6,}$/.test(v)) v = `+${v}`;
    else return "";
  }
  return /^\+\d{6,15}$/.test(v) ? v : "";
}
