/**
 * PUBLIC CLAIMS HONESTY (GOALS G5 — "no claim we can't back").
 *
 * The 2026-07-25 sweep found three public claims that contradicted our own
 * repo, not merely LAUNCH_SCOPE:
 *  - "30-day money-back guarantee" vs Terms §8.4/§9.2 (14-day EU cooling-off,
 *    registration fees non-refundable, no refund after 14 days);
 *  - "Free next-day delivery to Spain" vs a €14.99 shipping fee
 *    (src/config/pricing.ts) and the checkout's own "2-3 business days";
 *  - a "24/7 nurse-led care centre" in the seeded product catalog, while
 *    app_role has no nurse and Terms §3.2 disclaims medical care.
 *
 * These pins stop each from coming back, in any locale.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOCALES = ["en", "es", "nl"] as const;

/** Namespaces rendered on public / customer-facing surfaces. */
const PUBLIC_NAMESPACES = [
  "landing",
  "pendant",
  "howItWorksPage",
  "products",
  "pricing",
  "joinWizard",
  "registration",
  "contact",
  "blog",
  "legal",
  "gdpr",
  "support",
  "help",
  "faq",
  "membership",
  "subscription",
  "navigation",
  "common",
  "auth",
  "partner",
  "partnerLogin",
  "partnerOnboarding",
  "partnerAgreement",
  "partnerSupport",
  "partnerTypes",
];

type Flat = Record<string, string>;

function flattenPublic(locale: string): Flat {
  const raw = JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${locale}.json`), "utf8"));
  const out: Flat = {};
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    } else if (typeof node === "string") out[path] = node;
  };
  for (const ns of PUBLIC_NAMESPACES) {
    if (raw[ns] !== undefined) walk(raw[ns], ns);
  }
  return out;
}

const flat = Object.fromEntries(LOCALES.map((l) => [l, flattenPublic(l)])) as Record<string, Flat>;

function offenders(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(flat[locale])) {
      if (pattern.test(value)) hits.push(`${locale}:${key} → ${value.slice(0, 120)}`);
    }
  }
  return hits;
}

describe("public copy makes no claim our own repo contradicts", () => {
  it("no money-back guarantee (Terms give a 14-day cooling-off, not a refund promise)", () => {
    expect(
      offenders(/money.?back|geld.terug|garantía de devolución|niet-goed-geld/i),
    ).toEqual([]);
  });

  it("no next-day or free delivery (shipping is a charged fee — pricing_settings.shipping_amount)", () => {
    expect(
      offenders(
        /next.?day deliver|free\s+(next.?day\s+)?deliver|entrega gratuita|envío gratis|gratis (levering|verzending)/i,
      ),
    ).toEqual([]);
  });

  it("the superseded 2-3 day dispatch quote is gone everywhere", () => {
    expect(offenders(/2[-–]3\s*(business|working)\s*days|2[-–]3\s*días\s*(h|l)|2[-–]3\s*werkdagen/i)).toEqual([]);
    const email = readFileSync(join(ROOT, "supabase/functions/_shared/welcome-email.ts"), "utf8");
    expect(email).not.toMatch(/2-3\s*(business|working)\s*days|2-3\s*días|2-3\s*werkdagen/i);
  });

  it("no nurse-led or clinician-led staffing claim (app_role has no nurse; Terms §3.2 disclaims medical care)", () => {
    expect(
      offenders(/nurse.?led|led by nurses|dirigido por enfermer|verpleegkundig geleid/i),
    ).toEqual([]);
  });

  it("the delivery claim is the same on the badge, in checkout and in the email", () => {
    // One stated service: 5-7 working days by recorded delivery.
    expect(flat.en["howItWorksPage.cta.trust3"]).toMatch(/5–7 working days.*recorded delivery/i);
    expect(flat.en["joinWizard.confirmation.pendantShippingDesc"]).toMatch(
      /recorded delivery.*5–7 working days/i,
    );
    expect(flat.es["joinWizard.confirmation.pendantShippingDesc"]).toMatch(/5–7 días laborables/);
    expect(flat.nl["joinWizard.confirmation.pendantShippingDesc"]).toMatch(/5–7 werkdagen/);
    const email = readFileSync(join(ROOT, "supabase/functions/_shared/welcome-email.ts"), "utf8");
    for (const p of [/5-7 working days/, /5-7 días laborables/, /5-7 werkdagen/]) {
      expect(email, `confirmation email must quote the same delivery service (${p})`).toMatch(p);
    }
  });
});

describe("right of withdrawal — statutory, consistent, and on every required surface", () => {
  it("marketing states the statutory right, not a voluntary guarantee", () => {
    expect(flat.en["howItWorksPage.cta.trust2"]).toMatch(/right of withdrawal/i);
    expect(flat.es["howItWorksPage.cta.trust2"]).toMatch(/desistimiento/i);
    expect(flat.nl["howItWorksPage.cta.trust2"]).toMatch(/herroepingsrecht/i);
  });

  it("the Terms carry a full withdrawal clause with the model form, in all locales", () => {
    for (const locale of LOCALES) {
      const items = Object.keys(flat[locale]).filter((k) =>
        /^legal\.terms\.s9_2Items\[\d+\]$/.test(k),
      );
      expect(items.length, `${locale} withdrawal clause must enumerate the mechanics`).toBeGreaterThanOrEqual(6);
      expect(flat[locale]["legal.terms.s9_2FormBody"], `${locale} needs the model form`).toBeTruthy();
      // the four facts the statute requires: window start, how to exercise,
      // refund deadline, who pays return postage.
      const clause = items.map((k) => flat[locale][k]).join(" ");
      expect(clause).toMatch(/14/);
    }
  });

  it("the clause is actually rendered on the Terms page", () => {
    const page = readFileSync(join(ROOT, "src/components/legal/TermsContent.tsx"), "utf8");
    expect(page).toMatch(/legal\.terms\.s9_2Items/);
    expect(page).toMatch(/legal\.terms\.s9_2FormBody/);
  });

  it("the order-confirmation email carries the withdrawal information in all three locales", () => {
    const email = readFileSync(join(ROOT, "supabase/functions/_shared/welcome-email.ts"), "utf8");
    expect(email).toMatch(/right of withdrawal/i);
    expect(email).toMatch(/derecho de desistimiento/i);
    expect(email).toMatch(/herroepingsrecht/i);
    // nl was previously absent entirely — Dutch members got the English body.
    expect(email).toMatch(/nl:\s*\{/);
    expect(readFileSync(join(ROOT, "supabase/functions/_shared/post-payment.ts"), "utf8")).toMatch(
      /memberWelcomeSubject\(lang\)/,
    );
  });

  it("no surface claims the registration fee is simply non-refundable", () => {
    // It is refundable inside the withdrawal window, so the flat statement
    // contradicted the statutory right.
    expect(offenders(/registration fees? (are|is) non-refundable|cuotas? de registro no (es|son) reembolsable/i)).toEqual(
      [],
    );
  });
});

describe("cancellation terms are consistent across surfaces", () => {
  it("no consumer-facing surface imposes a notice period to cancel", () => {
    // Lee's ruling: cancel any time, no notice. Two things stay legitimate and
    // must not be caught: partnerAgreement.*'s 30-day B2B termination notice,
    // and legal.terms.s8_3p1, which is OUR 30-day notice to the member before
    // a price change (consumer-protective, not a barrier to leaving).
    const consumerHits = offenders(
      // An imposed notice period always names a duration; "no notice period"
      // and "geen opzegtermijn" are the statements we WANT and must not match.
      /(require|requires|required)[^.]{0,40}(notice|preaviso)[^.]{0,40}(cancel|cancelaci)|notice period (for|to) cancel|preaviso para la cancelaci|opzegtermijn van\s*\d|\d+\s*(dagen|maanden)\s*opzegtermijn/i,
    ).filter((hit) => !/:partnerAgreement\./.test(hit));
    expect(consumerHits).toEqual([]);
  });

  it("cancel-any-time is stated in the FAQ and the Terms alike", () => {
    expect(flat.en["support.faq.cancelSubscriptionAnswer"]).toMatch(/cancel at any time/i);
    expect(flat.en["support.faq.cancelSubscriptionAnswer"]).toMatch(/no notice period/i);
    expect(flat.en["legal.terms.s9_1p1"]).toMatch(/no notice period/i);
  });
});

describe("response times stay qualitative until we can measure real ones", () => {
  // Terms §3.2 lists "Guaranteed response times" under what we do NOT
  // provide, and §4.3 states we guarantee no specific response time. Any
  // number attached to a response-time claim contradicts our own contract.

  it("no journey step advertises a numeric response time", () => {
    const bad: string[] = [];
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(flat[locale])) {
        if (/^howItWorksPage\.step\d+\.time$/.test(key) && /\d/.test(value)) {
          bad.push(`${locale}:${key} → ${value}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("no marketing surface quotes a measured response-time statistic", () => {
    // Caught contact.whyTrust.responseDesc ("average response time under 30
    // seconds") shipping on the live /contact page in all three locales.
    // legal.* is exempt: §4.3 disclaims response times and cites 112.
    const pattern =
      /(response time|tiempo de respuesta|responstijd)[^.!?]{0,40}\d|(under|less than|inferior a|minder dan)\s*\d+\s*(seconds?|segundos|seconden)/i;
    expect(offenders(pattern).filter((hit) => !/:legal\./.test(hit))).toEqual([]);
  });
});

