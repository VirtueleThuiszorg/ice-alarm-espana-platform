/**
 * THE NUMBER ON THE BADGE — what it counts, and what it must not.
 *
 * `useMemberMissingInfo` answers "what is missing from this member's file" for three surfaces:
 * the staff record, the staff members list, and (since the dashboard header landed) the member's
 * own "Complete my details" badge. Two things were wrong with the number the MEMBER saw, and
 * both were wrong in the direction that costs trust in the count.
 *
 * ── 1. IT COUNTED WHAT THE MEMBER CANNOT SUPPLY ─────────────────────────────
 *
 * `count` is every missing required item, including the three with `memberCanSupply: false` — a
 * pendant's IMEI, a pendant tested with an operator, an active subscription. The dialog behind
 * the badge correctly offers none of them (`requestableFields` is the definition, and the
 * emailed update link has used it all along). So a member on a pendant plan whose pendant had
 * not yet been assigned saw "Complete my details 2" and opened a dialog with nothing in it:
 * exactly the dead-control pattern the header was written to remove, reintroduced by the badge.
 *
 * A member cannot activate their own subscription — golden rule 4 says the payment webhook does
 * that and nothing else — so a badge asking them to is not merely useless, it is a promise the
 * product cannot keep.
 *
 * ── 2. IT COULD NOT TELL AN EMPTY TABLE FROM AN UNREAD ONE ──────────────────
 *
 * `missingRequiredFields` deliberately skips a group whose source read `null`: an unread table is
 * "not answered", not "empty", or every badge would flash a full house of gaps mid-fetch. But
 * `readOne` returned `null` BOTH when the read failed AND when `maybeSingle()` found no row — so
 * a member with no `medical_information` row at all had their six medical requirements skipped.
 * The members-list hook in the same file gets this right (`asNull(medical, … ?? {})` — only a
 * failed BATCH is null), so the two hooks disagreed about the same member, which is the one
 * thing that file's own header promises cannot happen.
 *
 * The direction matters: a member who has never filled in their medical details is precisely the
 * member the badge exists to chase, and they were the one member it stayed quiet for.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

import {
  MEMBER_REQUIRED_FIELDS,
  missingRequiredFields,
  requestableFields,
} from "@/lib/memberRequiredFields";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── the reads, as doubles ───────────────────────────────────────────────────
interface TableAnswer {
  data: unknown;
  error: unknown;
}
let answers: Record<string, TableAnswer> = {};

const answer = (table: string): TableAnswer => answers[table] ?? { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const resolve = () => Promise.resolve(answer(table));
      chain.select = () => chain;
      chain.eq = () => ({ ...chain, then: undefined, ...{} });
      // `emergency_contacts` is read as a LIST (no maybeSingle), so `.eq()` itself must be
      // awaitable. Everything else ends in maybeSingle.
      chain.eq = () => {
        const tail: Record<string, unknown> = {
          maybeSingle: resolve,
          order: () => tail,
          limit: () => tail,
          then: (onFulfilled: (v: TableAnswer) => unknown) => resolve().then(onFulfilled),
        };
        return tail;
      };
      chain.in = () => ({
        then: (onFulfilled: (v: TableAnswer) => unknown) => resolve().then(onFulfilled),
      });
      return chain;
    },
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}));

const MEMBER_ID = "mem-1";

/** A member whose own columns are all filled in, so only the other reads move the count. */
const FULL_MEMBER = {
  id: MEMBER_ID,
  first_name: "Ana",
  last_name: "Ruiz",
  date_of_birth: "1943-04-11",
  nie_dni: "X1234567L",
  address_line_1: "Calle Mayor 1",
  city: "Almería",
  province: "Almería",
  postal_code: "04001",
  phone: "+34600111222",
  email: "ana@example.test",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function missingInfo() {
  const { useMemberMissingInfo } = await import("@/hooks/useMemberMissingInfo");
  const { result } = renderHook(() => useMemberMissingInfo(MEMBER_ID), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data!;
}

beforeEach(() => {
  answers = {};
  vi.resetModules();
});
afterEach(cleanup);

// ── 1. the badge counts only what the member can actually supply ────────────

describe("the count a MEMBER is shown", () => {
  it("excludes the three items only we can do — the badge's dialog offers none of them", () => {
    /*
      Asserted over the REAL definition rather than a hard-coded three, so a future required
      field that we (not the member) have to supply is covered without anybody remembering.
    */
    const ours = MEMBER_REQUIRED_FIELDS.filter((f) => !f.memberCanSupply);
    expect(ours.length).toBeGreaterThan(0);

    const missing = missingRequiredFields({
      member: FULL_MEMBER,
      medical: {},
      contacts: [{ phone: "+34600000000" }],
      device: null,
      deviceTestedAt: null,
      subscriptionStatus: "pending",
      hasPendant: true,
    });

    // Every one of them IS missing for this member, so the filter is doing real work here.
    for (const field of ours) expect(missing.map((f) => f.key)).toContain(field.key);
    for (const field of ours) expect(requestableFields(missing).map((f) => f.key)).not.toContain(field.key);
  });

  it("is zero — no badge — when the ONLY gaps are ours to close", async () => {
    answers = {
      members: { data: FULL_MEMBER, error: null },
      medical_information: { data: Object.fromEntries(
        MEMBER_REQUIRED_FIELDS.filter((f) => f.group === "medical").map((f) => [f.key, "known"]),
      ), error: null },
      emergency_contacts: { data: [{ phone: "+34600000000" }], error: null },
      devices: { data: null, error: null },
      member_monitoring_readiness: { data: { device_tested_at: null }, error: null },
      subscriptions: { data: { status: "pending", has_pendant: true }, error: null },
    };

    const info = await missingInfo();

    // The record IS incomplete — an unassigned pendant, an untested one, no active subscription.
    expect(info.count).toBeGreaterThan(0);
    // But there is nothing to ask the member for, so their badge must not appear.
    expect(info.memberCanFill).toHaveLength(0);
  });

  it("counts the member's own gaps, and only those", async () => {
    answers = {
      members: { data: { ...FULL_MEMBER, phone: null }, error: null },
      medical_information: { data: {}, error: null },
      emergency_contacts: { data: [], error: null },
      devices: { data: null, error: null },
      member_monitoring_readiness: { data: { device_tested_at: null }, error: null },
      subscriptions: { data: { status: "pending", has_pendant: true }, error: null },
    };

    const info = await missingInfo();
    const keys = info.memberCanFill.map((f) => f.key);

    expect(keys).toContain("phone");
    expect(keys).toContain("emergency_contact");
    expect(keys).toContain("blood_type");
    expect(keys).not.toContain("device_imei");
    expect(keys).not.toContain("device_tested");
    expect(keys).not.toContain("active_subscription");
  });

  it("the dashboard reads memberCanFill, not the full count", () => {
    const src = read("src/pages/client/ClientDashboard.tsx");
    expect(src).toMatch(/memberCanFill/);
    // The full count is the STAFF number; a member's badge showing it is the defect.
    expect(src).not.toMatch(/missingInfo\?\.count/);
  });
});

// ── 2. an empty table is a gap; an unread one is not ───────────────────────

describe("no row at all versus no answer at all", () => {
  it("counts the six medical requirements when the member has NO medical row", async () => {
    answers = {
      members: { data: FULL_MEMBER, error: null },
      // What PostgREST returns for `maybeSingle()` when the member has never had one.
      medical_information: { data: null, error: null },
      emergency_contacts: { data: [{ phone: "+34600000000" }], error: null },
      devices: { data: null, error: null },
      member_monitoring_readiness: { data: { device_tested_at: null }, error: null },
      subscriptions: { data: { status: "active", has_pendant: false }, error: null },
    };

    const info = await missingInfo();
    const medical = MEMBER_REQUIRED_FIELDS.filter((f) => f.group === "medical");
    expect(medical.length).toBeGreaterThan(0);
    for (const field of medical) {
      expect(info.memberCanFill.map((f) => f.key)).toContain(field.key);
    }
  });

  it("counts NOTHING medical when the medical read FAILED — a badge must not invent gaps", async () => {
    answers = {
      members: { data: FULL_MEMBER, error: null },
      medical_information: { data: null, error: { message: "permission denied" } },
      emergency_contacts: { data: [{ phone: "+34600000000" }], error: null },
      devices: { data: null, error: null },
      member_monitoring_readiness: { data: { device_tested_at: null }, error: null },
      subscriptions: { data: { status: "active", has_pendant: false }, error: null },
    };

    const info = await missingInfo();
    for (const field of MEMBER_REQUIRED_FIELDS.filter((f) => f.group === "medical")) {
      expect(info.memberCanFill.map((f) => f.key)).not.toContain(field.key);
    }
  });

  it("counts no contact gap when the contacts read FAILED, and one when it returned none", async () => {
    const base = {
      members: { data: FULL_MEMBER, error: null },
      medical_information: { data: null, error: { message: "denied" } },
      devices: { data: null, error: null },
      member_monitoring_readiness: { data: { device_tested_at: null }, error: null },
      subscriptions: { data: { status: "active", has_pendant: false }, error: null },
    };

    answers = { ...base, emergency_contacts: { data: null, error: { message: "denied" } } };
    expect((await missingInfo()).memberCanFill.map((f) => f.key)).not.toContain(
      "emergency_contact",
    );

    cleanup();
    vi.resetModules();
    answers = { ...base, emergency_contacts: { data: [], error: null } };
    expect((await missingInfo()).memberCanFill.map((f) => f.key)).toContain("emergency_contact");
  });

  it("agrees with the members-LIST hook about the same member", async () => {
    /*
      The two hooks live in one file whose header promises they cannot disagree. They did: the
      list treats an absent medical row as an empty one and the single-member read treated it as
      unread. Same input, same number, asserted directly rather than by reading the code.
    */
    const memberRow = { ...FULL_MEMBER };
    const listCount = missingRequiredFields({
      member: memberRow,
      medical: {}, // what `useMembersMissingCounts` passes when the batch found no row
      contacts: [],
      device: null,
      deviceTestedAt: null,
      subscriptionStatus: "active",
      hasPendant: false,
    }).length;

    answers = {
      members: { data: memberRow, error: null },
      medical_information: { data: null, error: null },
      emergency_contacts: { data: [], error: null },
      devices: { data: null, error: null },
      member_monitoring_readiness: { data: { device_tested_at: null }, error: null },
      subscriptions: { data: { status: "active", has_pendant: false }, error: null },
    };

    expect((await missingInfo()).count).toBe(listCount);
  });
});
