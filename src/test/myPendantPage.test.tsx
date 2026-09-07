/**
 * MY PENDANT — the page that told a member who had paid for a pendant to buy one.
 *
 * WP4: *"My pendant: remove 'What You're Missing'; show what they have, live status, and one
 * 'Add a pendant' action; state from WP2."*
 *
 * TWO THINGS WERE WRONG, and the second is a live defect rather than a design complaint.
 *
 * 1. "WHAT YOU'RE MISSING" was four rows in `text-destructive`, each with a red ✗: we cannot
 *    track your location, falls are not detected, you must call us manually, no boundary alerts.
 *    Every line true; the whole card wrong. It opened the page of somebody who CHOSE the
 *    phone-only plan with four ways they are unprotected, in the colour this product reserves
 *    for an emergency (R2), on the screen they are most likely to open when they are worried.
 *
 * 2. `hasPendant` was `subscription?.has_pendant && device`. Between the payment and the device
 *    being assigned — which is every member of WP2's `paid` and `allocated` states —
 *    **a member who had bought a pendant was shown the sales page and a "Purchase Pendant"
 *    button.** They had already purchased it.
 *
 * And one thing that only shows up when a setting is missing: the ONLY route to adding a pendant
 * was `whatsappNumber && <Button …>`. With `settings_emergency_phone` unset — the state WP1b's
 * "show nothing, never a fake number" rule leaves us in until it is seeded — a phone-only member
 * had **no route at all** to the one thing the page is offering them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";

import { supportActionPath } from "@/lib/supportActions";
import { FULFILMENT_MEANING } from "@/lib/fulfilmentState";
import type { FulfilmentState } from "@/lib/fulfilmentState";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

let deviceRow: Record<string, unknown> | null = null;
let subscriptionRows: Record<string, unknown>[] = [];
let pendantState: FulfilmentState | null = null;
let emergencyPhone: string | null = "950473199";

vi.mock("@/hooks/useMemberProfile", () => ({
  useMemberDevice: () => ({ data: deviceRow, isLoading: false }),
  useMemberSubscription: () => ({ data: subscriptionRows[0] ?? null, isLoading: false }),
}));

vi.mock("@/hooks/usePendantOrder", () => ({
  usePendantOrderForMember: () => ({
    memberPendantOrder: pendantState
      ? {
          id: "o1",
          orderNumber: "ICE-1",
          memberId: "m1",
          fulfilmentState: pendantState,
          fulfilmentStateReason: null,
          status: null,
          testedAt: null,
          testedByName: null,
        }
      : null,
    memberPendantOrderLoading: false,
    order: null,
    linkedToOrder: false,
    hasDevice: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useCompanySettings", () => ({
  useCompanySettings: () => ({ settings: { emergency_phone: emergencyPhone } }),
}));
vi.mock("@/hooks/useDeviceRealtime", () => ({ useDeviceRealtime: () => undefined }));
vi.mock("@/hooks/usePricing", () => ({ usePricing: () => ({ config: null, isLoading: false }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ memberId: "m1" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => (typeof fallback === "string" ? fallback : _k),
    i18n: { language: "en" },
  }),
}));

async function renderPage() {
  const Page = (await import("@/pages/client/DevicePage")).default;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("page-header")).toBeTruthy());
  return view;
}

const PHONE_ONLY = [{ has_pendant: false, status: "active" }];
const PENDANT_BOUGHT = [{ has_pendant: true, status: "active" }];

beforeEach(() => {
  deviceRow = null;
  subscriptionRows = PHONE_ONLY;
  pendantState = null;
  emergencyPhone = "950473199";
});
afterEach(() => cleanup());

describe("the member who has PAID for a pendant and is waiting for it", () => {
  beforeEach(() => {
    subscriptionRows = PENDANT_BOUGHT;
    deviceRow = null;
  });

  it("gets the waiting page, not the sales page", async () => {
    await renderPage();
    expect(screen.getByTestId("pendant-awaiting")).toBeVisible();
    expect(screen.queryByTestId("device-add-pendant")).toBeNull();
  });

  it("is told the REAL fulfilment state, from WP2", async () => {
    pendantState = "dispatched";
    await renderPage();
    expect(screen.getByTestId("pendant-awaiting-state").textContent).toBe(
      FULFILMENT_MEANING.dispatched.fallback,
    );
  });

  it("gets an honest holding line when the order cannot be read, not a blank", async () => {
    pendantState = null;
    await renderPage();
    expect(screen.getByTestId("pendant-awaiting-state").textContent).toMatch(
      /getting your pendant ready/i,
    );
  });

  it("is told the next step is a test call WE make — Q1 is operator-confirmed only", async () => {
    // A member cannot mark their own pendant tested, so the page must say who does, or they
    // wait for a button that will never appear.
    await renderPage();
    expect(screen.getByTestId("pendant-awaiting").textContent).toMatch(/we will phone you/i);
  });

  it("is never shown 'What You're Missing'", async () => {
    await renderPage();
    expect(screen.queryByText(/What You're Missing/i)).toBeNull();
  });

  it("has exactly one red button on the page", async () => {
    const { container } = await renderPage();
    const red = [...container.querySelectorAll("a,button")].filter((el) =>
      el.className.split(/\s+/).includes("bg-primary"),
    );
    expect(red.length).toBe(1);
  });
});

describe("the phone-only member", () => {
  it("is not shown 'What You're Missing'", async () => {
    await renderPage();
    expect(screen.queryByText(/What You're Missing/i)).toBeNull();
    expect(screen.queryByText(/We cannot track your location/i)).toBeNull();
    expect(screen.queryByText(/Falls are not automatically detected/i)).toBeNull();
  });

  it("is shown what they DO have — a number that reaches an operator", async () => {
    await renderPage();
    expect(screen.getByText("950473199")).toBeVisible();
  });

  it("gets an 'Add a pendant' route even with NO number configured", async () => {
    // The whole defect: the only route used to be a wa.me link gated on the setting.
    emergencyPhone = null;
    await renderPage();
    expect(screen.getByTestId("device-add-pendant").getAttribute("href")).toBe(
      supportActionPath("add_pendant"),
    );
  });

  it("and the in-app route is there when a number IS configured too", async () => {
    await renderPage();
    expect(screen.getByTestId("device-add-pendant")).toBeVisible();
  });

  it("keeps the pendant's feature list — a feature list belongs in the offer", async () => {
    // Removing the red ✗ card is not the same as hiding what a pendant does.
    await renderPage();
    expect(screen.getByText(/GPS Location Tracking/i)).toBeVisible();
    expect(screen.getByText(/Automatic Fall Detection/i)).toBeVisible();
  });
});

describe("the source, and the strings that went with the card", () => {
  const page = () => read("src/pages/client/DevicePage.tsx");

  it("the four-✗ card is gone from the markup", () => {
    // Asserted on the t() CALLS, not on the file text: the comment that explains the removal
    // names the card, and asserting a phrase is absent from a file matches the prose about its
    // absence — a slip this codebase has made four times.
    const src = page();
    expect(src).not.toMatch(/t\(\s*['"]device\.whatYoureMissing['"]/);
    expect(src).not.toMatch(/t\(\s*['"]device\.weCannotTrackLocation['"]/);
    expect(src).not.toMatch(/t\(\s*['"]device\.fallsNotDetected['"]/);
    expect(src).not.toMatch(/t\(\s*['"]device\.mustCallManually['"]/);
    expect(src).not.toMatch(/t\(\s*['"]device\.noBoundaryAlerts['"]/);
  });

  it("and its strings are deleted from all three locales, not left to rot", () => {
    for (const l of ["en", "es", "nl"]) {
      const device = (JSON.parse(read(`src/i18n/locales/${l}.json`)) as Record<string, Record<string, unknown>>)
        .device;
      for (const key of [
        "whatYoureMissing",
        "weCannotTrackLocation",
        "fallsNotDetected",
        "mustCallManually",
        "noBoundaryAlerts",
        "purchasePendant",
      ]) {
        expect(device, `${l}.device.${key}`).not.toHaveProperty(key);
      }
    }
  });

  it("but the four feature LABELS survive, because the offer still uses them", () => {
    // Deleting a key that is still called renders raw dotted text on the page. The first pass at
    // this deleted all ten; `i18nKeyCoverage` caught four of them, and it was right.
    for (const l of ["en", "es", "nl"]) {
      const device = (JSON.parse(read(`src/i18n/locales/${l}.json`)) as Record<string, Record<string, unknown>>)
        .device;
      for (const key of ["gpsLocation", "fallDetection", "sosButton", "geoFencing"]) {
        expect(device, `${l}.device.${key}`).toHaveProperty(key);
      }
    }
  });

  it("the awaiting branch is keyed on has_pendant AND the absence of a device", () => {
    expect(page()).toMatch(/subscription\?\.has_pendant === true && !device/);
  });

  it("no route on the page is gated on WhatsApp being configured on its own", () => {
    const src = page();
    // The add-a-pendant Link must not sit inside a `whatsappNumber && (...)` guard.
    const at = src.indexOf('supportActionPath("add_pendant")');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, at - 400), at)).not.toContain("whatsappNumber && (");
  });
});
