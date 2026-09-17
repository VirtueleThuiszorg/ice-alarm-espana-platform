/**
 * /cancellation-policy — the Cancellation, Withdrawal and Refund Policy (DRAFT, pending legal
 * review — LEGAL.md §0).
 *
 * What these assertions protect:
 *
 *   1. the page is reachable: declared in App.tsx, in the prefetch map, the sitemap and the
 *      public e2e audit, and linked from every public legal footer and from the join summary
 *      BEFORE the consumer ticks the terms box;
 *   2. it renders, in English and Spanish, every section plus the model withdrawal form;
 *   3. the load-bearing statements agree with Terms §7.1 / §8.4 / §9.1 / §9.2 — 14 days, refund
 *      by the same payment method within 14 days, cancel any time with no notice period, the
 *      pendant is kept, the SOS button stops reaching the team, and the proportionate charge
 *      applies only when monitoring started at the consumer's express request;
 *   4. the join summary's renewal/withdrawal information is information only — it does not
 *      touch what the Pay button is gated on.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import nl from "@/i18n/locales/nl.json";

// The header pulls in chat, language and prefetch machinery that is irrelevant here.
vi.mock("@/components/layout/PublicHeader", () => ({ PublicHeader: () => <header /> }));

import CancellationPolicyPage from "@/pages/CancellationPolicyPage";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const LOCALES = { en, es, nl } as const;
type Policy = Record<string, string | string[]>;
const policy = (l: keyof typeof LOCALES) =>
  (LOCALES[l] as unknown as { legal: { cancellation: Policy } }).legal.cancellation;
const text = (l: keyof typeof LOCALES) =>
  Object.values(policy(l))
    .flat()
    .join(" ");

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: false,
    resources: { en: { translation: en }, es: { translation: es } },
    interpolation: { escapeValue: false },
  });
});

afterEach(() => cleanup());

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/cancellation-policy"]}>
        <CancellationPolicyPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("the page is reachable", () => {
  it("is a declared public route with its prefetch entry, sitemap entry and e2e audit", () => {
    expect(read("src/App.tsx")).toMatch(
      /<Route path="\/cancellation-policy" element={<CancellationPolicyPage \/>} \/>/,
    );
    expect(read("src/lib/routeModules.generated.ts")).toMatch(
      /"\/cancellation-policy": \(\) => import\("@\/pages\/CancellationPolicyPage"\)/,
    );
    expect(read("supabase/functions/generate-sitemap/index.ts")).toMatch(/path: "\/cancellation-policy"/);
    expect(read("e2e/public.spec.ts")).toMatch(/path: "\/cancellation-policy"/);
  });

  it.each([
    "src/pages/LandingPage.tsx",
    "src/pages/PendantPage.tsx",
    "src/pages/HowItWorksPage.tsx",
    "src/pages/TermsPage.tsx",
    "src/pages/PrivacyPage.tsx",
  ])("%s links to it from the footer", (file) => {
    const src = read(file);
    expect(src).toMatch(/to="\/cancellation-policy"/);
    expect(src).toMatch(/legal\.cancellation\.footerLink/);
  });

  it("the join summary links to it before the consumer accepts the terms", () => {
    const step = read("src/components/join/steps/JoinSummaryStep.tsx");
    const link = step.indexOf('to="/cancellation-policy"');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(step.indexOf('id="terms"'));
    for (const key of ["withdrawalRenewalMonthly", "withdrawalRenewalAnnual", "withdrawalImmediateStart", "withdrawalPolicyLink"]) {
      expect(step).toMatch(new RegExp(`joinWizard\\.summary\\.${key}`));
      expect(step.indexOf(key)).toBeLessThan(step.indexOf('id="terms"'));
    }
  });

  it("the join summary's new copy is information only — the Pay gate is unchanged", () => {
    const wizard = read("src/pages/join/JoinWizard.tsx");
    expect(wizard).toMatch(/return wizardData\.acceptTerms && wizardData\.acceptPrivacy;/);
    expect(read("src/types/wizard.ts")).not.toMatch(/withdrawal|immediateStart/i);
  });
});

describe("the page renders", () => {
  it("in English: title, draft status, every section and the model form", async () => {
    await i18n.changeLanguage("en");
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Cancellation, Withdrawal and Refund Policy" })).toBeInTheDocument();
    expect(screen.getByText(/Draft pending legal review/)).toBeInTheDocument();
    for (let n = 1; n <= 14; n++) {
      expect(screen.getByRole("heading", { level: 2, name: new RegExp(`^${n}\\. `) })).toBeInTheDocument();
    }
    const form = screen.getByTestId("withdrawal-form");
    expect(form).toHaveTextContent("15. Model withdrawal form");
    expect(form).toHaveTextContent(/hereby give notice that I\/we \(\*\) withdraw/);
    expect(form).toHaveTextContent(/Delete as appropriate/);
    expect(screen.getByRole("button", { name: "Print this page" })).toBeInTheDocument();
    // Related documents and footer both reach the other two legal pages.
    expect(screen.getAllByRole("link", { name: "Terms of Service" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Privacy Policy" }).length).toBeGreaterThanOrEqual(1);
    // No raw keys leaked.
    expect(document.body.textContent).not.toMatch(/legal\.cancellation\./);
  });

  it("in Spanish, with the Anexo B wording", async () => {
    await i18n.changeLanguage("es");
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Política de Cancelación, Desistimiento y Reembolsos" }),
    ).toBeInTheDocument();
    const form = screen.getByTestId("withdrawal-form");
    expect(form).toHaveTextContent(/desisto de mi\/desistimos de nuestro \(\*\) contrato/);
    expect(form).toHaveTextContent(/Táchese lo que no proceda/);
    expect(document.body.textContent).not.toMatch(/legal\.cancellation\./);
    await i18n.changeLanguage("en");
  });
});

describe("the policy says what the Terms say", () => {
  it("14 days, refunded within 14 days by the same payment method", () => {
    const t = text("en");
    expect(t).toMatch(/within 14 calendar days without giving any reason/);
    expect(t).toMatch(/no later than 14 days<\/strong> from the day we are informed/);
    expect(t).toMatch(/same means of payment/);
    expect(text("es")).toMatch(/mismo medio de pago/);
    expect(text("nl")).toMatch(/hetzelfde betaalmiddel/);
  });

  it("cancel any time, no notice period, effective at the end of the paid period (Terms §9.1)", () => {
    const t = text("en");
    expect(t).toMatch(/no minimum term and no notice period/);
    expect(t).toMatch(/end of the billing period you have already paid for/);
  });

  it("the pendant is kept on cancellation, and SOS stops reaching the team (Terms §7.1, §9.4)", () => {
    expect(text("en")).toMatch(/You keep the pendant/);
    expect(text("en")).toMatch(/no longer reaches our team/);
    expect(text("es")).toMatch(/ya no contactará con nuestro equipo/);
    expect(text("nl")).toMatch(/ons team niet meer/);
  });

  it("the proportionate charge applies only on an express request (art. 108 TRLGDCU)", () => {
    const t = text("en");
    expect(t).toMatch(/only if you <strong>expressly ask us<\/strong>/);
    expect(t).toMatch(/you owe nothing for the service provided during that period/);
  });

  it("the registration fee is refundable on withdrawal and no deposit is offered", () => {
    expect(text("en")).toMatch(/the registration fee and the cost of standard delivery/);
    for (const l of ["en", "es", "nl"] as const) {
      expect(text(l)).not.toMatch(/deposit|fianza|borg/i);
    }
  });

  it("unsettled facts are visible placeholders, identical in every locale", () => {
    const markers = (l: keyof typeof LOCALES) => (text(l).match(/\[\[TO CONFIRM: [^\]]+\]\]/g) ?? []).sort();
    expect(markers("en").length).toBeGreaterThan(0);
    expect(markers("es")).toEqual(markers("en"));
    expect(markers("nl")).toEqual(markers("en"));
  });

  it("the status line marks the draft in every locale", () => {
    expect(policy("en").lastUpdated).toMatch(/Draft pending legal review/);
    expect(policy("es").lastUpdated).toMatch(/Borrador pendiente de revisión jurídica/);
    expect(policy("nl").lastUpdated).toMatch(/Concept/);
  });
});
