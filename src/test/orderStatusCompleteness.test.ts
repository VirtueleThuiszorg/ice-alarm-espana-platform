// @vitest-environment node
//
// `20260228170000_add_missing_order_statuses.sql` added `confirmed` and `awaiting_stock` to the
// `order_status` enum. Three layers above the database never learned, and each failure was
// silent:
//
//   src/integrations/supabase/types.ts   still listed five values, so TypeScript believed the
//                                        other two were impossible
//   useOrderActions.ts                   hand-typed the same five in its parameter
//   OrdersPage.tsx                       hand-listed the same five in its filter, its badge
//                                        switch and its three action blocks
//
// The consequence was not cosmetic. `_shared/post-payment.ts:115` sets an order to
// `awaiting_stock` when it cannot find a free EV-07B to allocate — so THE ONE ORDER THAT NEEDS
// A HUMAN was the one the admin screen could not display, could not filter for, and offered no
// action on. It rendered as a bare grey chip through the badge switch's `default`.
//
// Written negative-first: the assertions that matter are the ones that FAIL when a value in the
// database has no counterpart in the code.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ORDER_STATUSES,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_NEXT,
} from "../lib/orderStatus";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * The enum as the DATABASE has it: the CREATE TYPE, plus every ADD VALUE since. This is the
 * only source of truth in the repo that cannot drift from production, because it IS the
 * migrations.
 */
function enumValuesFromMigrations(): string[] {
  const dir = join(ROOT, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const values: string[] = [];
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");

    const created = sql.match(
      /CREATE\s+TYPE\s+(?:public\.)?order_status\s+AS\s+ENUM\s*\(([^)]*)\)/i,
    );
    if (created) {
      for (const m of created[1].matchAll(/'([^']+)'/g)) values.push(m[1]);
    }

    for (const m of sql.matchAll(
      /ALTER\s+TYPE\s+(?:public\.)?order_status\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi,
    )) {
      if (!values.includes(m[1])) values.push(m[1]);
    }
  }
  return values;
}

describe("order_status: the code knows every value the database can hold", () => {
  const fromDb = enumValuesFromMigrations();

  it("finds the enum in the migrations at all", () => {
    // Guards against the regex silently matching nothing and making every assertion vacuous.
    expect(fromDb.length).toBeGreaterThanOrEqual(7);
    expect(fromDb).toContain("awaiting_stock");
  });

  it("the generated types.ts lists every value the migrations create", () => {
    const types = read("src/integrations/supabase/types.ts");
    const block = types.match(/order_status:\s*\n((?:\s*\|\s*"[^"]+"\n)+)/);
    expect(block, "order_status union not found in types.ts").not.toBeNull();
    const inTypes = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...inTypes].sort(), "types.ts has drifted from the migrations").toEqual(
      [...fromDb].sort(),
    );
  });

  it("ORDER_STATUSES lists every value the migrations create", () => {
    expect([...ORDER_STATUSES].sort()).toEqual([...fromDb].sort());
  });

  it.each([
    ["a label", ORDER_STATUS_LABEL],
    ["a badge treatment", ORDER_STATUS_BADGE],
    ["a next-step entry", ORDER_STATUS_NEXT],
  ])("every value has %s", (_what, map) => {
    for (const v of fromDb) {
      expect(Object.keys(map), `${v} is missing`).toContain(v);
    }
  });

  it("no label falls back to the raw enum value", () => {
    // "awaiting_stock" rendered as a chip is not a label, it is a variable name leaking.
    for (const v of ORDER_STATUSES) {
      expect(ORDER_STATUS_LABEL[v].fallback).not.toBe(v);
      expect(ORDER_STATUS_LABEL[v].fallback.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("the screens no longer hand-list the enum", () => {
  it("OrdersPage builds its filter from ORDER_STATUSES", () => {
    const src = read("src/pages/admin/OrdersPage.tsx");
    expect(src).toContain("ORDER_STATUSES.map");
    // The five-value cast that made `awaiting_stock` unfilterable.
    expect(src).not.toMatch(/"pending"\s*\|\s*"processing"\s*\|\s*"shipped"/);
  });

  it("OrdersPage offers an action from every state that has a next step", () => {
    const src = read("src/pages/admin/OrdersPage.tsx");
    expect(src).toContain("ORDER_STATUS_NEXT");
    // The three hardcoded blocks that gave `confirmed` and `awaiting_stock` no action at all.
    expect(src).not.toMatch(/order\.status === "processing" &&/);
    expect(src).not.toMatch(/order\.status === "shipped" &&/);
  });

  it("useOrderActions takes the database enum, not a hand-written union", () => {
    const src = read("src/hooks/useOrderActions.ts");
    expect(src).toContain("status: OrderStatus");
    expect(src).not.toMatch(/status:\s*"pending"\s*\|/);
  });

  it("awaiting_stock is reachable from the screen, and leads somewhere", () => {
    // The whole point. A paid member with no allocatable pendant must be findable and movable.
    expect(ORDER_STATUSES).toContain("awaiting_stock");
    expect(ORDER_STATUS_NEXT.awaiting_stock).not.toBeNull();
  });
});
