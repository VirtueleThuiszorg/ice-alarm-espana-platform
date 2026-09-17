/**
 * The Create Account step of /partner/join shows the agreement it asks the partner to accept.
 *
 * Before: an "I accept the terms and conditions *" checkbox with one English sentence and no
 * terms shown or linked, while the full Partner Agreement existed in the repo and was only
 * shown AFTER registration, in the portal. Accepting unseen terms is not an informed
 * acceptance, and the row recorded a version (partners.terms_version) of a text the partner
 * had never been shown.
 *
 * These tests hold:
 *  - the step renders the full agreement (every section) above the checkbox;
 *  - it links a public, readable copy at /partner/terms, which is a real route;
 *  - the checkbox names the agreement and its version, from i18n;
 *  - the version shown === the version the server records === the agreement version;
 *  - there is ONE renderer of the agreement text, not a copy per surface;
 *  - clause numbers written inside the text match the rendered section numbers.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";

import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import nl from "@/i18n/locales/nl.json";
import { agreementSections, CURRENT_AGREEMENT_VERSION } from "@/content/partnerAgreementTerms";
import { CURRENT_PARTNER_TERMS_VERSION } from "@/content/partnerTerms";
import { PARTNER_TERMS_VERSION } from "../../supabase/functions/_shared/partnerTerms";
import { ROUTE_MODULES } from "@/lib/routeModules.generated";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

vi.mock("@/components/layout/PublicHeader", () => ({ PublicHeader: () => null }));

// Skip per-step validation so the test can walk to the Create Account step without
// filling 20 fields; validation itself is covered by partnerRegistration/partnerValidationParity.
vi.mock("@/lib/partnerRegistrationSchema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/partnerRegistrationSchema")>()),
  PARTNER_STEP_FIELDS: {},
}));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const EXPECTED_ORDER = [
  "parties",
  "definitions",
  "object",
  "status",
  "attribution",
  "obligations",
  "marketing",
  "commissions",
  "clawback",
  "payment",
  "intellectualProperty",
  "confidentiality",
  "dataProtection",
  "duration",
  "termination",
  "liability",
  "amendments",
  "jurisdiction",
  "general",
];

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: false,
    resources: { en: { translation: en }, es: { translation: es } },
    interpolation: { escapeValue: false },
  });
});

async function renderAccountStep(lng: "en" | "es" = "en") {
  await i18n.changeLanguage(lng);
  const { default: PartnerJoin } = await import("@/pages/partner/PartnerJoin");
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/partner/join"]}>
        <Routes>
          <Route path="/partner/join" element={<PartnerJoin />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /join now/i }));
  // type → contact → additional → payout → account (individual referrer path)
  for (let i = 0; i < 4; i++) {
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    await Promise.resolve();
  }
  await screen.findByRole("button", { name: /create partner account/i });
}

describe("version parity — shown, recorded and signed are the same version", () => {
  it("the join form's version is the agreement's version", () => {
    expect(CURRENT_PARTNER_TERMS_VERSION).toBe(CURRENT_AGREEMENT_VERSION);
  });

  it("the server records that same version", () => {
    expect(PARTNER_TERMS_VERSION).toBe(CURRENT_AGREEMENT_VERSION);
  });

  it("the client derives it rather than typing a second literal", () => {
    expect(read("src/content/partnerTerms.ts")).toMatch(
      /CURRENT_PARTNER_TERMS_VERSION\s*=\s*CURRENT_AGREEMENT_VERSION/,
    );
  });

  it("is 2.0 after the September 2026 redraft", () => {
    expect(CURRENT_AGREEMENT_VERSION).toBe("2.0");
  });
});

describe("the Create Account step shows the agreement", () => {
  it("renders every section of the agreement above the acceptance checkbox", async () => {
    await renderAccountStep("en");
    const panel = screen.getByTestId("partner-agreement-panel");
    const region = within(panel).getByRole("region", { name: /full text of the partner agreement/i });
    expect(region).toHaveAttribute("tabindex", "0"); // scrollable by keyboard

    const headings = within(region).getAllByRole("heading", { level: 4 });
    expect(headings).toHaveLength(agreementSections.length);
    expect(headings[0]).toHaveTextContent("1. CONTRACTING PARTIES");
    expect(headings[7]).toHaveTextContent("8. COMMISSION");
    expect(within(region).getByText(/Version: 2\.0/)).toBeInTheDocument();
    expect(within(region).getByText(/Draft pending legal review/)).toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox");
    // DOCUMENT_POSITION_FOLLOWING: the checkbox comes after the panel.
    expect(panel.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("links the public readable version, in a new tab", async () => {
    await renderAccountStep("en");
    const link = screen.getByRole("link", { name: /open the full agreement/i });
    expect(link).toHaveAttribute("href", "/partner/terms");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("the checkbox names the agreement and its version", async () => {
    await renderAccountStep("en");
    expect(
      screen.getByText(`I have read and accept the Partner Agreement (version ${CURRENT_PARTNER_TERMS_VERSION}) *`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/I accept the terms and conditions/)).not.toBeInTheDocument();
  });

  it("is translated — Spanish shows the Spanish agreement and label", async () => {
    await renderAccountStep("es");
    expect(
      screen.getByText(`He leído y acepto el Acuerdo de Colaboración (versión ${CURRENT_PARTNER_TERMS_VERSION}) *`),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir el acuerdo completo/i })).toHaveAttribute("href", "/partner/terms");
    expect(screen.getByText("1. PARTES CONTRATANTES")).toBeInTheDocument();
  });

  it("the old hardcoded English acceptance copy is gone from the source", () => {
    const src = read("src/pages/partner/PartnerJoin.tsx");
    expect(src).not.toMatch(/I accept the terms and conditions/);
    expect(src).not.toMatch(/By registering, you agree to our partner program terms/);
    expect(src).toMatch(/partnerJoin\.terms\.acceptLabel/);
  });
});

describe("/partner/terms is a real public route", () => {
  it("is routed in App.tsx to PartnerTermsPage, outside any ProtectedRoute", () => {
    const app = read("src/App.tsx");
    expect(app).toMatch(/import\("\.\/pages\/partner\/PartnerTermsPage"\)/);
    const route = app.match(/<Route path="\/partner\/terms" element={<PartnerTermsPage \/>} \/>/);
    expect(route).not.toBeNull();
    // declared among the partner public routes, before the protected dashboard block
    expect(app.indexOf('path="/partner/terms"')).toBeLessThan(app.indexOf('path="/partner-dashboard"'));
  });

  it("renders the whole agreement without an account, with a way back to registration", async () => {
    await i18n.changeLanguage("en");
    const { default: PartnerTermsPage } = await import("@/pages/partner/PartnerTermsPage");
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/partner/terms"]}>
          <PartnerTermsPage />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Partner Agreement" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(agreementSections.length);
    expect(screen.getByText(/Version: 2\.0/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to partner registration/i })).toHaveAttribute("href", "/partner/join");
  });

  it("is in the generated prefetch map", () => {
    expect(ROUTE_MODULES["/partner/terms"]).toBeTypeOf("function");
  });
});

describe("one agreement text, one renderer", () => {
  it("only PartnerAgreementText maps over agreementSections", () => {
    for (const file of [
      "src/pages/partner/PartnerJoin.tsx",
      "src/pages/partner/PartnerTermsPage.tsx",
      "src/pages/partner/PartnerAgreementPage.tsx",
      "src/components/partner/AgreementRequiredModal.tsx",
    ]) {
      const src = read(file);
      expect(src, file).not.toMatch(/agreementSections\.map/);
      expect(src, file).toMatch(/<PartnerAgreementText/);
    }
    expect(read("src/components/partner/PartnerAgreementText.tsx")).toMatch(/agreementSections\.map/);
  });
});

describe("agreement content integrity", () => {
  it("sections are in the order the clause numbers assume", () => {
    expect(agreementSections.map((s) => s.titleKey.split(".")[2])).toEqual(EXPECTED_ORDER);
    for (const s of agreementSections) {
      expect(s.contentKey).toBe(s.titleKey.replace(/\.title$/, ".content"));
    }
  });

  it.each([
    ["en", en],
    ["es", es],
    ["nl", nl],
  ])("%s has a title and content for every section", (_loc, dict) => {
    const sections = (dict as { partnerAgreement: { sections: Record<string, { title: string; content: string }> } })
      .partnerAgreement.sections;
    expect(Object.keys(sections)).toEqual(EXPECTED_ORDER);
    for (const key of EXPECTED_ORDER) {
      expect(sections[key].title.trim()).not.toBe("");
      expect(sections[key].content.trim()).not.toBe("");
    }
  });

  it.each([
    ["en", en],
    ["es", es],
  ])("%s: every numbered sub-clause belongs to the section it sits in", (_loc, dict) => {
    const sections = (dict as { partnerAgreement: { sections: Record<string, { content: string }> } })
      .partnerAgreement.sections;
    EXPECTED_ORDER.forEach((key, index) => {
      const starts = [...sections[key].content.matchAll(/(?:^|<br\/>)(\d+)\.\d+ /g)].map((m) => Number(m[1]));
      for (const n of starts) expect(n, `${key} carries clause ${n}.x`).toBe(index + 1);
    });
  });

  it.each([
    ["en", en],
    ["es", es],
  ])("%s states the commission the code pays: €50 once per member, 7-day hold", (_loc, dict) => {
    const c = (dict as { partnerAgreement: { sections: { commissions: { content: string } } } }).partnerAgreement
      .sections.commissions.content;
    expect(c).toMatch(/€50|50 €/);
    expect(c).toMatch(/7 (days|días)/);
    expect(read("src/hooks/useOrderActions.ts")).toMatch(/COMMISSION_PER_MEMBER_EUR = 50/);
    expect(read("src/hooks/useOrderActions.ts")).toMatch(/releaseAt\.getDate\(\) \+ 7/);
  });

  it("no longer advertises a minimum payout threshold the code does not implement", () => {
    expect(en.partnerAgreement.sections.payment.content).not.toMatch(/threshold/i);
    expect(es.partnerAgreement.sections.payment.content).not.toMatch(/umbral/i);
  });

  it("carries the draft status line in every locale", () => {
    expect(en.partnerAgreement.draftStatus).toMatch(/pending legal review/i);
    expect(es.partnerAgreement.draftStatus).toMatch(/pendiente de revisión jurídica/i);
    expect(nl.partnerAgreement.draftStatus).toBeTruthy();
  });
});
