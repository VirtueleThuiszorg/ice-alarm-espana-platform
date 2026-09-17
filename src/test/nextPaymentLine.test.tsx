/**
 * "NEXT PAYMENT 14 OCT" — and the eleven times it must say nothing.
 *
 * The load-bearing half of this component is the silence. A date under the member's name is a
 * promise, and the conditions it must NOT appear in are the ones where the page would otherwise
 * contradict itself six inches further down: `in_arrears` is a failed payment, `legacy_billing`
 * has no subscription row to take a date from, `awaiting_payment` has taken nothing yet.
 *
 * So the negative cases are driven off `STATUS_CONDITION` and `MEMBERSHIP_CONDITIONS` rather
 * than a list typed out here. A new `subscription_status` value, or a new membership condition,
 * is then a FAILING TEST in this file rather than a blank space on the dashboard that nobody
 * notices for a month.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { es } from "date-fns/locale";
import { NextPaymentLine } from "@/components/client/NextPaymentLine";
import { STATUS_CONDITION, MEMBERSHIP_CONDITIONS } from "@/lib/membershipCondition";
import type { SubscriptionInfo } from "@/hooks/useMemberProfile";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Interpolates, and returns the default — the component calls t(key, { defaultValue, date }). */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const text = String(opts?.defaultValue ?? key);
      return text.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(opts?.[n] ?? `{{${n}}}`));
    },
    i18n: { language: "en" },
  }),
}));

