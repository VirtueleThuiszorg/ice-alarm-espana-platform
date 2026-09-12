// @vitest-environment node
//
// ═══ DID THE ASYNC EVENTS REACH US — AND THE TRAP IN ASKING ONLY ONE SIDE ═════
//
// Lee's item 3: "check the stripe_webhook / payment logs for the test member's session ids and
// report whether async events arrived at our destination at all. If they did not, say plainly
// 'destination not subscribed or wrong environment' — do not fake a pass."
//
// The obvious implementation reads `webhook_events`, finds no
// `checkout.session.async_payment_succeeded`, and reports a broken destination. That is wrong in
// the ordinary case and expensively so: these events only exist for a Checkout Session somebody
// COMPLETED IN A BROWSER, and until one has been completed there is nothing to have arrived.
// Reporting a fault then sends somebody into the Stripe dashboard after a defect that is not
// there — and worse, teaches them that this check cries wolf.
//
// So the verdict is a function of BOTH sides, and only one of the four combinations is a failure.
// Each branch is asserted here, including the one that must NOT accuse anybody.
import { describe, it, expect } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MOD = "../../scripts/stripe/platform-check.mjs";
const { verdict, readProcessed, readSent, ASYNC_EVENT_TYPES, NOT_SUBSCRIBED } = (await import(
  /* @vite-ignore */ MOD
)) as any;

describe("what the two sides together mean", () => {
  it("PASSES when Stripe sent some and we processed some", () => {
    const v = verdict({ sent: ["evt_1", "evt_2"], processed: ["evt_1"], haveDb: true });
    expect(v.state).toBe("pass");
    expect(v.detail).toMatch(/evt_1/);
  });

  // THE ONE REAL FAULT, and the one sentence Lee asked for.
  it("FAILS with Lee's exact words when Stripe sent some and we processed none", () => {
    const v = verdict({ sent: ["evt_1", "evt_2"], processed: [], haveDb: true });
    expect(v.state).toBe("fail");
    expect(v.headline).toBe(NOT_SUBSCRIBED);
    expect(v.headline).toBe("destination not subscribed or wrong environment");
    // And it says what that costs, not just that it happened.
    expect(v.detail).toMatch(/switch_pending/);
    expect(v.detail).toMatch(/nobody collects from them/);
  });

  /* THE BRANCH THAT MUST NOT ACCUSE ANYBODY. Nothing was sent, so processing nothing is correct
     behaviour — and this is the state the check will be in every time it runs until somebody
     completes a session in a browser. Calling it a fault here would make the check useless by
     the third run. */
  it("is UNPROVEN, never a fault, when Stripe has sent nothing at all", () => {
    const v = verdict({ sent: [], processed: [], haveDb: true });
    expect(v.state).toBe("unproven");
    expect(v.headline).not.toBe(NOT_SUBSCRIBED);
    expect(v.detail).toMatch(/COMPLETED IN A BROWSER/);
    expect(v.detail).toMatch(/no script can complete one/);
  });

  /* NOT HAVING ASKED IS NOT THE SAME AS HAVING BEEN TOLD NO — and it is emphatically not a pass.
     Without the service key the ledger was never read, so the honest answer is "unknown". */
  it("is UNPROVEN when the platform's ledger was never read", () => {
    const v = verdict({ sent: ["evt_1"], processed: [], haveDb: false });
    expect(v.state).toBe("unproven");
    expect(v.headline).not.toBe(NOT_SUBSCRIBED);
    expect(v.detail).toMatch(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY were not supplied/);
    expect(v.detail).toMatch(/not the same as knowing they did not/);
  });

  it("never reports a pass without the ledger, however many events Stripe sent", () => {
    for (const sent of [[], ["evt_1"], ["evt_1", "evt_2", "evt_3"]]) {
      expect(verdict({ sent, processed: [], haveDb: false }).state).not.toBe("pass");
    }
  });
});

describe("the two reads", () => {
  it("asks the ledger only for the async event types, newest first", async () => {
    let seen = "";
    const fake = async (url: string) => {
      seen = url;
      return { ok: true, json: async () => [{ event_id: "evt_1" }] };
    };
    const rows = await readProcessed(fake as any, { url: "https://x.supabase.co/", key: "k" });
    expect(rows).toHaveLength(1);
    expect(seen).toContain("/rest/v1/webhook_events");
    for (const t of ASYNC_EVENT_TYPES) expect(seen).toContain(t);
    expect(seen).toContain("order=processed_at.desc");
    // A trailing slash on the project URL must not produce `//rest/v1`.
    expect(seen).not.toContain("//rest");
  });

  /* NO MEMBER DATA. The ledger holds event ids and types; this query must not reach for a name,
     an email or a member id, because a CI log is not the place for any of them. */
  it("selects no column that could carry member data", async () => {
    let seen = "";
    const fake = async (url: string) => {
      seen = url;
      return { ok: true, json: async () => [] };
    };
    await readProcessed(fake as any, { url: "https://x.supabase.co", key: "k" });
    const select = decodeURIComponent(seen.split("select=")[1]?.split("&")[0] ?? "");
    expect(select.split(",").sort()).toEqual(["event_id", "event_type", "processed_at"]);
  });

  it("throws with the status when the ledger refuses, rather than reporting an empty ledger", async () => {
    const fake = async () => ({ ok: false, status: 401, text: async () => "no key" });
    await expect(
      readProcessed(fake as any, { url: "https://x.supabase.co", key: "bad" }),
    ).rejects.toThrow(/401/);
  });

  it("asks Stripe for both event types", async () => {
    let seen = "";
    const api = async (_m: string, path: string) => {
      seen = path;
      return { data: [{ id: "evt_1" }] };
    };
    const events = await readSent(api as any);
    expect(events).toHaveLength(1);
    for (const t of ASYNC_EVENT_TYPES) expect(seen).toContain(encodeURIComponent(t));
  });

  it("treats a Stripe answer with no data as no events, not as a crash", async () => {
    const api = async () => ({});
    expect(await readSent(api as any)).toEqual([]);
  });
});
