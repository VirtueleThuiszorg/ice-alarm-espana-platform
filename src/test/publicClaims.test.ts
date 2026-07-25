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

  it("no next-day or free delivery (shipping is a charged fee, quoted at 2-3 business days)", () => {
    expect(
      offenders(
        /next.?day deliver|free\s+(next.?day\s+)?deliver|entrega gratuita|envío gratis|gratis (levering|verzending)/i,
      ),
    ).toEqual([]);
  });

  it("no nurse-led or clinician-led staffing claim (app_role has no nurse; Terms §3.2 disclaims medical care)", () => {
    expect(
      offenders(/nurse.?led|led by nurses|dirigido por enfermer|verpleegkundig geleid/i),
    ).toEqual([]);
  });

  it("the delivery claim we do make matches the checkout's own timeframe", () => {
    // joinWizard.confirmation.pendantShippingDesc is the statement made at
    // purchase — the marketing badge must not promise anything faster.
    expect(flat.en["joinWizard.confirmation.pendantShippingDesc"]).toMatch(/2-3 business days/i);
    expect(flat.en["howItWorksPage.cta.trust3"]).toMatch(/2–3 business days/i);
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
