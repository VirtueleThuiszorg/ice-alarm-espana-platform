import type { Tables } from "@/integrations/supabase/types";
import {
  MEMBER_LANGUAGES,
  memberLanguage,
  memberLanguageSpec,
  type MemberLanguage,
  type MemberLanguageSpec,
} from "./memberLanguages";

/**
 * OPERATOR QUICK REPLIES — and the one decision the table was created to force.
 *
 * `20260907100400_messaging_schema.sql` created `canned_replies` with `UNIQUE (shortcut, locale)`
 * and wrote the rule in the constraint's own comment:
 *
 *   > "One shortcut per language: an operator typing /wait must get exactly one answer, and the
 *   > language is chosen from the member's preference rather than from the operator's."
 *
 * That second half is the whole point and it is easy to get backwards. The natural implementation
 * — filter by `i18n.language` — reads the *operator's* interface language, which in a call centre
 * in Almería is whatever the last person left the browser on. A Dutch member would then be sent a
 * Spanish script because the operator's UI is in Spanish. So the locale here comes from
 * `members.preferred_language` and from nothing else.
 *
 * ── WHY NOT A SECOND LANGUAGE RESOLVER ──────────────────────────────────────────────────────
 *
 * `memberLanguage()` already reduces a stored value (nullable, and `en | es | nl`) to a code, and
 * already decides that an unrecorded language means English. Re-deciding that here would be a
 * second opinion about the same column — the defect shape this codebase keeps producing. What is
 * added instead is `languageIsRecorded()`, so the picker can SAY "no language recorded — showing
 * English" rather than presenting a guess as a fact. An operator who can see which language the
 * script is in will not paste the wrong one; one who cannot, will.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────
 *
 * No fallback to another language when the member's has no rows. A fallback is invisible at the
 * moment it matters: the operator presses a Dutch member's picker, gets English text that looks
 * like a normal script, and sends it. An empty list that names the gap is the honest failure, and
 * it is the one that gets the rows written.
 */

export type CannedReply = Tables<"canned_replies">;

/** Was this member's language actually recorded, or is the code below a default? */
export function languageIsRecorded(raw: string | null | undefined): boolean {
  const base = raw?.split("-")[0];
  return !!base && MEMBER_LANGUAGES.some((l) => l.code === base);
}

/** The language a canned reply must be in for THIS member. Never the operator's. */
export function cannedReplyLanguage(raw: string | null | undefined): MemberLanguage {
  return memberLanguage(raw);
}

/** The endonym and flag to label the picker with, so the operator sees what they are sending. */
export function cannedReplyLanguageSpec(raw: string | null | undefined): MemberLanguageSpec {
  return memberLanguageSpec(cannedReplyLanguage(raw));
}

/**
 * Insert a reply's body into whatever the operator has already typed.
 *
 * APPENDS, never replaces: an operator who has typed two sentences and then reaches for a script
 * has not asked for their sentences to be deleted, and an undo in a textarea after a React state
 * change is not something to rely on. A blank composer gets the body alone rather than a leading
 * blank line.
 */
export function withCannedReply(current: string, body: string): string {
  const existing = current.trimEnd();
  return existing ? `${existing}\n\n${body}` : body;
}

/** Filter for the picker's search box: shortcut, title, category and body, case-insensitively. */
export function matchesCannedReply(reply: CannedReply, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [reply.shortcut, reply.title, reply.category, reply.body].some(
    (field) => !!field && field.toLowerCase().includes(q),
  );
}
