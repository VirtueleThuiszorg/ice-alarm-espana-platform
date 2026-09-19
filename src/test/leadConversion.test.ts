import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  leadJoinedMessage,
  matchLeadToRegistration,
  type MatchableLead,
} from "../../supabase/functions/_shared/lead-conversion";

/**
 * THE LINK CONVERTS — matching a completed registration back to the lead that started it.
 *
 * Without this the lead and the member are two records describing one human being, joined by
 * nothing: the lead sits on `join_link_sent` for ever, the operator who found them gets no
 * credit, and the follow-up filter chases somebody who has already signed up.
 */

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const NOW = new Date("2026-09-19T12:00:00Z");
const FUTURE = "2026-10-10T00:00:00Z";
const PAST = "2026-08-10T00:00:00Z";

const lead = (over: Partial<MatchableLead> = {}): MatchableLead => ({
  id: "lead-1",
  status: "join_link_sent",
  join_token: "tok-rosa",
  join_token_expires_at: FUTURE,
  phone: "+34600111222",
  email: "rosa@example.es",
  ...over,
});

describe("the order of evidence", () => {
  it("the token wins, because nothing else in the world produces that string", () => {
    const other = lead({ id: "lead-2", join_token: "tok-other", phone: "+34600111222" });
    const mine = lead({ id: "lead-1", join_token: "tok-rosa", phone: null, email: null });
    const m = matchLeadToRegistration([other, mine], {
      token: "tok-rosa", phone: "+34600111222", email: null,
    }, NOW);
    expect(m).toEqual({ matched: true, leadId: "lead-1", by: "token" });
  });

  it("the phone is the fallback, because a token is lost every time it is read aloud", () => {
    /*
      A large share of these links will be read out over the telephone and typed into the other
      person's own browser, on a product whose customers are in their seventies and eighties.
      Matching on phone alone is what catches those.
    */
    const m = matchLeadToRegistration([lead()], { token: null, phone: "+34600111222", email: null }, NOW);
    expect(m).toEqual({ matched: true, leadId: "lead-1", by: "phone" });
  });

  it("the email is last, and it is the weakest", () => {
    // A couple who share an address are two members and one email, so matching on it can
    // attribute the second person's registration to the first one's lead.
    const m = matchLeadToRegistration([lead({ phone: null })], {
      token: null, phone: "+34699999999", email: "ROSA@example.es",
    }, NOW);
    expect(m).toEqual({ matched: true, leadId: "lead-1", by: "email" });
  });

  it("no evidence at all is no match, not a guess", () => {
    const m = matchLeadToRegistration([lead()], { token: null, phone: "+34611111111", email: "x@y.es" }, NOW);
    expect(m).toEqual({ matched: false, reason: "no_candidate" });
  });

  it("and an empty identity matches nothing rather than the first row", () => {
    // `"" === null` is false but `candidates.find(l => l.phone === "")` is a real risk if the
    // empty string ever reaches the comparison.
    expect(matchLeadToRegistration([lead({ phone: "", email: "" })], {
      token: "", phone: "", email: "",
    }, NOW)).toEqual({ matched: false, reason: "no_candidate" });
  });
});

describe("the refusals", () => {
  it("an expired token is refused, not fallen through", () => {
    /*
      Thirty days is the promise the link makes; honouring a token past it would make the expiry
      decorative. The phone fallback finds the same lead anyway if it is genuinely the same
      person — which is the point: the expiry costs nothing real and means something.
    */
    const m = matchLeadToRegistration([lead({ join_token_expires_at: PAST, phone: null, email: null })],
      { token: "tok-rosa", phone: null, email: null }, NOW);
    expect(m).toEqual({ matched: false, reason: "token_expired" });
  });

  it("a token with no expiry at all is treated as expired", () => {
    // A null expiry is a row written before the column existed, or by hand. Neither is a
    // thirty-day promise anybody made.
    const m = matchLeadToRegistration([lead({ join_token_expires_at: null, phone: null, email: null })],
      { token: "tok-rosa", phone: null, email: null }, NOW);
    expect(m).toEqual({ matched: false, reason: "token_expired" });
  });

  it("a lead already marked joined is not matched again", () => {
    /*
      THE ONE THAT WOULD HAVE COST SOMETHING. Registrations get retried — a failed card, a
      member who starts again — and a second match would overwrite the first conversion's
      timestamp and bell the operator TWICE for one sale.
    */
    const m = matchLeadToRegistration([lead({ status: "joined" })],
      { token: "tok-rosa", phone: "+34600111222", email: "rosa@example.es" }, NOW);
    expect(m).toEqual({ matched: false, reason: "already_joined" });
  });

  it("and a retry is told apart from somebody who found us on their own", () => {
    // Different facts: one is a second attempt at a lead we worked, the other is an organic
    // registration. Reading them as the same number makes the conversion rate a lie.
    expect(matchLeadToRegistration([lead({ status: "joined" })],
      { token: null, phone: "+34600111222", email: null }, NOW).matched).toBe(false);
    expect(matchLeadToRegistration([], { token: null, phone: "+34600111222", email: null }, NOW))
      .toEqual({ matched: false, reason: "no_candidate" });
  });
});

describe("the bell", () => {
  it("names the lead by their first name", () => {
    /*
      The operator knows this person as "Rosa from the Mojácar stall". The member record may
      carry a formal surname they have never used out loud, and "Your lead R. M. Delgado joined"
      is a different person as far as anybody scanning a bell list is concerned.
    */
    expect(leadJoinedMessage("Rosa")).toBe("Your lead Rosa joined");
    expect(leadJoinedMessage("  Rosa  ")).toBe("Your lead Rosa joined");
  });

  it("says something usable even with no name", () => {
    expect(leadJoinedMessage("")).toBe("A lead you were working joined");
  });
});

