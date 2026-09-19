/**
 * `/join?lead=<token>` — the personal link a staff member sent.
 *
 * Two jobs, both small and both easy to get subtly wrong:
 *
 *   REMEMBER THE TOKEN ACROSS THE WIZARD. The join wizard sends the member to Stripe and back,
 *   and the return URL carries `?success=…` and nothing else — so a token held only in the URL
 *   is lost at exactly the moment it is needed. It goes in localStorage beside the referral
 *   code, which already solves the same problem for the same reason.
 *
 *   FIRST TOUCH WINS, like the referral code. Somebody who is sent two links — a first attempt
 *   and a follow-up from a different operator — belongs to whoever reached them first, which is
 *   also what `storeReferralData` decides for partners. Two mechanisms disagreeing about the
 *   same person is how a commission gets paid twice or not at all.
 */

/**
 * Named in full rather than `KEY`, and not only for readability: `settingsKeyParity.test.ts`
 * indexes every module-level string constant across the WHOLE tree BY NAME, so a second `KEY`
 * holding a snake_case string shadows `SettingsPage`'s and makes that guard report a settings
 * key nothing saves. A bare `KEY` in a shared `src/lib` file was always going to collide with
 * something.
 */
const LEAD_TOKEN_STORAGE_KEY = "ice_lead_token";

/** Read `?lead=` and keep it, if it is the first one we have seen. */
export function captureLeadToken(params: Pick<URLSearchParams, "get">): void {
  const token = params.get("lead");
  if (!token) return;
  try {
    if (!localStorage.getItem(LEAD_TOKEN_STORAGE_KEY)) localStorage.setItem(LEAD_TOKEN_STORAGE_KEY, token);
  } catch {
    // A browser with storage blocked still completes the registration; the conversion falls
    // back to matching on phone, which is what it is for.
  }
}

/** The token to send with the registration, or null. */
export function storedLeadToken(): string | null {
  try {
    return localStorage.getItem(LEAD_TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Cleared once a registration has been submitted, so the next person on a shared iPad is not
 *  attributed to this one. Shared tablets are real in this market: a son fills the form in for
 *  his mother, and then for his aunt. */
export function clearLeadToken(): void {
  try {
    localStorage.removeItem(LEAD_TOKEN_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
