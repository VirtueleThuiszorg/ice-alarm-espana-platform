/**
 * MATCHING A COMPLETED REGISTRATION BACK TO THE LEAD THAT STARTED IT.
 *
 * A staff member spoke to somebody, sent them a personal link, and that person filled in the
 * join wizard. The lead and the member are now two records describing one human being, and
 * nothing joins them — so the lead sits on `join_link_sent` for ever, the operator who found
 * them gets no credit, and a follow-up filter chases a person who has already signed up.
 *
 * ── WHY THIS IS NOT INSIDE `submit_registration_atomic` ─────────────────────
 *
 * That function is one transaction, and it is the transaction a member's entire registration
 * lives in. If marking a lead failed inside it — a constraint, a lock, anything — the
 * REGISTRATION would roll back. Losing a paying member because a lead row could not be updated
 * is a trade nobody would make on purpose, and the same reasoning already keeps the confirmation
 * email outside it ("a failed email should not roll back a successful registration").
 *
 * So the conversion runs after, non-transactionally, and a failure is logged rather than raised.
 * The cost of that choice is honest and small: a lead that stays on `join_link_sent` for a day
 * until somebody notices, against a registration that never happened.
 */

/** What a lead must look like to be matched. Only the fields the decision reads. */
export interface MatchableLead {
  id: string;
  status: string;
  join_token: string | null;
  join_token_expires_at: string | null;
  phone: string | null;
  email: string | null;
}

export interface RegistrantIdentity {
  /** `?lead=` as it arrived, if it did. */
  token: string | null;
  /** E.164, already normalised by the caller. */
  phone: string | null;
  email: string | null;
}

export type LeadMatch =
  | { matched: true; leadId: string; by: "token" | "phone" | "email" }
  | { matched: false; reason: "no_candidate" | "token_expired" | "already_joined" };

/**
 * Which lead this registration belongs to.
 *
 * ── THE ORDER IS THE WHOLE DECISION ─────────────────────────────────────────
 *
 * TOKEN FIRST, and it is the only one that is evidence. The person clicked a link that exists
 * on exactly one lead; nothing else in the world produces that string.
 *
 * PHONE SECOND, and only as a fallback, because a token is lost every time somebody reads the
 * link out over the telephone and the other person types it into their own browser — which is
 * how a large share of these will actually happen, on a product whose customers are in their
 * seventies and eighties.
 *
 * EMAIL LAST, and it is the weakest: a couple who share an address are two members and one
 * email, so matching on it can attribute the second person's registration to the first one's
 * lead. It is still better than nothing, and being wrong here costs an operator's name on a
 * record rather than anything a customer sees.
 *
 * AN EXPIRED TOKEN IS REFUSED RATHER THAN FALLEN THROUGH. Thirty days is the promise the link
 * makes; honouring a token past it would make the expiry decorative, and the phone fallback
 * below will find the same lead anyway if it is genuinely the same person.
 *
 * A LEAD ALREADY MARKED `joined` IS NOT RE-MATCHED. Registrations get retried — a failed card,
 * a member who starts again — and a second match would overwrite the first conversion's
 * timestamp and, worse, bell the operator twice for one sale.
 */
export function matchLeadToRegistration(
  candidates: MatchableLead[],
  identity: RegistrantIdentity,
  now: Date,
): LeadMatch {
  const token = (identity.token ?? "").trim();
  if (token) {
    const byToken = candidates.find((l) => l.join_token === token);
    if (byToken) {
      if (byToken.status === "joined") return { matched: false, reason: "already_joined" };
      const expires = byToken.join_token_expires_at
        ? new Date(byToken.join_token_expires_at).getTime()
        : 0;
      if (!expires || expires < now.getTime()) {
        return { matched: false, reason: "token_expired" };
      }
      return { matched: true, leadId: byToken.id, by: "token" };
    }
  }

  const phone = (identity.phone ?? "").trim();
  if (phone) {
    const byPhone = candidates.find((l) => l.phone === phone && l.status !== "joined");
    if (byPhone) return { matched: true, leadId: byPhone.id, by: "phone" };
  }

  const email = (identity.email ?? "").trim().toLowerCase();
  if (email) {
    const byEmail = candidates.find(
      (l) => (l.email ?? "").toLowerCase() === email && l.status !== "joined",
    );
    if (byEmail) return { matched: true, leadId: byEmail.id, by: "email" };
  }

  // A lead that exists but is already joined is a different fact from no lead at all, and the
  // caller logs them differently — one is a retry, the other is somebody who found us alone.
  const anyJoined = candidates.some(
    (l) =>
      l.status === "joined" &&
      ((token && l.join_token === token) ||
        (phone && l.phone === phone) ||
        (email && (l.email ?? "").toLowerCase() === email)),
  );
  return { matched: false, reason: anyJoined ? "already_joined" : "no_candidate" };
}

/**
 * The sentence the staff member reads on their bell.
 *
 * FIRST NAME ONLY, and the lead's rather than the member's. The operator knows this person as
 * "Rosa from the Mojácar stall"; the member record may carry a formal surname they have never
 * used out loud, and "Your lead R. M. Delgado joined" is a different person as far as anybody
 * scanning a bell list is concerned.
 */
export function leadJoinedMessage(firstName: string): string {
  const name = firstName.trim();
  return name ? `Your lead ${name} joined` : "A lead you were working joined";
}
