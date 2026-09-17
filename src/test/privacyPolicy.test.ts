/**
 * PRIVACY POLICY — the text must describe what the code does (GOALS G5, LEGAL.md §2A/§5).
 *
 * Version 2.0 (17 Sep 2026) was rewritten from an inventory of the code. These pins stop the
 * specific untruths the old text carried from coming back, and keep the page and the locale
 * files in step. They do not make the policy "compliant" — it is a draft pending legal review,
 * and the version line has to keep saying so until counsel has signed it off.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const LOCALES = ["en", "es", "nl"] as const;
type Json = Record<string, unknown>;
const locale = (l: string) => JSON.parse(read(`src/i18n/locales/${l}.json`)) as Json;
const privacyOf = (l: string) => (locale(l).legal as Json).privacy as Json;
const summaryOf = (l: string) => ((locale(l).joinWizard as Json).summary as Json) as Record<string, string>;

const CONTENT = read("src/components/legal/PrivacyContent.tsx");
const en = privacyOf("en");
const allText = (obj: unknown): string => JSON.stringify(obj);

describe("Privacy Policy page ↔ locale keys", () => {
  /** Every key the component asks for: t("legal.privacy.x") and the helper calls h2("x"), p("x") … */
  const used = new Set<string>([
    ...[...CONTENT.matchAll(/legal\.privacy\.([A-Za-z0-9_]+)/g)].map((m) => m[1]),
    ...[...CONTENT.matchAll(/\b(?:h2|h3|p|renderList)\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
    ...[...CONTENT.matchAll(/renderTable\("([A-Za-z0-9_]+)", "([A-Za-z0-9_]+)"\)/g)].flatMap((m) => [m[1], m[2]]),
  ]);
  // Read by PrivacyPage.tsx, not the body component.
  const PAGE_KEYS = ["title", "company", "lastUpdated"];

  it("every key the page renders exists in en.json", () => {
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it("every legal.privacy key is rendered somewhere (no dead policy text)", () => {
    const page = read("src/pages/PrivacyPage.tsx");
    for (const k of PAGE_KEYS) expect(page).toContain(`legal.privacy.${k}`);
    const dead = Object.keys(en).filter((k) => !used.has(k) && !PAGE_KEYS.includes(k));
    expect(dead).toEqual([]);
  });

  it("table rows have as many cells as their header, in every locale", () => {
    for (const l of LOCALES) {
      const pr = privacyOf(l);
      for (const [h, r] of [
        ["s3TableHeaders", "s3TableRows"],
        ["s4TableHeaders", "s4TableRows"],
        ["s7_5TableHeaders", "s7_5TableRows"],
        ["s9TableHeaders", "s9TableRows"],
      ]) {
        const width = (pr[h] as string[]).length;
        for (const row of pr[r] as string[][]) expect(row, `${l}:${r}`).toHaveLength(width);
      }
    }
  });
});

describe("Privacy Policy says what the code does", () => {
  it("is visibly a draft pending legal review, in every locale", () => {
    expect(privacyOf("en").lastUpdated).toMatch(/Draft pending legal review/);
    expect(privacyOf("es").lastUpdated).toMatch(/pendiente de revisión jurídica/);
    expect(privacyOf("nl").lastUpdated).toMatch(/juridische toetsing/);
  });

  it("names the processors the code actually calls", () => {
    const table = allText(en.s7_5TableRows);
    const inCode: Array<[string, string]> = [
      ["supabase/functions/_shared/anthropic.ts", "Anthropic"],
      ["supabase/functions/twilio-sms/index.ts", "Twilio"],
      ["supabase/functions/stripe-webhook/index.ts", "Stripe"],
      ["supabase/functions/mollie-webhook/index.ts", "Mollie"],
      ["src/lib/sentry.ts", "Sentry"],
      ["supabase/functions/_shared/fcm.ts", "Firebase"],
      ["src/lib/geocode.ts", "Nominatim"],
      ["src/config/medconneqt.ts", "Medconneqt"],
    ];
    for (const [file, name] of inCode) {
      expect(() => read(file), `${file} moved — re-check the processor list`).not.toThrow();
      expect(table, `${name} is used in ${file} but missing from §7.5`).toContain(name);
    }
    // Both email transports in _shared/email.ts.
    expect(read("supabase/functions/_shared/email.ts")).toMatch(/api\.resend\.com/);
    expect(table).toContain("Resend");
    expect(table).toContain("Gmail");
  });

  it("puts the database where it is (eu-west-1, Ireland), not Stockholm", () => {
    for (const l of LOCALES) {
      expect(allText(privacyOf(l).s7_5TableRows)).not.toMatch(/Stockholm|Estocolmo|Zweden/);
    }
    expect(allText(en.s7_5TableRows)).toMatch(/Supabase[^\]]*Ireland/);
  });

  it("never says Isabella triages emergencies (CLAUDE.md red line 7)", () => {
    for (const l of LOCALES) {
      expect(allText(privacyOf(l))).not.toMatch(/triage|triaj|triage/i);
    }
    expect(allText(en.s6Items)).toMatch(/every SOS goes to a human operator/);
  });

  it("does not say location is only collected when an alert fires (ev07b-checkin stores it on every check-in)", () => {
    expect(read("supabase/functions/ev07b-checkin/index.ts")).toMatch(/last_location_lat/);
    expect(allText(en)).not.toMatch(/Location data when alerts are triggered/);
    expect(allText(en.s3TableRows)).toMatch(/last reported GPS position/);
  });

  it("does not claim calls are recorded only with consent (conferences record from the start)", () => {
    expect(read("supabase/functions/voice-handler/index.ts")).toMatch(/record="record-from-start"/);
    expect(allText(en)).not.toMatch(/recordings \(with your consent\)/i);
    expect(allText(en.s3TableRows)).toMatch(/emergency calls \(recorded from the start\)/);
  });

  it("does not threaten to end the membership when health-data consent is withdrawn", () => {
    for (const l of LOCALES) {
      expect(allText(privacyOf(l))).not.toMatch(/terminate your membership for your own safety/i);
    }
    expect(en.s5p3).toMatch(/Your alarm will keep working/);
  });

  it("describes the erasure steps gdpr-delete-member really performs", () => {
    const fn = read("supabase/functions/gdpr-delete-member/index.ts");
    for (const table of ["subscriptions", "medical_information", "emergency_contacts", "member_update_tokens", "alerts", "members"]) {
      expect(fn).toContain(`.from("${table}")`);
    }
    expect((en.s11DeletionItems as string[]).length).toBe(6);
  });

  it("the AEPD block stays byte-identical across locales (pinned in localeParse.test.ts)", () => {
    expect(privacyOf("es").s15Authority).toBe(en.s15Authority);
    expect(privacyOf("nl").s15Authority).toBe(en.s15Authority);
  });
});

describe("join wizard: health-data consent is explicit and separate from the Terms", () => {
  it("the second checkbox asks for EXPLICIT consent to health data, in every locale", () => {
    expect(summaryOf("en").acceptMedical).toMatch(/explicitly consent/i);
    expect(summaryOf("es").acceptMedical).toMatch(/consentimiento explícito/i);
    expect(summaryOf("nl").acceptMedical).toMatch(/uitdrukkelijk toestemming/i);
    for (const l of LOCALES) {
      // Withdrawal must be stated where the consent is given (art. 7(3) GDPR).
      expect(summaryOf(l).medicalNote).toMatch(/withdraw|retirar|intrekken/i);
    }
  });

  it("accepting the Terms is not presented as agreeing to the Privacy Policy", () => {
    // A privacy policy is information, not a contract term. Bundling "agree" to it with
    // the Terms blurred the two, and blurred the separate health consent next to it.
    expect(summaryOf("en").termsNote).not.toMatch(/agree/i);
    expect(summaryOf("es").termsNote).not.toMatch(/acepta/i);
    expect(summaryOf("nl").termsNote).not.toMatch(/akkoord/i);
  });

  it("the two checkboxes stay separate controls bound to separate state", () => {
    const step = read("src/components/join/steps/JoinSummaryStep.tsx");
    expect(step).toMatch(/id="terms" checked=\{data\.acceptTerms\}/);
    expect(step).toMatch(/id="privacy" checked=\{data\.acceptPrivacy\}/);
    expect(step).toMatch(/joinWizard\.summary\.acceptMedical/);
    const wizard = read("src/pages/join/JoinWizard.tsx");
    expect(wizard).toMatch(/joinWizard\.validation\.acceptPrivacy/);
  });
});
