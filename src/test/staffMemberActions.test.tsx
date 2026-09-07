/**
 * WP7 — staff control of the member record, and the live defect it replaces.
 *
 * WHAT WAS THERE. `SubscriptionTab.updateStatus` wrote `subscriptions.status` STRAIGHT FROM THE
 * BROWSER for pause, resume and cancel — and for Stripe it called nothing at all. Its own
 * comment said so: *"Stripe cancellation would be handled via Stripe Dashboard or API if
 * needed."*
 *
 * So pressing Cancel left the database saying `cancelled` while STRIPE KEPT CHARGING THE
 * MEMBER'S CARD. Pressing Resume wrote `status = 'active'` from the client, which golden rule 4
 * reserves for the payment webhook. Neither was attributed and neither had a reason.
 *
 * The assertions below are therefore mostly about what the client MUST NOT do.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  MEMBER_ACTIONS,
  buildMemberActionLog,
  memberActionSpec,
} from "@/lib/memberActions";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let inserted: { table: string; row: Record<string, unknown> }[] = [];
let updated: { table: string; row: Record<string, unknown> }[] = [];
let invoked: { fn: string; body: Record<string, unknown> }[] = [];
let insertError: unknown = null;
let invokeError: unknown = null;
let staffRow: Record<string, unknown> | null = { id: "s1", first_name: "Marta", last_name: "Ruiz" };

function table(name: string) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.maybeSingle = () => Promise.resolve({ data: name === "staff" ? staffRow : null, error: null });
  c.single = () => Promise.resolve({ data: name === "staff" ? staffRow : null, error: null });
  c.insert = (row: Record<string, unknown>) => {
    inserted.push({ table: name, row });
    return Promise.resolve({ error: insertError });
  };
  c.update = (row: Record<string, unknown>) => {
    updated.push({ table: name, row });
    return { eq: () => Promise.resolve({ error: null }) };
  };
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (name: string) => table(name),
    functions: {
      invoke: (fn: string, opts: { body: Record<string, unknown> }) => {
        invoked.push({ fn, body: opts.body });
        return Promise.resolve({ data: invokeError ? null : { success: true }, error: invokeError });
      },
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

const toasts: { level: string; text: string }[] = [];
vi.mock("sonner", () => ({
  toast: {
    success: (t: string) => toasts.push({ level: "success", text: String(t) }),
    error: (t: string) => toasts.push({ level: "error", text: String(t) }),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: "en" },
  }),
}));

async function renderCard(
  props: { subscriptionId?: string | null; gateway?: "stripe" | "mollie" | null } = {},
) {
  const { MemberActionsCard } = await import(
    "@/components/admin/member-detail/MemberActionsCard"
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemberActionsCard
        memberId="m1"
        /*
          `in`, not `??`. `null ?? "sub1"` is "sub1", so a test passing an explicit null got a
          subscription anyway — and the assertion about a member with no subscription passed
          for the wrong reason until it did not.
        */
        subscriptionId={"subscriptionId" in props ? (props.subscriptionId as string | null) : "sub1"}
        gateway={"gateway" in props ? (props.gateway as "stripe" | "mollie" | null) : "stripe"}
      />
    </QueryClientProvider>,
  );
}

async function act(action: string, reason = "Member called and asked us to.") {
  fireEvent.click(await screen.findByTestId(`member-action-${action}`));
  fireEvent.change(await screen.findByLabelText("Why are you doing this?"), {
    target: { value: reason },
  });
  fireEvent.click(screen.getByTestId("member-action-confirm"));
}

beforeEach(() => {
  inserted = [];
  updated = [];
  invoked = [];
  insertError = null;
  invokeError = null;
  toasts.length = 0;
  staffRow = { id: "s1", first_name: "Marta", last_name: "Ruiz" };
});
afterEach(() => cleanup());

