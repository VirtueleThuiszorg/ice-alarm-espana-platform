/**
 * THE OPERATOR'S ALERT SCREEN QUERIED THE DATABASE 130 TIMES A SECOND, FOREVER.
 *
 * Found by the performance harness, not by reading. Measured on
 * `/call-centre/alerts` with a seeded stub: 2,566 identical `members` requests in
 * 20 seconds, still climbing when the measurement stopped — for as long as an
 * operator had the screen open, which is the whole shift, on the one screen that
 * has to be responsive when a pendant is pressed.
 *
 * ── THE MECHANISM ───────────────────────────────────────────────────────────
 *
 * `useSOSTakeover` derived `pendingAlerts` with a `.filter()` on every render, so
 * the array had a NEW IDENTITY every time even when the alerts were unchanged.
 * `SOSAlertBar` had `useEffect(..., [pendingAlerts])`, so:
 *
 *     render -> effect runs -> fetch member names -> setMemberNames({...})
 *            -> re-render -> new pendingAlerts array -> effect runs -> ...
 *
 * A closed loop with a network call in it. Nothing about it is visible in review:
 * every line is ordinary, the dependency array is present and looks correct, and
 * the screen renders exactly right.
 *
 * ── WHY IT HID ──────────────────────────────────────────────────────────────
 *
 * The perf harness counted queries when ANIMATIONS finished, which caught a
 * partial waterfall — 17, then 28, then 36 on three runs of identical code. That
 * looked like harness noise. It was the loop, sampled at three arbitrary moments.
 *
 * ── WHAT IS ASSERTED ────────────────────────────────────────────────────────
 *
 * Both halves of the fix, because either alone would let it back:
 *
 *   1. the CONSUMER cannot loop even when handed a fresh array every render
 *      (the effects are keyed by a string of ids, compared by value)
 *   2. the SOURCE memoises the derivations, so no other consumer inherits it
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../helpers/stripComments";

const ROOT = process.cwd();

/** Every table read, in order, so a loop shows up as a long run of one name. */
let reads: string[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      reads.push(table);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "order", "limit", "eq"]) chain[m] = () => chain;
      // `.in()` is the terminal await in both effects under test.
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      return chain;
    },
    channel: () => {
      const ch: Record<string, unknown> = {};
      ch.on = () => ch;
      ch.subscribe = () => ch;
      return ch;
    },
    removeChannel: () => {},
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => () => {},
}));

/*
  THE HOOK IS MADE AS HOSTILE AS IT USED TO BE, on purpose.

  It returns a BRAND NEW ARRAY on every call — exactly the unmemoised behaviour
  that caused the loop. If the consumer is keyed on the array's identity the
  effects re-run on every render and the read count runs away; if it is keyed on
  the ids by value, one render is one fetch no matter how many times it renders.

  So this test fails if the fix is removed from EITHER side, which is the point.
*/
const ALERTS = [
  { id: "alert-1", member_id: "member-1", received_at: new Date().toISOString(), alert_type: "sos_button" },
  { id: "alert-2", member_id: "member-2", received_at: new Date().toISOString(), alert_type: "fall_detected" },
];

vi.mock("@/hooks/useSOSTakeover", () => ({
  useSOSTakeover: () => ({
    activeAlert: null,
    pendingAlerts: ALERTS.map((a) => ({ ...a })),
    isTakeoverActive: false,
    loading: false,
    acceptAlert: async () => true,
    resolveAlert: async () => true,
  }),
}));

