/**
 * INTRODUCING ICE ALARM TO A LEAD — which message, over which channel, with which link.
 *
 * The staff member has already spoken to this person. What this builds is the thing they send
 * afterwards: a short message in the lead's own language, with the staff member's name on it and
 * a join link that belongs to this lead alone.
 *
 * Pure and dependency-free so it is unit-testable under vitest, like every other decision module
 * in `_shared`. The function around it does the I/O: read the lead, read the templates, hand the
 * text to a transport, write down what happened.
 */

import { planChannels, type ChannelInputs, type DeliveryDecision } from "./delivery.ts";

/** What we are writing to somebody about. */
export type LeadMessageKind = "intro" | "followup";

/** The three transports a lead message can take. `call` is not one — nothing is composed for it. */
export type LeadChannel = "sms" | "whatsapp" | "email";

/**
 * The `notification_templates.event_key` for a kind and a channel.
 *
 * DERIVED, NOT A LOOKUP TABLE. Six keys written out by hand is six chances for
 * `lead.followup_whatsap` to sit in the code matching nothing, and a template that matches
 * nothing is a send that silently has no text.
 */
export function leadEventKey(kind: LeadMessageKind, channel: LeadChannel): string {
  return `lead.${kind}_${channel}`;
}

/** Thirty days, per the brief. Named once so the function and its tests cannot disagree. */
export const JOIN_TOKEN_TTL_DAYS = 30;

export function joinTokenExpiry(now: Date): Date {
  const expires = new Date(now.getTime());
  expires.setDate(expires.getDate() + JOIN_TOKEN_TTL_DAYS);
  return expires;
}

/**
 * The personal join link.
 *
 * `?lead=` is what makes it personal: /join reads it, pre-fills what we already know, and the
 * registration that follows can be matched back to this lead and to the staff member who found
 * them.
 *
 * `&ref=` is added ONLY when this lead came in through a partner, and it carries the partner's
 * code exactly as the public `/r/<code>` links do — so the commission is decided by the same
 * path, with the same first-touch rule, rather than by a second mechanism that would eventually
 * disagree with it.
 *
 * The trailing-slash strip is not fussiness: `https://icealarm.es//join?lead=…` is served by most
 * hosts and REDIRECTED by some, and a redirect drops the query string on exactly the setups that
 * matter least often and hurt most. `member-update-request.ts` carries the same scar.
 */
export function buildJoinLink(
  baseUrl: string,
  token: string,
  partnerCode?: string | null,
): string {
  const base = `${baseUrl.replace(/\/+$/, "")}/join?lead=${encodeURIComponent(token)}`;
  const code = (partnerCode ?? "").trim();
  return code ? `${base}&ref=${encodeURIComponent(code)}` : base;
}

/**
 * A token nobody can guess and nobody has to read aloud.
 *
 * 32 bytes of `crypto.getRandomValues`, base64url. NOT a uuid: a uuid in a URL is recognisably a
 * uuid, and `leads.id` is one — somebody would eventually "simplify" this by using the id, at
 * which point the link to any lead is the link to every lead, because ids leak through every
 * report and export this platform has.
 */
export function mintJoinToken(random: (n: number) => Uint8Array): string {
  const bytes = random(32);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type LeadLanguage = "en" | "es" | "nl";

export function leadLanguage(value: string | null | undefined): LeadLanguage {
  return value === "es" || value === "nl" ? value : "en";
}

export interface LeadTemplateVars {
  /** The lead's first name. Never their surname — this is a message, not a letter. */
  firstName: string;
  /** The staff member, by the name they introduced themselves with. */
  staffName: string;
  joinLink: string;
  phone24h: string;
}

/**
 * The four placeholders, as `renderTemplate` wants them.
 *
 * A FIFTH WOULD BE INVISIBLE UNTIL SOMEBODY READ A MESSAGE. `renderTemplate` leaves an unknown
 * `{{x}}` in place rather than blanking it, which is the right behaviour — but only if the set
 * of known ones is in one place. This is that place, and the template editor lists it.
 */
export function leadTemplateVars(v: LeadTemplateVars): Record<string, string> {
  return {
    first_name: v.firstName.trim(),
    staff_name: v.staffName.trim(),
    join_link: v.joinLink,
    phone_24h: v.phone24h.trim(),
  };
}

/** The placeholder names, for the template editor and for the test that holds the two together. */
export const LEAD_TEMPLATE_PLACEHOLDERS = [
  "first_name",
  "staff_name",
  "join_link",
  "phone_24h",
] as const;

/**
 * `delivery.ts`'s outcomes, plus the one that belongs to a lead rather than to a transport.
 *
 * A lead who has said "do not write to me again" is not a channel problem, an address problem or
 * a configuration problem, and calling it any of those would file it under something somebody
 * might later "fix".
 */
export type LeadDeliveryOutcome =
  | "sent"
  | "failed"
  | "skipped_channel_off"
  | "skipped_not_configured"
  | "skipped_no_address"
  | "skipped_do_not_contact";

export interface LeadChannelInputs extends ChannelInputs {
  /** `leads.do_not_contact`. True refuses every channel, before anything else is considered. */
  doNotContact: boolean;
}

/**
 * WHICH CHANNELS TO EVEN ATTEMPT FOR A LEAD.
 *
 * `planChannels` already answers that for a member; this wraps it with the one question a lead
 * has and a member does not.
 *
 * THE GATE IS HERE, NOT IN THE FUNCTION, and that is the entire reason this wrapper exists. The
 * brief says do_not_contact must be "respected by every send path", and the way to make that
 * true of a path nobody has written yet is to make the only route to a channel decision pass
 * through it. A check in the edge function would be a check the follow-up runner has to
 * remember to repeat.
 *
 * IT REFUSES BY REPORTING, not by returning nothing. An empty list reads as "there was nothing
 * to try", which is what a missing phone number also looks like; a row per channel saying
 * `skipped_do_not_contact` is a record that somebody pressed send and we declined.
 */
export function planLeadChannels(input: LeadChannelInputs): DeliveryDecision[] {
  const decisions = planChannels(input);
  if (!input.doNotContact) return decisions;
  return decisions.map((d) => ({
    ...d,
    attempt: false,
    outcome: "skipped_do_not_contact" as never,
  }));
}
