/**
 * The second-stage onboarding token — the thing that makes a paid member reachable.
 *
 * THE DEFECT (REVIEW_JOIN_PATH.md F6, the safety-relevant one). The wizard stopped collecting
 * emergency contacts and medical data; they moved to a post-payment second stage
 * (ONBOARDING_SPLIT.md option B). But NOTHING on the payment path ever minted the token that
 * second stage needs. The only code that creates one is `send-member-update-request`, which is
 * staff-only and fires from a button somebody has to remember to press. So a member who paid
 * was left with no contacts at all, `member_monitoring_readiness` could never be true for them,
 * and an operator answering their SOS had nobody to ring.
 *
 * ONE TOKEN PER MEMBER (option B, and the reason is provenance not convenience). A couple is
 * two data subjects. The moment one token can write two people's medical records, "who supplied
 * this" stops being answerable from the data — and CONSENT_MODEL.md treats each member as the
 * sole author of consent over their own health data. So the primary and the partner get a token
 * each, and a partner's answers land on the partner's `member_id`.
 *
 * IDEMPOTENT, because the webhook is retried. A second delivery of the same Stripe event must
 * not mint a second token: two live links for one member means the one the member kept may not
 * be the one the queue is watching, and "was a second-stage link ever issued" stops having a
 * single answer. An existing unused, unexpired `post_payment` token is reused.
 *
 * `issued_via: 'post_payment'` with `created_by: null` — the shape 20260908120200 added, and
 * the CHECK there enforces that pairing. NULL alone would be ambiguous between "issued
 * automatically at payment" and "issued by someone who has since left", because that FK is
 * ON DELETE SET NULL so a token outlives its issuer.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * What the second stage asks for: contacts and medical, and nothing else.
 *
 * These strings are the vocabulary `MemberUpdatePage` switches on, so a typo here renders a
 * form with a missing section rather than an error. `nie_dni` is deliberately absent — the
 * wizard already offers it — and so is anything the member has already given us.
 */
export const SECOND_STAGE_FIELDS = [
  // Emergency contacts: the reason this exists at all.
  "contacts_count",
  "contacts_email",
  // Medical.
  "blood_type",
  "allergies",
  "medications",
  "doctor_name",
  "doctor_phone",
  "hospital_preference",
] as const;

/**
 * 30 days, not the 7 the staff flow uses.
 *
 * A staff member sends their link and follows it up on a call the same week. This one is
 * handed to somebody at the end of a checkout, and the people this product is for do not
 * always deal with a form the same day. A link that has quietly expired is worse than a long
 * one: the member clicks it, is told it is invalid, and gives up — while the queue still says
 * a link was issued.
 */
export const SECOND_STAGE_TOKEN_DAYS = 30;

export interface SecondStageToken {
  token: string;
  expiresAt: string;
  /** True when an existing open token was reused rather than a new one minted. */
  reused: boolean;
}

/** 32 bytes of CSPRNG as hex — the same shape `send-member-update-request` issues. */
function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mint (or reuse) the second-stage token for one member.
 *
 * Returns null rather than throwing if the write fails: the caller is the payment path, and a
 * member who has paid must be activated whether or not this succeeded. The failure is logged
 * and the paid-but-not-ready queue is what catches the member — a token that failed to mint
 * looks exactly like one that was never asked for, which is the state that queue exists for.
 */
export async function ensureSecondStageToken(
  db: SupabaseClient,
  memberId: string,
): Promise<SecondStageToken | null> {
  const nowIso = new Date().toISOString();

  const { data: existing } = await db
    .from("member_update_tokens")
    .select("token, expires_at, used_at")
    .eq("member_id", memberId)
    .eq("issued_via", "post_payment")
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.token) {
    return { token: existing.token, expiresAt: existing.expires_at, reused: true };
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + SECOND_STAGE_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await db.from("member_update_tokens").insert({
    member_id: memberId,
    token,
    requested_fields: [...SECOND_STAGE_FIELDS],
    expires_at: expiresAt.toISOString(),
    // The pairing 20260908120200's CHECK enforces: an automated token names no operator.
    issued_via: "post_payment",
    created_by: null,
  });

  if (error) {
    console.error(`Failed to mint the second-stage token for member ${memberId}:`, error.message);
    return null;
  }

  return { token, expiresAt: expiresAt.toISOString(), reused: false };
}

/** Where the member goes to finish. `MemberUpdatePage` reads `?token=`. */
export function secondStageLink(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/member-update?token=${encodeURIComponent(token)}`;
}