describe("where the conversion runs", () => {
  const fn = read("supabase/functions/submit-registration/index.ts");

  it("OUTSIDE the atomic transaction, and a failure leaves the registration standing", () => {
    /*
      THE DECISION THIS WHOLE FEATURE TURNS ON. `submit_registration_atomic` is one transaction,
      and it is the transaction a member's registration lives in. A lead update that failed
      inside it would ROLL BACK THE REGISTRATION — losing a paying member because a lead row
      could not be updated. The confirmation email is outside for the same reason.
    */
    const rpcAt = fn.indexOf('"submit_registration_atomic"');
    // The CALL SITE, not the import at the top of the file — which is of course before the RPC.
    const convertAt = fn.indexOf("matchLeadToRegistration(candidates");
    expect(rpcAt).toBeGreaterThan(0);
    expect(convertAt).toBeGreaterThan(rpcAt);
    const block = fn.slice(convertAt - 2000, convertAt);
    expect(block).toContain("NON-TRANSACTIONAL");
    // It must not throw: the catch is what keeps the registration.
    expect(fn).toContain("Lead conversion threw (registration stands)");
    expect(fn).toContain("Lead conversion failed (registration stands)");
  });

  it("bells the assignee AND the admins, targeted rather than broadcast", () => {
    /*
      A broadcast row is SHARED — the first person to mark it read clears it for everyone,
      including the operator who had not seen it and is the one person it is actually for.
    */
    expect(fn).toContain("admin_user_id: userId");
    expect(fn).not.toMatch(/admin_user_id:\s*null/);
    expect(fn).toContain("lead.assigned_to");
  });

  it("never touches activation", () => {
    // Golden rule 4: a member is activated by the payment webhook. This marks a LEAD.
    const block = fn.slice(fn.indexOf("NON-TRANSACTIONAL: the lead"), fn.indexOf("// Return all IDs"));
    expect(block).not.toMatch(/subscriptions|\bstatus: "active"|activate/i);
  });
});

describe("the pre-fill", () => {
  const fn = read("supabase/functions/lead-prefill/index.ts");

  it("returns four fields and nothing else", () => {
    /*
      `leads` holds a non-customer's consent record, the staff notes about them, a spam verdict,
      and every other lead in the business. A caller holding the token must learn exactly what
      the person holding the link already knows about themselves.
    */
    const ret = fn.slice(fn.lastIndexOf("return json(200, {"));
    expect(ret).toContain("firstName");
    expect(ret).toContain("lastName");
    expect(ret).toContain("phone");
    expect(ret).toContain("email");
    expect(ret).toContain("language");
    for (const leak of ["id:", "status", "notes", "suspected_spam", "assigned_to", "join_token"]) {
      expect(ret, `${leak} must not be returned`).not.toContain(leak);
    }
  });

  it("answers an unknown token exactly as it answers a real one", () => {
    // A 404 for an unknown token and a 200 for a real one is an oracle that tells anybody
    // willing to guess which tokens exist.
    expect(fn).toContain("const EMPTY = {");
    expect(fn).not.toMatch(/return json\(404/);
    expect(fn).not.toMatch(/return json\(40[13]/);
  });

  it("refuses an expired token, silently", () => {
    expect(fn).toContain("expires < Date.now()");
  });

  it("is anonymous on purpose, with the reason beside it", () => {
    const toml = read("supabase/config.toml");
    const block = toml.slice(toml.indexOf("[functions.lead-prefill]"));
    expect(block.slice(0, 120)).toMatch(/verify_jwt = false/);
    const before = toml.slice(0, toml.indexOf("[functions.lead-prefill]"));
    expect(before.slice(-500)).toMatch(/token|credential/i);
  });
});

describe("the token survives the round trip to Stripe", () => {
  it("is kept out of the URL, beside the referral code", () => {
    /*
      The wizard sends the member to Stripe and comes back with `?success=…` and nothing else,
      so a token held only in the URL is lost at exactly the moment it is needed.
    */
    const lib = read("src/lib/leadJoinLink.ts");
    expect(lib).toContain("localStorage");
    expect(lib).toContain("ice_lead_token");
  });

  it("first touch wins, like the partner code", () => {
    // Somebody sent two links belongs to whoever reached them first, which is what
    // `storeReferralData` already decides for partners. Two mechanisms disagreeing about the
    // same person is how a commission gets paid twice or not at all.
    const lib = read("src/lib/leadJoinLink.ts");
    expect(lib).toContain("if (!localStorage.getItem(LEAD_TOKEN_STORAGE_KEY))");
  });

  it("and every storage call is wrapped, because a blocked browser must still register", () => {
    const lib = read("src/lib/leadJoinLink.ts");
    expect((lib.match(/try \{/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("reaches the server on both registration call sites, including test mode", () => {
    // One of the two was missed on the first pass; a token that works in production and not in
    // test mode is a feature nobody can demonstrate.
    const step = read("src/components/join/steps/JoinPaymentStep.tsx");
    expect((step.match(/leadToken/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("and the schema lets it through rather than stripping it", () => {
    // `registrationSchema` drops unknown keys, so an unlisted field arrives as undefined and the
    // match silently falls back to phone — working, and attributing nothing to the link.
    expect(read("supabase/functions/_shared/validation.ts")).toContain("leadToken:");
  });
});