describe("the client never writes subscriptions.status again", () => {
  it("SubscriptionTab has no updateStatus and no write to subscriptions", () => {
    const src = read("src/components/admin/member-detail/SubscriptionTab.tsx");
    expect(src).not.toContain("const updateStatus");
    expect(src).not.toMatch(/from\("subscriptions"\)\s*\n?\s*\.update/);
    expect(src).not.toContain('status: newStatus');
  });

  it("no client file writes a subscription status at all", () => {
    // The sweep, not just the one file: the same three buttons could reappear anywhere.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== "test") walk(p);
        } else if (/\.tsx?$/.test(e.name)) {
          const src = read(p);
          if (/from\("subscriptions"\)[\s\S]{0,200}?\.update\(\s*\{[\s\S]{0,120}?status/.test(src)) {
            offenders.push(p);
          }
        }
      }
    };
    walk("src");
    expect(offenders, "these write subscriptions.status from the client").toEqual([]);
  });

  it("the hook drives the gateway and lets the SERVER mirror the status", async () => {
    await renderCard();
    await act("cancel");
    await waitFor(() => expect(invoked.length).toBe(1));
    expect(invoked[0].fn).toBe("admin-subscription-action");
    expect(invoked[0].body).toEqual({ subscriptionId: "sub1", action: "cancel" });
    // Nothing was written to subscriptions from here.
    expect(updated.filter((u) => u.table === "subscriptions")).toEqual([]);
  });

  it("the gateway call happens BEFORE the audit row", async () => {
    // A log of a cancellation that did not happen is a lie about a member's protection, and
    // the next person to read it would believe them uncovered. `billing.ts` takes the same
    // order for the same reason.
    const src = read("src/hooks/useMemberAction.ts");
    expect(src.indexOf("functions.invoke")).toBeLessThan(src.indexOf('from("activity_logs")'));
  });
});

describe("Mollie is handled honestly rather than pretended at", () => {
  it("a Mollie cancellation uses the Mollie function", async () => {
    await renderCard({ gateway: "mollie" });
    await act("cancel");
    await waitFor(() => expect(invoked.length).toBe(1));
    expect(invoked[0].fn).toBe("cancel-mollie-subscription");
  });

  it("a Mollie PAUSE is refused, and nothing is written", async () => {
    /*
      The old code "paused" a Mollie subscription by writing the DB and leaving Mollie charging.
      `admin-subscription-action` refuses Mollie outright. Refusing is not a lost capability; it
      is a removed trap.
    */
    await renderCard({ gateway: "mollie" });
    await act("pause");
    await waitFor(() => expect(toasts.some((t) => t.level === "error")).toBe(true));
    expect(invoked).toEqual([]);
    expect(inserted).toEqual([]);
  });
});

