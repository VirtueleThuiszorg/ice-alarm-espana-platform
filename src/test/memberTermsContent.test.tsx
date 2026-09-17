/**
 * MEMBER TERMS OF SERVICE — rendered, complete, and consistent with the product.
 *
 * The 2026-09-17 review rewrote `legal.terms.*` (version 2.0, draft pending legal review). These
 * pins keep the parts of that rewrite that are facts about the product or the law from drifting:
 *
 *  - every key in the namespace is actually rendered (a clause that exists only in JSON is a
 *    clause nobody agreed to), and nothing the page asks for is missing;
 *  - §8.1 quotes prices from the pricing config, never hard-coded figures in copy;
 *  - §8.5 matches `_shared/payment-retry.ts`: a failed payment does not stop monitoring;
 *  - the EU ODR platform link is gone (the platform closed on 20 July 2025);
 *  - consumer-invalid boilerplate (indemnity for family claims, "continued use constitutes
 *    acceptance", courts of our choosing for consumers) does not come back;
 *  - the header shows the version and the draft status.
 */
import { describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";

vi.mock("@/hooks/usePricing", () => ({ usePricing: () => ({ isLoading: false, error: null }) }));

import TermsContent from "@/components/legal/TermsContent";
import { CURRENT_MEMBER_TERMS_VERSION } from "@/content/memberTerms";
import { DEFAULT_PRICING_CONFIG } from "@/config/pricing";

const ROOT = process.cwd();
const LOCALES = ["en", "es", "nl"] as const;
type Terms = Record<string, string | string[]>;

const bundle = (locale: string) =>
  JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${locale}.json`), "utf8")) as Record<string, unknown>;
const terms = (locale: string) => (bundle(locale).legal as { terms: Terms }).terms;
const allText = (t: Terms) => Object.values(t).flat().join("\n");

async function renderIn(locale: string) {
  const i18n = i18next.createInstance();
  const missing: string[] = [];
  await i18n.use(initReactI18next).init({
    lng: locale,
    fallbackLng: false,
    resources: { [locale]: { translation: bundle(locale) } },
    saveMissing: true,
    missingKeyHandler: (_l, _ns, key) => missing.push(key),
  });
  const { container } = render(
    <I18nextProvider i18n={i18n}>
      <TermsContent />
    </I18nextProvider>,
  );
  const text = container.textContent ?? "";
  const html = container.innerHTML;
  cleanup();
  return { text, html, missing };
}

describe("member Terms page", () => {
  it.each(LOCALES)("%s: renders with no missing keys and no uninterpolated placeholders", async (locale) => {
    const { text, missing } = await renderIn(locale);
    expect(missing).toEqual([]);
    expect(text).not.toMatch(/\{\{|\}\}/);
    expect(text).not.toMatch(/legal\.terms\./);
  });

  it("every legal.terms key is used by the page or its header", () => {
    const content = readFileSync(join(ROOT, "src/components/legal/TermsContent.tsx"), "utf8");
    const page = readFileSync(join(ROOT, "src/pages/TermsPage.tsx"), "utf8");
    const unused = Object.keys(terms("en")).filter(
      (k) => !content.includes(`"legal.terms.${k}"`) && !page.includes(`"legal.terms.${k}"`),
    );
    expect(unused).toEqual([]);
  });

  it("§8.1 quotes the configured prices, and the copy hard-codes none", async () => {
    const { text } = await renderIn("en");
    const c = DEFAULT_PRICING_CONFIG;
    const gross = (n: number) => `€${n.toFixed(2)}`;
    expect(text).toContain(gross(c.single.monthlyNet * (1 + c.single.subscriptionTaxRate)));
    expect(text).toContain(gross(c.couple.monthlyNet * (1 + c.couple.subscriptionTaxRate)));
    expect(text).toContain(gross(c.pendantNet * (1 + c.pendantTaxRate)));
    expect(text).toContain(gross(c.registrationBase));
    expect(text).toContain(gross(c.shipping));
    for (const locale of LOCALES) {
      expect(allText(terms(locale)), `${locale} must not hard-code a euro amount`).not.toMatch(/€\s?\d|\d+[.,]\d{2}\s?€/);
    }
  });

  it("§8.5 does not suspend monitoring for a failed payment (payment-retry.ts)", () => {
    const retry = readFileSync(join(ROOT, "supabase/functions/_shared/payment-retry.ts"), "utf8");
    expect(retry).toMatch(/MONITORING NEVER STOPS/);
    expect((terms("en").s8_5Items as string[]).join(" ")).toMatch(/Monitoring continues/);
    expect((terms("es").s8_5Items as string[]).join(" ")).toMatch(/La monitorización continúa/);
    expect((terms("nl").s8_5Items as string[]).join(" ")).toMatch(/De bewaking gaat door/);
    for (const locale of LOCALES) {
      expect(allText(terms(locale))).not.toMatch(/After 7 days|Tras 7 días|Na 7 dagen/i);
    }
  });

  it("no link to the closed EU ODR platform", async () => {
    const { html } = await renderIn("en");
    expect(html).not.toMatch(/ec\.europa\.eu\/consumers\/odr/);
    expect(terms("en").s17_3p2).toMatch(/closed on 20 July 2025/);
  });

  it("consumer-invalid boilerplate stays out", () => {
    const en = allText(terms("en"));
    expect(en).not.toMatch(/indemnify|hold harmless/i);
    expect(en).not.toMatch(/continued use (after changes )?constitutes acceptance/i);
    expect(en).not.toMatch(/refuse service to anyone for any reason/i);
    expect(en).not.toMatch(/courts of Almería/i);
    expect(en).not.toMatch(/by using our services, you consent/i);
    // consumers sue at home (TRLGDCU art. 90.2)
    expect(terms("en").s17_5p1).toMatch(/courts of your place of residence/);
    expect(terms("es").s17_5p1).toMatch(/tribunales de su lugar de residencia/);
  });

  it("identifies the company (LSSI art. 10) in every locale", () => {
    for (const locale of LOCALES) {
      const items = (terms(locale).s2Items as string[]).join(" ");
      expect(items).toMatch(/ICE Alarm España S\.L\./);
      expect(items).toMatch(/B24731531/);
    }
  });

  it("the header carries the version and the draft status", () => {
    expect(CURRENT_MEMBER_TERMS_VERSION).toMatch(/^\d+\.\d+$/);
    expect(terms("en").lastUpdated).toMatch(/\{\{version\}\}.*Draft pending legal review/);
    expect(terms("es").lastUpdated).toMatch(/\{\{version\}\}.*Borrador pendiente de revisión jurídica/);
    expect(terms("nl").lastUpdated).toMatch(/\{\{version\}\}.*juridische toetsing/);
    const page = readFileSync(join(ROOT, "src/pages/TermsPage.tsx"), "utf8");
    expect(page).toMatch(/legal\.terms\.lastUpdated", \{ version: CURRENT_MEMBER_TERMS_VERSION \}/);
  });
});