beforeEach(() => {
  reads = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the SOS alert bar does not loop on the database", () => {
  it("reads members ONCE, even when handed a new array on every render", async () => {
    const { SOSAlertBar } = await import("@/components/call-centre/sos/SOSAlertBar");
    const { rerender } = render(<SOSAlertBar />);

    // Twenty forced re-renders. Under the defect each one issued another fetch,
    // and each fetch's setState caused another render on top of these.
    for (let i = 0; i < 20; i += 1) rerender(<SOSAlertBar />);
    await waitFor(() => expect(reads.length).toBeGreaterThan(0));

    const memberReads = reads.filter((t) => t === "members");
    expect(
      memberReads.length,
      `members was read ${memberReads.length} times across 21 renders — the loop is back`,
    ).toBe(1);
  });

  it("reads the Isabella notes once too — the same shape, the same hazard", async () => {
    const { SOSAlertBar } = await import("@/components/call-centre/sos/SOSAlertBar");
    const { rerender } = render(<SOSAlertBar />);
    for (let i = 0; i < 20; i += 1) rerender(<SOSAlertBar />);
    await waitFor(() => expect(reads.length).toBeGreaterThan(0));

    expect(reads.filter((t) => t === "isabella_assessment_notes").length).toBe(1);
  });

  it("issues no read at all when there is nothing pending", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/useSOSTakeover", () => ({
      useSOSTakeover: () => ({
        activeAlert: null,
        pendingAlerts: [],
        isTakeoverActive: false,
        loading: false,
        acceptAlert: async () => true,
        resolveAlert: async () => true,
      }),
    }));
    const { SOSAlertBar } = await import("@/components/call-centre/sos/SOSAlertBar");
    const { rerender } = render(<SOSAlertBar />);
    for (let i = 0; i < 5; i += 1) rerender(<SOSAlertBar />);
    expect(reads).toEqual([]);
    vi.doUnmock("@/hooks/useSOSTakeover");
  });
});

describe("useSOSTakeover hands out a STABLE array", () => {
  const SOURCE = stripComments(readFileSync(join(ROOT, "src/hooks/useSOSTakeover.ts"), "utf8"));

  it("memoises both derivations, so no consumer inherits a fresh identity", () => {
    // The root cause. Keyed on exactly the inputs each derivation is a pure
    // function of, so the value is identical and only the identity is stabilised.
    expect(SOURCE).toMatch(
      /const activeAlert = useMemo\(\s*\(\)\s*=>\s*deriveActiveAlert\(alerts, staffId\),\s*\[alerts, staffId\]\s*\)/,
    );
    expect(SOURCE).toMatch(
      /const pendingAlerts = useMemo\(\s*\(\)\s*=>\s*derivePendingAlerts\(alerts\),\s*\[alerts\]\s*\)/,
    );
  });

  it("does not re-derive them outside the memo, which would undo it", () => {
    // Matches a CALL — `derivePendingAlerts(` — not the name. The first version
    // matched the continuation lines of the multi-line import and failed on them,
    // which is the same shape of mistake this file's comments keep warning about.
    const bare = SOURCE.split("\n").filter(
      (l) => /derive(Active|Pending)\w*\(/.test(l) && !l.includes("useMemo"),
    );
    expect(bare, `derivation called outside useMemo: ${bare.join(" | ")}`).toEqual([]);
  });
});

describe("the consumer's effects are keyed by VALUE", () => {
  const SOURCE = stripComments(
    readFileSync(join(ROOT, "src/components/call-centre/sos/SOSAlertBar.tsx"), "utf8"),
  );

  it("no effect depends on the pendingAlerts array itself for a FETCH", () => {
    // The alarm-timer effect may depend on the array — it reads it and sets no
    // state, so it cannot loop. The two that FETCH must be keyed by id string.
    expect(SOURCE).toContain("}, [memberIdKey]);");
    expect(SOURCE).toContain("}, [alertIdKey]);");
  });

  it("builds those keys from the ids, sorted, so order alone is not a change", () => {
    expect(SOURCE).toMatch(/const memberIdKey = pendingAlerts[\s\S]{0,120}?\.sort\(\)[\s\S]{0,20}?\.join\(","\)/);
    expect(SOURCE).toMatch(/const alertIdKey = pendingAlerts[\s\S]{0,120}?\.sort\(\)[\s\S]{0,20}?\.join\(","\)/);
  });
});