describe("every action is attributed, with a reason", () => {
  it("writes an activity_logs row the trigger will accept", async () => {
    await renderCard();
    await act("cancel", "Moving into residential care on the 30th.");
    await waitFor(() => expect(inserted.length).toBe(1));
    const row = inserted[0].row;
    expect(inserted[0].table).toBe("activity_logs");
    // enforce_member_action_attribution() demands exactly these three, plus the reason.
    expect(row.member_action).toBe("cancel");
    expect(row.staff_id).toBe("s1");
    expect(row.entity_type).toBe("member");
    expect(row.entity_id).toBe("m1");
    expect(row.reason).toBe("Moving into residential care on the 30th.");
  });

  it("trims the reason, because the trigger compares with btrim()", () => {
    const row = buildMemberActionLog({
      staffId: "s1",
      memberId: "m1",
      action: "pause",
      reason: "   away for the summer   ",
      automation: "automated",
    });
    expect(row.reason).toBe("away for the summer");
  });

  it("will not submit without a reason", async () => {
    // The database refuses it too. A form that lets a staff member get as far as a RAISE
    // EXCEPTION has wasted their work and taught them the screen is unreliable.
    await renderCard();
    fireEvent.click(await screen.findByTestId("member-action-cancel"));
    const confirm = await screen.findByTestId("member-action-confirm");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Why are you doing this?"), {
      target: { value: "   " },
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses everything when the user has no staff record — before touching Stripe", async () => {
    // The trigger would refuse the row anyway; refusing here means the gateway call has not
    // happened, so nothing is left half-done.
    staffRow = null;
    await renderCard();
    expect(await screen.findByTestId("member-actions-no-staff")).toBeTruthy();
    for (const spec of MEMBER_ACTIONS) {
      expect(
        (screen.getByTestId(`member-action-${spec.action}`) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
  });

  it("records whether the SYSTEM did it or a person did it in Stripe", () => {
    // Six months later that is the difference between a bug and a workflow.
    expect(
      buildMemberActionLog({
        staffId: "s1", memberId: "m1", action: "cancel", reason: "x", automation: "automated",
      }).new_values.performed,
    ).toBe("by_system_via_stripe");
    expect(
      buildMemberActionLog({
        staffId: "s1", memberId: "m1", action: "renew", reason: "x", automation: "manual_in_stripe",
      }).new_values.performed,
    ).toBe("by_staff_in_stripe");
  });
});

describe("the four actions this system records but does not perform", () => {
  it("says so on the card, not by omission", async () => {
    // An absent button is indistinguishable from a feature nobody built. A button that says
    // what it does and does not do is not.
    await renderCard();
    for (const action of ["renew", "switch_to_couple", "switch_to_single", "add_pendant"]) {
      expect(await screen.findByTestId(`member-action-manual-${action}`)).toBeTruthy();
    }
    for (const action of ["pause", "cancel"]) {
      expect(screen.queryByTestId(`member-action-manual-${action}`)).toBeNull();
    }
  });

  it("records without calling any gateway, and says the billing was not touched", async () => {
    await renderCard();
    await act("renew", "Card taken over the phone, receipt emailed.");
    await waitFor(() => expect(inserted.length).toBe(1));
    expect(invoked).toEqual([]);
    expect(inserted[0].row.member_action).toBe("renew");
  });

  it("is offered even when the member has no subscription row", async () => {
    // A renewal being recorded for somebody whose subscription lapsed is exactly when the audit
    // trail matters. Only the AUTOMATED actions need a subscription to act on.
    await renderCard({ subscriptionId: null });
    expect(
      (await screen.findByTestId("member-action-renew") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((screen.getByTestId("member-action-cancel") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("a change that happened but was not recorded is said out loud", () => {
  it("names it, rather than reporting success", async () => {
    /*
      The one state this feature exists to prevent. Reporting success would leave a real
      cancellation with no owner and no reason — which is the question somebody asks first.
    */
    insertError = { message: "permission denied for table activity_logs" };
    await renderCard();
    await act("cancel");
    await waitFor(() => expect(toasts.some((t) => t.level === "error")).toBe(true));
    const err = toasts.find((t) => t.level === "error")!;
    expect(err.text).toMatch(/made but NOT recorded/i);
  });

  it("a failed gateway call reports that NOTHING changed", async () => {
    invokeError = { message: "Stripe cancel failed: no such subscription" };
    await renderCard();
    await act("cancel");
    await waitFor(() => expect(toasts.some((t) => t.level === "error")).toBe(true));
    expect(toasts.find((t) => t.level === "error")!.text).toMatch(/Nothing was changed/i);
    // And no audit row for something that did not happen.
    expect(inserted).toEqual([]);
  });
});

describe("the specs cover the enum", () => {
  it("every member_action value the migrations create has a spec", () => {
    const dir = join(ROOT, "supabase/migrations");
    const values: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(dir, f), "utf8");
      const created = sql.match(/CREATE TYPE (?:public\.)?member_action AS ENUM\s*\(([^)]*)\)/i);
      if (created) for (const m of created[1].matchAll(/'([^']+)'/g)) values.push(m[1]);
      for (const m of sql.matchAll(
        /ALTER TYPE (?:public\.)?member_action ADD VALUE (?:IF NOT EXISTS )?'([^']+)'/gi,
      )) {
        if (!values.includes(m[1])) values.push(m[1]);
      }
    }
    // Six from `20260907100500`, plus `resume` from the held seed bundle. The count is pinned
    // so a value added without a spec fails here even before the type ratchet sees it.
    expect(values.length).toBe(7);
    for (const v of values) {
      expect(() => memberActionSpec(v as never), `no spec for ${v}`).not.toThrow();
    }
  });

  it("every spec states whether it is destructive — none by omission", () => {
    // Pausing a life-safety subscription looks administrative until you remember what stops
    // working.
    for (const spec of MEMBER_ACTIONS) {
      expect(typeof spec.destructive, `${spec.action} does not say`).toBe("boolean");
    }
    expect(MEMBER_ACTIONS.filter((s) => s.destructive).map((s) => s.action)).toEqual([
      "pause",
      "cancel",
    ]);
  });

  it("the destructive ones warn about the monitoring, not just the money", async () => {
    await renderCard();
    fireEvent.click(await screen.findByTestId("member-action-cancel"));
    const warn = await screen.findByTestId("member-action-destructive-warning");
    expect(warn.textContent).toMatch(/will not reach an operator/i);
  });
});
