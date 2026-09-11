// @vitest-environment node
//
// ITEM 5 — WHAT A FAILED DEBIT DOES, and an honest account of what could and could not be run.
//
// Lee's rule: "Failed debits: one Stripe smart retry, then staff bell + friendly SMS; monitoring
// continues."
//
// THE TIMING IS THE WHOLE DESIGN. `invoice.payment_failed` fires on EVERY attempt. Stripe's
// smart retries then try again over the following days, and most direct-debit failures clear on
// their own — a balance short on the 15th is not short on the 18th. Texting on the first failure
// means texting several hundred elderly people about a problem that fixes itself, in a message
// arriving from the company that holds their emergency button.
//
// AND MONITORING NEVER STOPS. The instinct on reading "payment failed" is to suspend the
// service. On this product that instinct kills somebody, so the staff message says otherwise in
// as many words, and nothing in the path writes a status that would stop an operator answering.
//
// WHAT THIS FILE CANNOT DO, stated rather than implied: there is no Stripe key in this
// environment, so no test clock was run and no session was created. Every assertion here is
// about the code's decisions and the shape of what it sends. The dashboard half is listed in the
// PR and in PENDING_FOR_LEE.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  failureStage,
  memberFailureSms,
  staffFailureMessage,
} from "../../supabase/functions/_shared/payment-retry";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const webhook = read("supabase/functions/stripe-webhook/index.ts");

describe("which failure this is", () => {
  it("is still retrying while Stripe has another attempt scheduled", () => {
    expect(failureStage({ next_payment_attempt: 1_800_000_000 })).toBe("retrying");
  });

  it("is exhausted once Stripe has given up", () => {
    expect(failureStage({ next_payment_attempt: null })).toBe("exhausted");
    expect(failureStage({ next_payment_attempt: undefined })).toBe("exhausted");
  });

  // Nothing here counts attempts to decide: Stripe's own schedule is the authority, and a
  // hard-coded "after two" would disagree with it the day the retry policy changes.
  it("reads Stripe's schedule rather than counting attempts itself", () => {
    expect(failureStage({ next_payment_attempt: 1, attempt_count: 9 })).toBe("retrying");
    expect(failureStage({ next_payment_attempt: null, attempt_count: 1 })).toBe("exhausted");
  });
});

describe("what staff are told", () => {
  it("says the bank will be tried again, while it will be", () => {
    const m = staffFailureMessage("Brenda Colefax", { next_payment_attempt: 1 }, "retrying");
    expect(m).toMatch(/tried again automatically/i);
    expect(m).toContain("Brenda Colefax");
  });

  it("says to ring them once it will not", () => {
    const m = staffFailureMessage("Brenda Colefax", { next_payment_attempt: null }, "exhausted");
    expect(m).toMatch(/will not be tried again/i);
    expect(m).toMatch(/Ring them/i);
  });

  /*
    THE SENTENCE THAT STOPS SOMEBODY SUSPENDING THE SERVICE. It is in both messages on purpose:
    whichever one an operator reads at three in the morning, the instruction is the same.
  */
  it("tells them NOT to suspend, in both", () => {
    for (const stage of ["retrying", "exhausted"] as const) {
      const m = staffFailureMessage("X Y", { next_payment_attempt: stage === "retrying" ? 1 : null }, stage);
      expect(m, stage).toMatch(/Monitoring continues; do not suspend the service/);
    }
  });

  it("names the invoice when there is one, and does not invent one when there is not", () => {
    expect(staffFailureMessage("X Y", { next_payment_attempt: null, number: "INV-1" }, "exhausted"))
      .toContain("INV-1");
    expect(staffFailureMessage("X Y", { next_payment_attempt: null }, "exhausted"))
      .not.toMatch(/invoice\s/);
  });
});