const ROW: SubscriptionInfo = {
  id: "s1",
  member_id: "m1",
  plan_type: "single",
  billing_frequency: "monthly",
  amount: 24.95,
  status: "active",
  start_date: "2026-01-01",
  renewal_date: "2026-10-14T00:00:00.000Z",
  has_pendant: true,
  payment_method: "card",
  payer_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const row = (over: Partial<SubscriptionInfo> = {}): SubscriptionInfo => ({ ...ROW, ...over });

afterEach(() => cleanup());

describe("the one case it speaks", () => {
  it("renders the renewal date for an active subscription", () => {
    render(<NextPaymentLine subscription={row()} loading={false} />);
    expect(screen.getByTestId("next-payment-line")).toHaveTextContent("Next payment 14 Oct 2026");
  });

  it("formats in the locale it is handed, not in en-GB", () => {
    // The header's other date is formatted with the same locale object. If this component
    // decided for itself, the two dates in one sentence could disagree about their language.
    render(<NextPaymentLine subscription={row()} loading={false} dateLocale={es} />);
    expect(screen.getByTestId("next-payment-line")).toHaveTextContent(/oct/i);
    expect(screen.getByTestId("next-payment-line")).not.toHaveTextContent("Oct 2026");
  });
});

describe("who is being charged", () => {
  it("payer_id null — the member pays, so it is addressed to them", () => {
    render(<NextPaymentLine subscription={row({ payer_id: null })} loading={false} />);
    const line = screen.getByTestId("next-payment-line");
    expect(line).toHaveTextContent("Next payment 14 Oct 2026");
    expect(line).not.toHaveTextContent(/paid for you/i);
  });

  it("payer_id set — somebody else pays, and the line says so without naming them", () => {
    render(<NextPaymentLine subscription={row({ payer_id: "p1" })} loading={false} />);
    const line = screen.getByTestId("next-payment-line");
    expect(line).toHaveTextContent("Next payment 14 Oct 2026 · paid for you");
    // RLS means we cannot read the payer, so nothing here may claim to know who they are.
    expect(line).not.toHaveTextContent("p1");
  });
});

describe("the silences", () => {
  /*
    EVERY OTHER CONDITION, ENUMERATED BY THE MODULE THAT OWNS THEM. `STATUS_CONDITION` is a
    Record over the subscription_status enum, so this loop widens itself when the enum does.
  */
  const nonActiveStatuses = (
    Object.keys(STATUS_CONDITION) as (keyof typeof STATUS_CONDITION)[]
  ).filter((s) => STATUS_CONDITION[s] !== "active");

  it("covers every non-active status the enum has — the loop is not empty", () => {
    expect(nonActiveStatuses.length).toBeGreaterThanOrEqual(6);
  });

  it.each(nonActiveStatuses)("renders nothing for status %s", (status) => {
    const { container } = render(
      <NextPaymentLine subscription={row({ status })} loading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no subscription row at all (never_joined)", () => {
    const { container } = render(<NextPaymentLine subscription={null} loading={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the status is null (unknown, not never_joined)", () => {
    const { container } = render(
      <NextPaymentLine subscription={row({ status: null })} loading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the subscription is undefined — a read that has not answered", () => {
    const { container } = render(<NextPaymentLine subscription={undefined} loading={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when active but renewal_date is null", () => {
    const { container } = render(
      <NextPaymentLine subscription={row({ renewal_date: null })} loading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing rather than 1 Jan 1970 for an unparseable renewal_date", () => {
    const { container } = render(
      <NextPaymentLine subscription={row({ renewal_date: "not a date" })} loading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  /*
    THE CONDITIONS THE CHECKLIST OWNS, named from its own table so that adding a condition
    without deciding about this line fails here. `legacy_billing` and `switching_to_stripe` are
    reached from the MEMBER row rather than the subscription, and this component is handed only
    a subscription — so for both of them it is handed null, and must stay quiet.
  */
  const nonActiveConditions = MEMBERSHIP_CONDITIONS
    .map((c) => c.condition)
    .filter((c) => c !== "active");

  it("every non-active membership condition is a silence, and there are several", () => {
    expect(nonActiveConditions.length).toBeGreaterThanOrEqual(8);
    expect(nonActiveConditions).toContain("legacy_billing");
    expect(nonActiveConditions).toContain("switching_to_stripe");
    expect(nonActiveConditions).toContain("in_arrears");
  });
});

describe("loading", () => {
  it("renders nothing while the query is in flight", () => {
    const { container } = render(<NextPaymentLine subscription={row()} loading={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never renders an em dash — a placeholder here reads as a fact about the account", () => {
    const { container } = render(<NextPaymentLine subscription={row()} loading={true} />);
    expect(container.textContent ?? "").not.toContain("—");
  });
});

describe("it is a status, not an alarm", () => {
  it("carries no destructive or alert styling", () => {
    const { container } = render(<NextPaymentLine subscription={row()} loading={false} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/text-destructive|bg-destructive|border-destructive/);
    expect(html).not.toMatch(/\balert-/);
    // R2: brand red belongs to the page's one action, and this is not an action.
    expect(html).not.toMatch(/\btext-primary\b|\bbg-primary\b/);
  });
});

describe("where the dashboard mounts it", () => {
  const dash = readFileSync(
    join(process.cwd(), "src/pages/client/ClientDashboard.tsx"),
    "utf8",
  );

  /** The value of one JSX prop on PageHeader, brace-matched. */
  function propBlock(name: "subtitle" | "action"): string {
    const start = dash.indexOf(`${name}={`);
    expect(start, `PageHeader has no ${name} prop`).toBeGreaterThan(-1);
    let depth = 0;
    let i = dash.indexOf("{", start);
    for (; i < dash.length; i++) {
      if (dash[i] === "{") depth++;
      else if (dash[i] === "}" && --depth === 0) break;
    }
    return dash.slice(start, i + 1);
  }

  it("is in the SUBTITLE, beside the current date", () => {
    expect(propBlock("subtitle")).toMatch(/<NextPaymentLine/);
  });

  it("is NOT in the action slot, which already carries four controls", () => {
    expect(propBlock("action")).not.toMatch(/<NextPaymentLine/);
  });

  it("is handed the page's own date locale, not left to default", () => {
    expect(propBlock("subtitle")).toMatch(/dateLocale=\{dateLocale\}/);
  });

  it("is told when the subscription query is still loading", () => {
    expect(propBlock("subtitle")).toMatch(/loading=\{subscriptionsLoading/);
  });
});
