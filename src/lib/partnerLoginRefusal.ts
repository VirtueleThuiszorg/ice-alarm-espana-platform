/**
 * Why a non-active partner cannot log in, in words they can act on.
 *
 * The gate this serves is an ALLOWLIST on `active`, matching `get_user_role_info`,
 * which grants `is_partner` only for `active`. A denylist here is what let `invited`
 * sign in successfully and then land on /unauthorized: two different rules for the
 * same decision, so a status either side forgot about becomes an accidental grant.
 *
 * Exhaustive over `partner_status` with a safe default, so a fifth value added later
 * gets an honest refusal rather than silently passing. It lives in `src/lib` rather
 * than beside the component because a component module that also exports functions
 * breaks React Fast Refresh.
 */
export function partnerLoginRefusal(status: string): string {
  switch (status) {
    case "pending":
      return "Your account is pending verification. Please check your email for the verification link.";
    case "invited":
      return "You have a partner invitation waiting. Please open the invitation email to set your password and finish setting up your account.";
    case "suspended":
      return "Your partner account has been suspended. Please contact support.";
    default:
      // Never a bare fall-through: an unrecognised status means we do not know
      // whether this partner should have access, and the safe answer is no.
      return "Your partner account is not active yet. Please contact support.";
  }
}
