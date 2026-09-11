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
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { FunctionsHttpError } from "@supabase/supabase-js";
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

/*
  ── THE PLAN THE IMPORT COULD NOT READ ────────────────────────────────────────

  Karma's membership label is free text, and some of it names no plan at all. The CRM import then
  stored its `single` / `annual` defaults, which are indistinguishable from real answers — so a
  link built from them charges a couple the single price, or bills a monthly member for a whole
  year. The server refuses (PLAN_NOT_CONFIRMED) rather than guessing.

  A REFUSAL IS NOT AN ERROR HERE, IT IS A QUESTION. It has to stay on the card with Karma's own
  words above it, because the operator needs to read them to answer; a red toast that fades while
  they are still reading is how somebody picks the wrong one.
*/
describe("the operator's card when nobody can say what the member pays for", () => {
  const base = {
    memberId: "m-1",
    memberName: "Brenda Colefax",
    switchExpiresAt: null,
    nextRenewal: "2026-09-20",
    status: "active",
    billingSource: "legacy",
  };

  const refusal = () =>
    new FunctionsHttpError(
      new Response(
        JSON.stringify({
          error:
            "Brenda Colefax: the import could not tell which plan they are on or how often they " +
            'pay, so there is no price to charge. Karma\'s record says "FOC — Ayuntamiento". ' +
            "Confirm the plan here and the link will be built from it — do not send an ordinary " +
            "payment link, which would leave them in the Santander export as well.",
          code: "PLAN_NOT_CONFIRMED",
          missing: ["plan", "frequency"],
          legacyLabel: "FOC — Ayuntamiento",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

  const invokeMock = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    return supabase.functions.invoke as ReturnType<typeof vi.fn>;
  };

  it("asks the question on the card, quoting Karma, instead of a toast that fades", async () => {
    (await invokeMock()).mockResolvedValue({ data: null, error: refusal() });
    wrap(<MoveToStripeCard {...base} />);

    fireEvent.click(screen.getByTestId("move-to-stripe-send"));

    const block = await screen.findByTestId("switch-plan-unconfirmed");
    expect(block.textContent).toContain("FOC — Ayuntamiento");
    const { toast } = await import("sonner");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("will not send anything until both halves are answered", async () => {
    (await invokeMock()).mockResolvedValue({ data: null, error: refusal() });
    wrap(<MoveToStripeCard {...base} />);
    fireEvent.click(screen.getByTestId("move-to-stripe-send"));
    await screen.findByTestId("switch-plan-unconfirmed");

    const confirm = screen.getByTestId("switch-plan-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // The plan alone is not enough: the frequency is what decides one month or one year.
    fireEvent.click(screen.getByRole("radio", { name: "Couple" }));
    expect((screen.getByTestId("switch-plan-confirm") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Every month" }));
    expect((screen.getByTestId("switch-plan-confirm") as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends exactly what the operator chose, and nothing it made up", async () => {
    const invoke = await invokeMock();
    invoke.mockResolvedValue({ data: null, error: refusal() });
    wrap(<MoveToStripeCard {...base} />);
    fireEvent.click(screen.getByTestId("move-to-stripe-send"));
    await screen.findByTestId("switch-plan-unconfirmed");

    fireEvent.click(screen.getByRole("radio", { name: "Couple" }));
    fireEvent.click(screen.getByRole("radio", { name: "Once a year" }));

    invoke.mockResolvedValue({
      data: { url: "https://checkout.stripe.com/c/pay/cs_test_2", delivery: [] },
      error: null,
    });
    fireEvent.click(screen.getByTestId("switch-plan-confirm"));

    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("send-payment-link", {
        body: {
          mode: "legacy_switch",
          memberId: "m-1",
          confirmPlan: { membershipType: "couple", billingFrequency: "annual" },
        },
      }),
    );
    // And the first attempt sent no plan at all — the server reads it for itself whenever it can.
    expect(invoke.mock.calls[0][1]).toEqual({ body: { mode: "legacy_switch", memberId: "m-1" } });
  });

  it("puts the question away once a link exists", async () => {
    const invoke = await invokeMock();
    invoke.mockResolvedValue({ data: null, error: refusal() });
    wrap(<MoveToStripeCard {...base} />);
    fireEvent.click(screen.getByTestId("move-to-stripe-send"));
    await screen.findByTestId("switch-plan-unconfirmed");

    fireEvent.click(screen.getByRole("radio", { name: "Single" }));
    fireEvent.click(screen.getByRole("radio", { name: "Every month" }));
    invoke.mockResolvedValue({
      data: { url: "https://checkout.stripe.com/c/pay/cs_test_3", delivery: [] },
      error: null,
    });
    fireEvent.click(screen.getByTestId("switch-plan-confirm"));

    await screen.findByTestId("switch-link-result");
    expect(screen.queryByTestId("switch-plan-unconfirmed")).toBeNull();
  });

  it("leaves every OTHER refusal as a toast, not as a plan question", async () => {
    (await invokeMock()).mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: "Sync prices to Stripe first", code: "STALE_PRICE" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    });
    wrap(<MoveToStripeCard {...base} />);
    fireEvent.click(screen.getByTestId("move-to-stripe-send"));

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Sync prices to Stripe first"));
    expect(screen.queryByTestId("switch-plan-unconfirmed")).toBeNull();
  });
});
