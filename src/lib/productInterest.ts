/**
 * The "Notify Me" box's client-side email check.
 *
 * A CONVENIENCE, NOT THE RULE. It saves a round trip and shows the error the instant somebody
 * types a bad address; the rule is `isPublicEmail` in `supabase/functions/_shared/public-submit.ts`,
 * which is what actually decides whether a row is written and is the only one a script POSTing at
 * the endpoint ever meets.
 *
 * `buildProductInterestLead` used to live here and built the `leads` row in the browser. It is
 * gone with the browser's reason to build that row: the shape is now assembled by `public-submit`
 * with the service role, where a POST cannot choose its own `source` or `status`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
