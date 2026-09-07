import type { Database } from "@/integrations/supabase/types";

/**
 * THE LANGUAGES A MEMBER MAY BE IN — one list, from the database enum.
 *
 * `members.preferred_language` is `en | es | nl`. Two places offered a choice and **both offered
 * two of the three**: the header `LanguageSelector` and the profile form, each with its own
 * hard-coded array. So Dutch was unreachable from the running application — while `nl.json` is a
 * complete translation that `localeParse.test.ts` enforces key-for-key and forbids leaving in
 * English. A maintained translation nobody can select is effort spent to no effect.
 *
 * IT WAS ALSO A LIVE DEFECT, not just a missing option. `MemberProfile` declared
 * `preferred_language: "en" | "es"` for a nullable three-value column, and the profile form's
 * zod schema was `z.enum(["en", "es"])`. A member whose row says `nl` — set by staff, or by the
 * CRM import — could not be loaded into that form, and the compiler said so the moment the type
 * was corrected to the generated row.
 *
 * WHAT I HAVE ASSUMED, and it is one line to reverse. MEMBER_UX_RULES R3 says the header carries
 * "EN/ES". I have read that as shorthand for "the language selector" rather than an instruction
 * to hide a language the product already ships, translates, tests and stores — the operating
 * company is Dutch. `PENDING_FOR_LEE.md` D-15 puts it to Lee: if EN/ES is meant literally, delete
 * `nl` from this array and the header, the profile and the seed follow automatically, and the
 * question of what to do with a 6,000-line translation is a separate one worth answering
 * deliberately.
 */
export type MemberLanguage = Database["public"]["Enums"]["preferred_language"];

export interface MemberLanguageSpec {
  code: MemberLanguage;
  /** Endonym — a language list is one of the few places not to translate the labels. */
  label: string;
  flag: string;
}

export const MEMBER_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
] as const satisfies readonly MemberLanguageSpec[];

/**
 * The codes, as a tuple zod can take.
 *
 * Derived from the array rather than written out again: a fourth language added above must not
 * need a second edit here to become storable, which is exactly how the two lists drifted apart.
 */
export const MEMBER_LANGUAGE_CODES = MEMBER_LANGUAGES.map((l) => l.code) as unknown as [
  MemberLanguage,
  ...MemberLanguage[],
];

/** The one used when a row says nothing. Spain is the market; English is the lingua franca. */
export const DEFAULT_MEMBER_LANGUAGE: MemberLanguage = "en";

/**
 * A stored value, or an i18n language tag, reduced to a code we can act on.
 *
 * `null` is a real state (the column is nullable) and so is `en-GB`, which is what
 * `i18n.language` reports. Both resolve to a code rather than to `undefined`, because every
 * caller here has to render *something*.
 */
export function memberLanguage(raw: string | null | undefined): MemberLanguage {
  const base = raw?.split("-")[0];
  const known = MEMBER_LANGUAGES.map((l) => l.code as string);
  return base && known.includes(base) ? (base as MemberLanguage) : DEFAULT_MEMBER_LANGUAGE;
}

export function memberLanguageSpec(code: MemberLanguage): MemberLanguageSpec {
  const spec = MEMBER_LANGUAGES.find((l) => l.code === code);
  // Unreachable while the type is derived from the array.
  if (!spec) throw new Error(`unknown member language: ${code}`);
  return spec;
}
