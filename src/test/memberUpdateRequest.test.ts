/**
 * THE UPDATE LINK IS THE RESULT — delivery is reported beside it, never instead of it.
 *
 * WHAT THIS SUITE EXISTS FOR. `send-member-update-request` minted a one-shot token, emailed it,
 * and threw if the email failed. The token was in the table and the link worked; the staff
 * member was told the request had failed and had no way to reach it. On success it never
 * returned the URL either, so there was nothing to read out over the phone to a member who
 * does not use email — a large share of the people this product is for.
 *
 * The messages and the link are pure and executed here. The handler cannot be imported under
 * vitest (Deno remote specifiers), so the properties that live in the handler — what it
 * returns, what it refuses to throw on, what it writes to the log — are asserted against its
 * source, each one anchored on the code rather than on a comment about the code.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UPDATE_TOKEN_TTL_DAYS,
  buildUpdateLink,
  memberUpdateEmail,
  memberUpdateSms,
  updateLanguage,
  updateTokenExpiry,
} from "../../supabase/functions/_shared/member-update-request.ts";
import { planChannels } from "../../supabase/functions/_shared/delivery.ts";
import { planDelivery } from "../../supabase/functions/_shared/payment-link.ts";

const ROOT = process.cwd();
const SRC = readFileSync(
  join(ROOT, "supabase/functions/send-member-update-request/index.ts"),
  "utf8",
);

/** Every console.log/error call's argument text, paren-matched so nested calls are not clipped. */
function consoleCalls(source: string): string[] {
  const out: string[] = [];
  const re = /console\.(log|error)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (depth > 0 && i < source.length) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
      i++;
    }
    out.push(source.slice(m.index + m[0].length, i - 1));
  }
  return out;
}

describe("the link", () => {
  it("survives a trailing slash on SITE_URL", () => {
    expect(buildUpdateLink("https://icealarm.es/", "abc")).toBe(
      "https://icealarm.es/member-update?token=abc",
    );
    expect(buildUpdateLink("https://icealarm.es///", "abc")).toBe(
      "https://icealarm.es/member-update?token=abc",
    );
    expect(buildUpdateLink("https://icealarm.es", "abc")).toBe(
      "https://icealarm.es/member-update?token=abc",
    );
  });

  it("encodes the token rather than pasting it into the query string", () => {
    expect(buildUpdateLink("https://x.es", "a b&c")).toBe(
      "https://x.es/member-update?token=a%20b%26c",
    );
  });

  it("expires seven days out, and says so in both messages", () => {
    const now = new Date("2026-09-10T09:00:00Z");
    const expiry = updateTokenExpiry(now);
    expect(UPDATE_TOKEN_TTL_DAYS).toBe(7);
    expect(Math.round((expiry.getTime() - now.getTime()) / 86_400_000)).toBe(7);
    // The input is not mutated — the caller still holds "now".
    expect(now.toISOString()).toBe("2026-09-10T09:00:00.000Z");
    expect(memberUpdateSms({ memberName: "Mary", url: "https://x.es/u", language: "en" })).toContain(
      "7 days",
    );
    expect(memberUpdateEmail({ memberName: "Mary", url: "https://x.es/u", language: "en" }).html)
      .toContain("7 days");
  });
});

describe("the SMS", () => {
  const url = "https://icealarm.es/member-update?token=" + "a".repeat(64);

  it("fits two GSM segments including the URL", () => {
    for (const language of ["en", "es", "nl"] as const) {
      const sms = memberUpdateSms({ memberName: "Maria Fernández", url, language });
      expect(sms).toContain(url);
      expect(sms.length).toBeLessThanOrEqual(320);
    }
  });

  it("is written in the member's language", () => {
    expect(memberUpdateSms({ memberName: "Mary", url, language: "es" })).toContain("hola");
    expect(memberUpdateSms({ memberName: "Mary", url, language: "nl" })).toContain("hallo");
    expect(memberUpdateSms({ memberName: "Mary", url, language: "en" })).toContain("hello");
  });

  it("an unknown language is English, not a crash and not a blank", () => {
    expect(updateLanguage("de")).toBe("en");
    expect(updateLanguage(null)).toBe("en");
    expect(updateLanguage("es")).toBe("es");
    expect(updateLanguage("nl")).toBe("nl");
  });
});