describe("the member's text", () => {
  const sms = (lang: "en" | "es" | "nl") => memberFailureSms("Brenda", lang, "950 473 199");

  it("leads with the alarm still working, in all three languages", () => {
    expect(sms("en")).toMatch(/alarm is working as normal/i);
    expect(sms("es")).toMatch(/alarma sigue funcionando/i);
    expect(sms("nl")).toMatch(/alarm werkt gewoon door/i);
  });

  /*
    AND IT DOES NOT THREATEN THE SERVICE. The service is not in question, and saying otherwise to
    somebody in their eighties about their emergency alarm is a cruelty for the sake of a
    collection rate.
  */
  it("never threatens to stop anything, and never shouts", () => {
    for (const lang of ["en", "es", "nl"] as const) {
      const text = sms(lang).toLowerCase();
      for (const word of ["urgent", "urgente", "dringend", "suspend", "cancel", "immediately"]) {
        expect(text, `${lang}: ${word}`).not.toContain(word);
      }
    }
  });

  // The commonest cause is a bank detail that changed, which is a phone call, not a form.
  it("gives them a person to ring, and the number is passed in rather than written here", () => {
    expect(sms("en")).toContain("950 473 199");
    const source = read("supabase/functions/_shared/payment-retry.ts");
    // A wrong number is worse than no number — the same rule as the emergency number.
    expect(source).not.toMatch(/\+?\d{3}[\s-]?\d{3}[\s-]?\d{3}/);
  });

  it("uses the member's own first name", () => {
    expect(sms("en")).toContain("Brenda");
  });

  it("stays inside two SMS segments", () => {
    for (const lang of ["en", "es", "nl"] as const) {
      expect(sms(lang).length, lang).toBeLessThanOrEqual(320);
    }
  });
});

describe("what the webhook actually does with it", () => {
  it("marks the subscription past_due and nothing worse", () => {
    const block = webhook.slice(webhook.indexOf("async function onInvoiceFailed("));
    expect(block).toMatch(/status: "past_due"/);
    // Not `cancelled`, not `paused`, and no write of members.status at all.
    expect(block).not.toMatch(/status: "cancelled"/);
    expect(block).not.toMatch(/from\("members"\)[\s\S]{0,120}\.update\(/);
  });

  it("texts the member ONLY once Stripe has given up", () => {
    const block = webhook.slice(webhook.indexOf("async function onInvoiceFailed("));
    expect(block).toMatch(/if \(stage === "exhausted" && member\?\.phone\)/);
  });

  // One bell per retry, over 431 members, is a bell nobody reads — and a staff surface nobody
  // reads is the failure this platform keeps finding.
  it("bells on the first failure and at exhaustion, and is quiet in between", () => {
    const block = webhook.slice(webhook.indexOf("async function onInvoiceFailed("));
    expect(block).toMatch(/if \(stage === "exhausted" \|\| firstAttempt\)/);
  });

  it("sends no text when we have no number to tell them to ring", () => {
    const block = webhook.slice(webhook.indexOf("async function onInvoiceFailed("));
    expect(block).toMatch(/if \(phoneRow\?\.value\)/);
  });

  it("reports whether the text actually went, rather than assuming it did", () => {
    const block = webhook.slice(webhook.indexOf("async function onInvoiceFailed("));
    expect(block).toMatch(/memberTexted: smsSent/);
  });
});

describe("the SEPA path, which is the one that pays days later", () => {
  /*
    A SEPA checkout completes with `payment_status: "unpaid"`: the mandate is signed and the
    money is days away. Activating on that would activate somebody who may never pay; refusing to
    handle `async_payment_succeeded` would mean they pay and are never activated. Both halves are
    needed and both are here.
  */
  it("does not activate on an unpaid session", () => {
    expect(webhook).toMatch(/isSessionPaid\(session\.payment_status\)/);
    expect(webhook).toMatch(/awaitingPayment: true/);
  });

  it("and handles the event that means the money arrived", () => {
    expect(webhook).toContain('case "checkout.session.async_payment_succeeded":');
  });

  it("the same handler runs for both, so a SEPA member activates identically", () => {
    const completed = webhook.indexOf('case "checkout.session.completed":');
    const asyncOk = webhook.indexOf('case "checkout.session.async_payment_succeeded":');
    // Adjacent cases falling through to one handler — not two code paths that can drift.
    expect(asyncOk - completed).toBeLessThan(80);
  });

  it("and a SEPA member's billing_source flips on that same path", () => {
    // post-payment is what both cases reach, and it is the only writer of billing_source.
    expect(read("supabase/functions/_shared/post-payment.ts")).toMatch(/billing_source:\s*"stripe"/);
  });
});
