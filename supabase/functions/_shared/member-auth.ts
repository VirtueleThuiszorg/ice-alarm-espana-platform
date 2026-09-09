/**
 * Giving a paid member an account they can actually sign into.
 *
 * THE DEFECT. `submit_registration_atomic` creates a `members` row and leaves `user_id` NULL.
 * Nothing on the payment path ever created an auth user, so every member who paid was told
 * "sign in to your dashboard" for an account that did not exist — and the confirmation screen's
 * fallback advice, "add your contacts yourself once you sign in", was advice nobody could
 * follow. `members.user_id` NULL also means every RLS policy keyed on it matches nothing, so
 * the member could not have read their own record even if they had got in.
 *
 * NO EMAIL IS SENT FROM HERE. `generateLink` is the admin API that CREATES the user and RETURNS
 * the link without mailing it; `inviteUserByEmail` would send Supabase's own template. The link
 * comes back so it can be the CTA of OUR welcome email — one message in our wording and our
 * three locales, not two messages from two senders about the same event.
 *
 * IDEMPOTENT, because the webhook is retried and because a member may already have an account:
 * a partner in a couple can be an existing member's emergency contact who signed up earlier,
 * and members share a household email often enough that `iceCrmImport` has a whole strategy
 * for it. `members.user_id` already set short-circuits; an email Supabase already knows falls
 * back to a magic link for the existing user.
 *
 * IT NEVER THROWS. The caller is the payment path. A member who has paid must be activated
 * whether or not their login could be created, so failure is reported and logged, never raised.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface MemberAuthResult {
  /** The auth user id, or null if one could not be established. */
  userId: string | null;
  /** A one-click sign-in link for the welcome email's CTA, or null. */
  actionLink: string | null;
  /** True when the auth user already existed (a retry, or a returning household). */
  existed: boolean;
  error: string | null;
}

interface EnsureParams {
  memberId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  language?: string | null;
  /** Where the link should land them. */
  redirectTo: string;
}

/** Supabase's wording for "this email already has an account", across versions. */
function isAlreadyRegistered(message: string | undefined): boolean {
  return /already (been )?registered|already exists|email_exists/i.test(message ?? "");
}

export async function ensureMemberAuthUser(
  db: SupabaseClient,
  params: EnsureParams,
): Promise<MemberAuthResult> {
  const { memberId, email, firstName, lastName, language, redirectTo } = params;

  try {
    // ── already linked? ──────────────────────────────────────────────────────
    const { data: member } = await db
      .from("members")
      .select("user_id")
      .eq("id", memberId)
      .maybeSingle();

    if (member?.user_id) {
      // Still mint a fresh link: the welcome email needs a working CTA, and the one from the
      // first delivery of this event has almost certainly expired.
      const link = await magicLink(db, email, redirectTo);
      return { userId: member.user_id, actionLink: link.actionLink, existed: true, error: link.error };
    }

    // ── create the user and take the link, without sending anything ──────────
    const invite = await db.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: {
          member_id: memberId,
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          preferred_language: language ?? "en",
        },
      },
    } as never);

    let userId = (invite as { data?: { user?: { id?: string } } }).data?.user?.id ?? null;
    let actionLink =
      (invite as { data?: { properties?: { action_link?: string } } }).data?.properties
        ?.action_link ?? null;
    const inviteError = (invite as { error?: { message?: string } }).error;

    if (!userId && inviteError) {
      if (!isAlreadyRegistered(inviteError.message)) {
        console.error(`Could not create an auth user for member ${memberId}:`, inviteError.message);
        return { userId: null, actionLink: null, existed: false, error: inviteError.message ?? "invite failed" };
      }
      // The email is already an account — a returning household, or a partner who was somebody
      // else's contact. A magic link both identifies the user and gives us the CTA.
      const link = await magicLink(db, email, redirectTo);
      userId = link.userId;
      actionLink = link.actionLink;
      if (!userId) {
        return { userId: null, actionLink, existed: true, error: link.error };
      }
      return { ...(await linkMember(db, memberId, userId)), actionLink, existed: true };
    }

    if (!userId) {
      return { userId: null, actionLink, existed: false, error: "no user returned" };
    }

    return { ...(await linkMember(db, memberId, userId)), actionLink, existed: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error(`ensureMemberAuthUser threw for member ${memberId}:`, message);
    return { userId: null, actionLink: null, existed: false, error: message };
  }
}

/**
 * Point `members.user_id` at the auth user.
 *
 * This is the write that turns every member-facing RLS policy on for this person, so its error
 * is reported rather than logged and forgotten: an auth user that exists but is not linked is
 * a member who can sign in and then see nothing, which reads like a broken dashboard.
 */
async function linkMember(
  db: SupabaseClient,
  memberId: string,
  userId: string,
): Promise<{ userId: string | null; error: string | null }> {
  const { error } = await db.from("members").update({ user_id: userId }).eq("id", memberId);
  if (error) {
    console.error(`Created auth user ${userId} but could not link member ${memberId}:`, error.message);
    return { userId, error: `link failed: ${error.message}` };
  }
  return { userId, error: null };
}

async function magicLink(
  db: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<{ userId: string | null; actionLink: string | null; error: string | null }> {
  const result = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  } as never);

  const error = (result as { error?: { message?: string } }).error;
  if (error) {
    console.error(`Could not generate a sign-in link for ${redirectTo}:`, error.message);
    return { userId: null, actionLink: null, error: error.message ?? "magiclink failed" };
  }

  return {
    userId: (result as { data?: { user?: { id?: string } } }).data?.user?.id ?? null,
    actionLink:
      (result as { data?: { properties?: { action_link?: string } } }).data?.properties
        ?.action_link ?? null,
    error: null,
  };
}
