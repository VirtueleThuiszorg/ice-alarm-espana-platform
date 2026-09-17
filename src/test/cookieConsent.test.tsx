/**
 * COOKIES — LSSI-CE art. 22.2 / AEPD cookie guide (2023). Starting point, pending legal review.
 *
 * What is proven here, and what used to be false:
 *   1. NOTHING NON-ESSENTIAL BEFORE CONSENT. `PageTracker` wrote a persistent visitor id and sent
 *      a page view to `website_events` on the very first render, for everybody, whatever the
 *      banner said. The banner's choice was stored and then read by nothing.
 *   2. REJECT IS AS EASY AS ACCEPT. Reject was styled `secondary`, accept `default`.
 *   3. NO PRE-TICKED BOXES, a versioned + expiring record, and real withdrawal (the analytics ids
 *      are deleted, and a mounted tracker stops without a reload).
 *   4. THE COOKIE POLICY TABLE IS THE CODE'S TABLE. Every storage key the app writes must have a
 *      row in `legal.cookies`, so the policy cannot silently fall behind the code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const insert = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert }) },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import {
  ANALYTICS_STORAGE_KEYS,
  COOKIE_CONSENT_CHANGED_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  CONSENT_MAX_AGE_MS,
  hasAnalyticsConsent,
  readCookieConsent,
  saveCookieConsent,
} from "@/lib/cookieConsent";
import { PageTracker } from "@/components/analytics/PageTracker";
import { CookieConsentBanner, openCookieSettings } from "@/components/gdpr/CookieConsentBanner";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  insert.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the consent record", () => {
  it("is absent until a choice is made, and absent means no analytics", () => {
    expect(readCookieConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("treats corrupt, pre-versioning and expired records as no choice", () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "{not json");
    expect(readCookieConsent()).toBeNull();

    // The shape the banner wrote before this change: no version.
    localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ essential: true, analytics: true, marketing: true, consentedAt: new Date().toISOString() }),
    );
    expect(readCookieConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);

    const old = new Date(Date.now() - CONSENT_MAX_AGE_MS - 60_000).toISOString();
    localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ essential: true, analytics: true, marketing: false, consentedAt: old, version: COOKIE_CONSENT_VERSION }),
    );
    expect(readCookieConsent()).toBeNull();
  });

  it("records version, time and method, and broadcasts the change", () => {
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, on);
    saveCookieConsent({ analytics: true, marketing: false, method: "custom" });
    window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, on);

    const stored = JSON.parse(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)!);
    expect(stored).toMatchObject({ essential: true, analytics: true, marketing: false, version: COOKIE_CONSENT_VERSION, method: "custom" });
    expect(Number.isNaN(Date.parse(stored.consentedAt))).toBe(false);
    expect(seen).toHaveLength(1);
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it("withdrawing analytics deletes what analytics stored", () => {
    for (const k of ANALYTICS_STORAGE_KEYS) localStorage.setItem(k, "x");
    localStorage.setItem("i18nextLng", "es");
    saveCookieConsent({ analytics: false, marketing: false, method: "reject_all" });
    for (const k of ANALYTICS_STORAGE_KEYS) expect(localStorage.getItem(k)).toBeNull();
    // Preferences are not analytics and stay.
    expect(localStorage.getItem("i18nextLng")).toBe("es");
  });
});

function Nav({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>go</button>;
}

describe("PageTracker waits for consent", () => {
  const renderTracker = () =>
    render(
      <MemoryRouter initialEntries={["/"]}>
        <PageTracker />
        <Nav to="/pricing" />
      </MemoryRouter>,
    );

  it("stores nothing and sends nothing before a choice", async () => {
    vi.useFakeTimers();
    renderTracker();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(insert).not.toHaveBeenCalled();
    expect(localStorage.getItem("ice_visitor_id")).toBeNull();
  });

  it("stores nothing and sends nothing after a rejection", async () => {
    saveCookieConsent({ analytics: false, marketing: false, method: "reject_all" });
    vi.useFakeTimers();
    renderTracker();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(insert).not.toHaveBeenCalled();
    expect(localStorage.getItem("ice_visitor_id")).toBeNull();
  });

  it("starts when consent is given mid-visit, and stops again on withdrawal", async () => {
    vi.useFakeTimers();
    renderTracker();
    await act(async () => {
      saveCookieConsent({ analytics: true, marketing: false, method: "custom" });
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("ice_visitor_id")).not.toBeNull();

    await act(async () => {
      saveCookieConsent({ analytics: false, marketing: false, method: "custom" });
    });
    expect(localStorage.getItem("ice_visitor_id")).toBeNull();
    fireEvent.click(screen.getByText("go"));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("the banner", () => {
  const renderBanner = () =>
    render(
      <MemoryRouter>
        <CookieConsentBanner />
      </MemoryRouter>,
    );

  it("shows when there is no valid choice, with reject and accept styled identically", () => {
    renderBanner();
    const reject = screen.getByTestId("cookie-reject");
    const accept = screen.getByTestId("cookie-accept");
    expect(reject.className).toBe(accept.className);
    expect(screen.getByRole("link", { name: "gdpr.cookieBanner.policyLink" })).toHaveAttribute("href", "/cookies");
  });

  it("reject writes a versioned record with nothing optional, and hides the banner", () => {
    renderBanner();
    fireEvent.click(screen.getByTestId("cookie-reject"));
    expect(readCookieConsent()).toMatchObject({ analytics: false, marketing: false, method: "reject_all" });
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });

  it("does not show again once a valid choice exists", () => {
    saveCookieConsent({ analytics: false, marketing: false, method: "reject_all" });
    renderBanner();
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });

  it("opens settings with every optional switch OFF, and can be re-opened from anywhere", () => {
    saveCookieConsent({ analytics: false, marketing: false, method: "reject_all" });
    renderBanner();
    act(() => openCookieSettings());
    const switches = screen.getAllByRole("switch");
    // essential (disabled, on) + analytics + marketing
    expect(switches).toHaveLength(3);
    expect(switches[1]).toHaveAttribute("aria-checked", "false");
    expect(switches[2]).toHaveAttribute("aria-checked", "false");
    fireEvent.click(switches[1]);
    fireEvent.click(screen.getByText("gdpr.cookieSettings.savePreferences"));
    expect(readCookieConsent()).toMatchObject({ analytics: true, marketing: false, method: "custom" });
  });
});

describe("the Cookie Policy table matches the code", () => {
  const ROOT = process.cwd();
  const en = JSON.parse(readFileSync(path.join(ROOT, "src/i18n/locales/en.json"), "utf8"));
  const cookies = en.legal.cookies;
  const names: string[] = ["essentialRows", "preferencesRows", "analyticsRows", "referralRows", "staffRows"]
    .flatMap((g) => (cookies[g] as Array<{ name: string }>).map((r) => r.name));

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) return f === "test" ? [] : walk(p);
      return /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  }

  it("has a row for every key the app writes to storage or cookies", () => {
    const found = new Set<string>();
    for (const file of walk(path.join(ROOT, "src"))) {
      const src = readFileSync(file, "utf8");
      if (!/localStorage|sessionStorage|document\.cookie/.test(src)) continue;
      for (const m of src.matchAll(/(?:localStorage|sessionStorage)\.setItem\(\s*["'`]([^"'`$]+)/g)) found.add(m[1]);
      for (const m of src.matchAll(/\b(?:[A-Z_]*(?:KEY|PREFIX|NAME)|key|timestampKey)\s*=\s*["']([^"']+)["']/g)) found.add(m[1]);
      for (const m of src.matchAll(/lookupLocalStorage:\s*["']([^"']+)["']/g)) found.add(m[1]);
      for (const m of src.matchAll(/document\.cookie\s*=\s*`([A-Za-z_:]+)[=$]/g)) found.add(m[1]);
    }
    // Keys built from a constant plus a runtime suffix are recorded by their literal part.
    for (const k of ["ice_visitor_id", "ice_session_timestamp", "chunk-reload-", "i18nextLng", "sb-", "ref_partner_code"]) {
      expect(found, `scanner no longer sees ${k}`).toContain(k);
    }
    const missing = [...found].filter((k) => !names.some((n) => n.includes(k)));
    expect(missing, `storage keys with no row in legal.cookies: ${missing.join(", ")}`).toEqual([]);
  });

  it("every locale has the same rows, in the same order, with the same names", () => {
    for (const loc of ["es", "nl"]) {
      const other = JSON.parse(readFileSync(path.join(ROOT, `src/i18n/locales/${loc}.json`), "utf8")).legal.cookies;
      for (const g of ["essentialRows", "preferencesRows", "analyticsRows", "referralRows"]) {
        expect((other[g] as Array<{ name: string }>).map((r) => r.name), `${loc} ${g}`).toEqual(
          (cookies[g] as Array<{ name: string }>).map((r) => r.name),
        );
      }
    }
  });

  it("carries the draft status and the consent duration the code enforces", () => {
    expect(cookies.lastUpdated).toMatch(/Draft pending legal review/);
    expect(cookies.lastUpdated).toContain(`Version ${COOKIE_CONSENT_VERSION}`);
    const consentRow = (cookies.essentialRows as Array<{ name: string; duration: string }>).find(
      (r) => r.name === COOKIE_CONSENT_STORAGE_KEY,
    );
    expect(consentRow?.duration).toMatch(/24 months/);
  });

  it("is routed at /cookies and linked from the public footers", () => {
    const app = readFileSync(path.join(ROOT, "src/App.tsx"), "utf8");
    expect(app).toMatch(/<Route path="\/cookies" element={<CookiesPage \/>} \/>/);
    for (const page of ["LandingPage", "PendantPage", "HowItWorksPage", "CookiesPage"]) {
      const src = readFileSync(path.join(ROOT, `src/pages/${page}.tsx`), "utf8");
      expect(src, page).toMatch(/<CookieFooterLinks /);
    }
  });
});
