import { format, parseISO } from "date-fns";
import { enGB, es, nl } from "date-fns/locale";
import type { Locale } from "date-fns";

/**
 * DATES A MEMBER READS — one language map, for every surface that prints one.
 *
 * WHY THIS EXISTS RATHER THAN A TERNARY AT EACH CALL SITE. The dashboard greeting had the map
 * inline, and it had already been wrong once: `nl` fell through to English, so a Dutch member
 * read "Thursday, 17 September 2026" under a Dutch greeting. That was fixed where it was found,
 * which leaves the next surface to print a date free to get it wrong in exactly the same way —
 * and the protection checklist is now such a surface.
 *
 * `enGB` and not `enUS`: this company is in Spain, its English-speaking members are overwhelmingly
 * British, and the difference shows up the moment a date is written as digits.
 *
 * ANYTHING UNKNOWN IS ENGLISH. i18next hands over whatever the browser or the stored preference
 * said — `en-GB`, `es-ES`, a stale value, or nothing at all — so this matches on the PREFIX and
 * falls back rather than throwing. A date in the wrong language is a small unkindness; a crash
 * on the dashboard is not.
 */
export function memberDateLocale(language: string | null | undefined): Locale {
  const tag = (language ?? "").toLowerCase();
  if (tag.startsWith("es")) return es;
  if (tag.startsWith("nl")) return nl;
  return enGB;
}

/**
 * A day and a month, in the reader's language — "3 March", "3 de marzo", "3 maart".
 *
 * NO YEAR, deliberately. It is used in sentences a member reads in passing ("Last tested 3
 * March"), and the checklist's own staleness prompt is what says when a date is long ago. A year
 * on every one of them is noise on the common case.
 *
 * Returns `null` for a missing or unparseable timestamp, so a caller renders the sentence without
 * a date rather than the words "Invalid Date" — which is what `format` does with a bad input, on
 * screen, in the member's own language.
 */
export function formatMemberDayMonth(
  iso: string | null | undefined,
  language: string | null | undefined,
): string | null {
  if (!iso) return null;
  const parsed = parseISO(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "d MMMM", { locale: memberDateLocale(language) });
}
