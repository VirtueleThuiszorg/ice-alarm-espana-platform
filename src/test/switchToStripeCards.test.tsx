// @vitest-environment jsdom
//
// THE TWO SCREENS OF A BILLING SWITCH: the operator's and the member's.
//
// What they have to get right is the same thing from two directions — NEITHER MAY CLAIM THE
// MEMBER HAS MOVED. `billing_source` becomes `stripe` when the payment webhook sees the money
// and at no other time, so until then the operator's card says "waiting for payment" and the
// member's says their usual bank payment continues.
//
// And the member's card must not show a link that cannot work. Stripe caps a Checkout Session at
// 24 hours while the switch window is 14 days, so for most of the time that card is on screen
// the stored URL is dead — and an expired Stripe page is read by many elderly people as a failed
// payment, or worse, as a successful one.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: "en" },
  }),
}));

import { SwitchToStripeCard } from "@/components/client/SwitchToStripeCard";
import { MoveToStripeCard } from "@/components/admin/member-detail/MoveToStripeCard";

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe("the member's own card", () => {
  const LIVE = {
    checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
    sessionExpiresAt: "2026-09-12T00:00:00.000Z",
    switchExpiresAt: "2026-09-25T00:00:00.000Z",
    now: new Date("2026-09-11T10:00:00.000Z"),
  };

  it("leads with the alarm not changing", () => {
    wrap(<SwitchToStripeCard {...LIVE} />);
    expect(screen.getByTestId("member-switch-card").textContent).toMatch(
      /alarm, your pendant and the number we call are not changing/i,
    );
  });

  it("shows the link while the Stripe session is live", () => {
    wrap(<SwitchToStripeCard {...LIVE} />);
    const link = screen.getByTestId("member-switch-pay").closest("a");
    expect(link?.getAttribute("href")).toBe(LIVE.checkoutUrl);
  });

  it("says the usual bank payment continues until it is done — not that it has stopped", () => {
    wrap(<SwitchToStripeCard {...LIVE} />);
    expect(screen.getByTestId("member-switch-card").textContent).toMatch(
      /usual bank payment continues/i,
    );
  });

  // THE ONE THAT MATTERS. A dead Stripe link does not announce itself as dead in any way an
  // 82-year-old will read.
  it("shows NO link once the session has expired, and offers a person instead", () => {
    wrap(
      <SwitchToStripeCard
        {...LIVE}
        now={new Date("2026-09-13T10:00:00.000Z")}
      />,
    );
    expect(screen.queryByTestId("member-switch-pay")).toBeNull();
    expect(screen.getByTestId("member-switch-expired")).toBeTruthy();
    expect(screen.getByTestId("member-switch-ask")).toBeTruthy();
  });

  it("reassures rather than alarms when the link has expired", () => {
    wrap(<SwitchToStripeCard {...LIVE} now={new Date("2026-09-13T10:00:00.000Z")} />);
    expect(screen.getByTestId("member-switch-expired").textContent).toMatch(
      /your alarm is working as normal/i,
    );
  });

  it("shows no link when there never was one", () => {
    wrap(
      <SwitchToStripeCard checkoutUrl={null} sessionExpiresAt={null} switchExpiresAt={null} />,
    );
    expect(screen.queryByTestId("member-switch-pay")).toBeNull();
    expect(screen.getByTestId("member-switch-expired")).toBeTruthy();
  });
});

describe("the operator's card", () => {
  const base = {
    memberId: "m-1",
    memberName: "Brenda Colefax",
    switchExpiresAt: null,
    nextRenewal: "2026-09-20",
  };

  it("offers the switch to a confirmed legacy member", () => {
    wrap(<MoveToStripeCard {...base} status="active" billingSource="legacy" />);
    expect(screen.getByTestId("move-to-stripe-send")).toBeTruthy();
    expect(screen.getByTestId("switch-state-badge").textContent).toBe("On Santander");
  });

  it("is ABSENT for a member Stripe already bills", () => {
    wrap(<MoveToStripeCard {...base} status="active" billingSource="stripe" />);
    expect(screen.queryByTestId("move-to-stripe-card")).toBeNull();
  });

  // Confirming them is the card above this one. Offering to bill somebody nobody has looked at
  // yet is offering to charge a row, not a person.
  it("is ABSENT for a member still waiting to be confirmed", () => {
    wrap(<MoveToStripeCard {...base} status="pending_review" billingSource="legacy" />);
    expect(screen.queryByTestId("move-to-stripe-card")).toBeNull();
  });

  it("says WAITING FOR PAYMENT while a link is out — never that they have moved", () => {
    wrap(
      <MoveToStripeCard
        {...base}
        status="active"
        billingSource="switch_pending"
        switchExpiresAt="2026-09-25T00:00:00.000Z"
      />,
    );
    expect(screen.getByTestId("switch-state-badge").textContent).toBe("Waiting for payment");
    // And no second "create the link" button: two live sessions is two ways to be charged.
    expect(screen.queryByTestId("move-to-stripe-send")).toBeNull();
  });

  it("says they have left the Santander export, which is the fact staff need", () => {
    wrap(
      <MoveToStripeCard
        {...base}
        status="active"
        billingSource="switch_pending"
        switchExpiresAt="2026-09-25T00:00:00.000Z"
      />,
    );
    expect(screen.getByTestId("move-to-stripe-card").textContent).toMatch(
      /taken out of the Santander export so nobody collects twice/i,
    );
  });

  it("says plainly when no Santander date is recorded, rather than implying one", () => {
    wrap(<MoveToStripeCard {...base} nextRenewal={null} status="active" billingSource="legacy" />);
    expect(screen.getByTestId("move-to-stripe-card").textContent).toMatch(
      /No Santander date is recorded/i,
    );
  });
});