describe("seeded catalog copy is corrected by guarded migrations", () => {
  const dir = join(ROOT, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const SEED = "20260420090100_seed_product_catalog.sql";
  const read = (f: string) => readFileSync(join(dir, f), "utf8");
  /** Executable SQL only — the correctives name the old copy in their notes. */
  const executable = (f: string) =>
    read(f)
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

  it("only the historical seed still contains the stripped claims", () => {
    const stray = files.filter(
      (f) =>
        f !== SEED &&
        /nurse-led|dirigido por enfermeras|connects you to Isabella/i.test(executable(f)),
    );
    expect(stray).toEqual([]);
  });

  it("both corrective migrations are guarded so a prod admin edit wins", () => {
    for (const prefix of ["20260725120000", "20260725130000"]) {
      const f = files.find((m) => m.startsWith(prefix));
      expect(f, `migration ${prefix}* must exist`).toBeDefined();
      const sql = read(f!);
      expect(sql).toMatch(/UPDATE public\.products/);
      expect(sql, `${prefix} must only rewrite rows still carrying the old copy`).toMatch(
        /WHERE slug = 'pendant'[\s\S]*ILIKE/,
      );
      expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY/i);
    }
  });

  it("the replacement catalog copy is human-first and non-clinical", () => {
    const sql = read(files.find((m) => m.startsWith("20260725130000"))!);
    expect(sql).toMatch(/trained response team/);
    expect(sql).toMatch(/equipo de respuesta capacitado/);
    expect(sql).toMatch(/getrainde meldkamerteam/);
  });
});
