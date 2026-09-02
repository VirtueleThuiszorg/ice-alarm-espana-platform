/**
 * One Twilio number cannot do both jobs.
 *
 * ICE Alarm's published line, 950 473 199, is a geographic landline in Almería.
 * Spanish landlines cannot send SMS — Twilio rejects the request with error
 * 21614. The emergency-contact alert, the message that tells a family their
 * mother has fallen, is an SMS.
 *
 * So `settings_twilio_phone_number` serving as both the SMS `From` and the
 * voice `callerId` had only bad answers: the landline silently kills every
 * alert, and a mobile makes every 3am escalation call arrive from a number
 * nobody recognises. These tests pin the split so it cannot quietly collapse
 * back into one setting.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const shared = read("supabase/functions/_shared/twilio-numbers.ts");

/** Functions whose Twilio `From` is an SMS, and must use the SMS number. */
const SMS_SENDERS = [
  "supabase/functions/emergency-contact-notify/index.ts",
  "supabase/functions/twilio-sms/index.ts",
];

/** Functions placing a CALL, which must use the caller ID people recognise. */
const VOICE_CALLERS = [
  "supabase/functions/voice-handler/index.ts",
  "supabase/functions/twilio-call-me/index.ts",
  "supabase/functions/twilio-outbound/index.ts",
];

describe("the landline detector", () => {
  // Re-implemented from the shared module's regex: edge functions import from
  // npm: specifiers that vitest cannot resolve, so the contract is pinned on
  // the source instead of the runtime.
  const RE = /^(\+34|0034|34)?[89]\d{8}$/;
  const looksLikeLandline = (n: string) => RE.test(n.replace(/[^\d+]/g, ""));

  it("recognises the published ICE number as a landline", () => {
    for (const form of ["+34950473199", "0034950473199", "950473199", "950 473 199"]) {
      expect(looksLikeLandline(form), `${form} should read as a landline`).toBe(true);
    }
  });

  it("does not mistake a Spanish mobile for one", () => {
    for (const form of ["+34612345678", "+34712345678", "612 345 678"]) {
      expect(looksLikeLandline(form), `${form} should read as a mobile`).toBe(false);
    }
  });

  it("leaves foreign numbers alone rather than guessing", () => {
    for (const form of ["+447700900123", "+15551234567", "+31612345678"]) {
      expect(looksLikeLandline(form), `${form} is not ours to judge`).toBe(false);
    }
  });

  it("keeps the same regex in the shared module", () => {
    expect(shared).toContain("^(\\+34|0034|34)?[89]\\d{8}$");
  });
});

describe("the shared loader", () => {
  it("exposes both numbers and falls back to the legacy key", () => {
    for (const key of ["settings_twilio_sms_number", "settings_twilio_voice_caller_id", "settings_twilio_phone_number"]) {
      expect(shared, `loader must know about ${key}`).toContain(key);
    }
    expect(shared, "sms must fall back to the legacy setting").toMatch(
      /const sms = cfg\[SMS_NUMBER_KEY\] \|\| legacy/,
    );
    expect(shared, "voice must fall back to the legacy setting").toMatch(
      /const voice = cfg\[VOICE_CALLER_ID_KEY\] \|\| legacy/,
    );
  });

  it("warns rather than blocks — a smell test must never stop an SOS going out", () => {
    // If a misconfigured number could refuse to send, the guard would become
    // the outage. It logs; Twilio decides.
    expect(shared).toMatch(/console\.error/);
    expect(shared, "the guard must not throw").not.toMatch(/throw new Error/);
  });
});

describe("every sender uses the right number", () => {
  it.each(SMS_SENDERS)("%s sends SMS from the SMS number", (path) => {
    const src = read(path);
    expect(src, "must load the split numbers").toMatch(/loadTwilioNumbers/);
    expect(
      src,
      "the SMS From must not be the shared legacy setting",
    ).not.toMatch(/From:\s*[a-zA-Z]+\.settings_twilio_phone_number/);
    expect(src, "SMS senders must warn on a landline sender").toMatch(
      /warnIfSmsNumberCannotSendSms/,
    );
  });

  it.each(VOICE_CALLERS)("%s places calls from the voice caller ID", (path) => {
    const src = read(path);
    expect(src, "must load the split numbers").toMatch(/loadTwilioNumbers/);
    expect(
      src,
      "the voice caller ID must not be the shared legacy setting",
    ).not.toMatch(/(From:|callerId=")\s*\$?\{?[a-zA-Z]+\.settings_twilio_phone_number/);
  });

  it("no edge function still uses the legacy key as a From or callerId", () => {
    const offenders: string[] = [];
    for (const path of [...SMS_SENDERS, ...VOICE_CALLERS]) {
      const src = read(path);
      src.split("\n").forEach((line, i) => {
        if (/settings_twilio_phone_number/.test(line) && /(From:|callerId)/.test(line)) {
          offenders.push(`${path}:${i + 1}`);
        }
      });
    }
    expect(offenders, "these still send from the one shared number").toEqual([]);
  });
});

describe("the migration seeds both rows", () => {
  const sql = read("supabase/migrations/20260902150000_twilio_split_sms_and_voice_numbers.sql");

  it("creates both keys from the existing value without overwriting", () => {
    expect(sql).toContain("settings_twilio_sms_number");
    expect(sql).toContain("settings_twilio_voice_caller_id");
    expect(sql, "must not clobber a value someone already set").toMatch(/ON CONFLICT \(key\) DO NOTHING/);
  });

  it("warns loudly when the number it seeded from cannot send SMS", () => {
    expect(sql).toMatch(/RAISE WARNING/);
    expect(sql).toMatch(/\[89\]\[0-9\]\{8\}/);
  });
});