describe("the email", () => {
  const url = "https://icealarm.es/member-update?token=xyz";

  it("prints the URL as text as well as linking it", () => {
    const { html } = memberUpdateEmail({ memberName: "Mary", url, language: "en" });
    // The button, and the same URL readable on its own — mail clients on the phones this lands
    // on strip buttons, and "click the button" with no button is a dead end.
    expect(html).toContain(`href="${url}"`);
    expect(html.split(url).length - 1).toBeGreaterThanOrEqual(2);
  });

  it("is bilingual, member's language first", () => {
    const es = memberUpdateEmail({ memberName: "Mary", url, language: "es" });
    expect(es.subject).toContain("actualice");
    expect(es.html.indexOf("Hola Mary")).toBeLessThan(es.html.indexOf("Hello Mary"));
    const en = memberUpdateEmail({ memberName: "Mary", url, language: "en" });
    expect(en.subject).toContain("update your information");
    expect(en.html.indexOf("Hello Mary")).toBeLessThan(en.html.indexOf("Hola Mary"));
  });

  it("a name is text, not markup", () => {
    const { html } = memberUpdateEmail({
      memberName: '<img src=x onerror="alert(1)"> & Sons',
      url,
      language: "en",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&amp; Sons");
  });
});

describe("channel planning is the SAME implementation the payment link uses", () => {
  it("payment-link's planDelivery delegates rather than carrying a second copy", () => {
    const shared = planChannels({
      smsChannelOn: true,
      emailConfigured: false,
      phone: " 600111222 ",
      email: "a@b.es",
    });
    const viaPaymentLink = planDelivery({
      smsChannelOn: true,
      emailConfigured: false,
      payerPhone: " 600111222 ",
      payerEmail: "a@b.es",
    });
    expect(viaPaymentLink).toEqual(shared);
    expect(shared.find((d) => d.channel === "sms")).toMatchObject({
      attempt: true,
      to: "600111222",
    });
    expect(shared.find((d) => d.channel === "email")).toMatchObject({
      attempt: false,
      outcome: "skipped_not_configured",
    });
  });

  it("an off channel is reported as off even when there is also no number", () => {
    const [sms] = planChannels({
      smsChannelOn: false,
      emailConfigured: true,
      phone: null,
      email: "a@b.es",
    });
    expect(sms.outcome).toBe("skipped_channel_off");
  });
});

describe("what the handler returns", () => {
  it("returns the link and the per-channel outcomes on success", () => {
    const body = SRC.slice(SRC.indexOf("return json(200,"));
    expect(body).toContain("updateLink,");
    expect(body).toContain("expiresAt:");
    expect(body).toContain("delivery,");
  });

  it("no transport failure can throw — the link exists either way", () => {
    // The old line, gone: `throw new Error(\`Email sending failed: …\`)`.
    expect(SRC).not.toContain("Email sending failed");
    const afterSend = SRC.slice(SRC.indexOf("await sendEmail("));
    const untilPush = afterSend.slice(0, afterSend.indexOf("delivery.push"));
    expect(untilPush).not.toContain("throw");
    expect(afterSend).toContain('outcome: result.success ? "sent" : "failed"');
  });

  it("a token that cannot be created DOES fail — there is no link to hand back", () => {
    expect(SRC).toContain("token_insert_failed");
    const afterInsert = SRC.slice(SRC.indexOf("token_insert_failed"));
    expect(afterInsert.slice(0, 300)).toContain("return json(500,");
  });

  it("the SMS destination is the member's own number, never the caller's payload", () => {
    // `phone` reaches planChannels from the row this function read, not from the request body.
    expect(SRC).toContain("phone: member.phone");
    expect(SRC).not.toMatch(/phone:\s*payload\./);
    expect(SRC).toMatch(/\.from\("members"\)[\s\S]{0,120}preferred_language/);
  });

  it("refuses a request that asks for nothing", () => {
    expect(SRC).toContain("No fields requested");
    expect(SRC).toMatch(/requestedFields\.length === 0/);
  });

  it("logs outcomes, not people", () => {
    const logs = consoleCalls(SRC);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain("recipientEmail");
      expect(line).not.toContain("memberName");
      expect(line).not.toContain("member.phone");
      expect(line).not.toContain("updateLink");
      expect(line).not.toMatch(/\btoken\b(?!_)/);
    }
  });

  it("audits what was asked for and what left the building", () => {
    const audit = SRC.slice(SRC.indexOf('action: "member_update_request_sent"'));
    expect(audit.slice(0, 400)).toContain("requested_fields");
    expect(audit.slice(0, 400)).toContain("delivery");
  });
});
