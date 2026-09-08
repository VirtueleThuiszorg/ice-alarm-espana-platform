// @vitest-environment node
//
// THE SCREEN AND THE TRIGGER MUST AGREE, AND THIS IS WHERE THAT IS PROVEN.
//
// `enforce_fulfilment_state()` is the rule. `src/lib/fulfilmentState.ts` is a mirror of it, and a
// mirror is only useful while it is accurate: a UI that offers a button the trigger refuses
// teaches staff the screen is unreliable, and a UI that hides a move the trigger would accept
// leaves a paid member's pendant stuck. Both are worse than either alone.
//
// So every assertion below reads the MIGRATIONS as the source of truth and checks the TypeScript
// against them. That is the `orderStatusCompleteness.test.ts` discipline, applied to this enum
// from its first day rather than after it has already drifted — because `order_status` proved
// what happens otherwise: two values added by a migration, three layers that never learned, and
// the one order needing human attention invisible to the admin screen.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  FULFILMENT_ACTION_LABEL,
  FULFILMENT_BADGE,
  FULFILMENT_LABEL,
  FULFILMENT_MEANING,
  FULFILMENT_SEQUENCE,
  FULFILMENT_STATES,
  FULFILMENT_TRANSITION_OWNER,
  MAY_CORRECT_FULFILMENT,
  STAFF_MOVABLE_STATES,
  describeFulfilmentError,
  FULFILMENT_CONDITION_LABEL,
  fulfilmentCondition,
  fulfilmentRank,
  isFulfilmentCorrection,
  mayCorrectFulfilment,
  nextFulfilmentState,
  FULFILMENT_TO_ORDER_STATUS,
  type FulfilmentState,
} from "../lib/fulfilmentState";
import { ORDER_STATUSES } from "../lib/orderStatus";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MIGRATIONS = join(ROOT, "supabase/migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** The enum as the DATABASE has it: the CREATE TYPE plus every ADD VALUE since. */
function enumValuesFromMigrations(name: string): string[] {
  const values: string[] = [];
  for (const f of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    const created = sql.match(
      new RegExp(`CREATE\\s+TYPE\\s+(?:public\\.)?${name}\\s+AS\\s+ENUM\\s*\\(([^)]*)\\)`, "i"),
    );
    if (created) for (const m of created[1].matchAll(/'([^']+)'/g)) values.push(m[1]);
    for (const m of sql.matchAll(
      new RegExp(
        `ALTER\\s+TYPE\\s+(?:public\\.)?${name}\\s+ADD\\s+VALUE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?'([^']+)'`,
        "gi",
      ),
    )) {
      if (!values.includes(m[1])) values.push(m[1]);
    }
  }
  return values;
}

/**
 * The LAST definition of a function in migration order — which is the one production runs.
 * `enforce_fulfilment_state()` is defined twice (20260907100000, then rewritten by
 * 20260907110100), and asserting against the first would be asserting against a version that no
 * longer exists.
 */
function latestFunctionBody(name: string): string {
  let body = "";
  for (const f of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    const re = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
      "gi",
    );
    for (const m of sql.matchAll(re)) body = m[1];
  }
  return body;
}

describe("fulfilment_state: the code knows every value the database can hold", () => {
  const fromDb = enumValuesFromMigrations("fulfilment_state");

  it("finds the enum in the migrations at all", () => {
    // Guards against a regex that silently matches nothing and makes every assertion vacuous.
    expect(fromDb.length).toBe(8);
    expect(fromDb).toContain("cancelled");
    expect(fromDb).toContain("awaiting_payment");
  });

  it("the generated types.ts lists every value the migrations create", () => {
    const types = read("src/integrations/supabase/types.ts");
    const inline = types.match(/fulfilment_state:\s*((?:"[^"]+"(?:\s*\|\s*)?)+)/);
    const wrapped = types.match(/fulfilment_state:\s*\n((?:\s*\|\s*"[^"]+"\n)+)/);
    const block = inline?.[1] ?? wrapped?.[1];
    expect(block, "fulfilment_state union not found in types.ts").toBeTruthy();
    const inTypes = [...block!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...inTypes].sort(), "types.ts has drifted from the migrations").toEqual(
      [...fromDb].sort(),
    );
  });

  it("FULFILMENT_STATES lists every value the migrations create", () => {
    expect([...FULFILMENT_STATES].sort()).toEqual([...fromDb].sort());
  });

  it("every value has a label, a meaning and a badge", () => {
    // The Record<> types force this at compile time; this catches the day somebody reaches for
    // an `as` cast to get past the compiler instead of filling the tables in.
    for (const s of fromDb as FulfilmentState[]) {
      expect(FULFILMENT_LABEL[s]?.fallback, `no label for ${s}`).toBeTruthy();
      expect(FULFILMENT_MEANING[s]?.fallback, `no meaning for ${s}`).toBeTruthy();
      expect(FULFILMENT_BADGE[s], `no badge for ${s}`).toBeTruthy();
    }
  });

  it("every value a human moves an order INTO has action wording of its own", () => {
    // `awaiting_payment` is where an order starts, so it is the one value with no action.
    // Everything else is somewhere a person puts an order, and "Mark as tested" is not what they
    // did. `paid` DOES have wording now — reached only through the correction dialog, for a
    // payment that arrived outside Stripe.
    for (const s of fromDb as FulfilmentState[]) {
      if (s === "awaiting_payment") continue;
      const label = FULFILMENT_ACTION_LABEL[s as Exclude<FulfilmentState, "awaiting_payment">];
      expect(label?.fallback, `no action wording for ${s}`).toBeTruthy();
      expect(label.fallback, `action wording for ${s} is just the state name`).not.toBe(
        FULFILMENT_LABEL[s].fallback,
      );
    }
  });

  it("the two names the brief gives verbatim are the ones on the buttons", () => {
    expect(FULFILMENT_ACTION_LABEL.dispatched.fallback).toBe("Collected for delivery");
    expect(FULFILMENT_ACTION_LABEL.tested.fallback).toBe("Test call completed");
  });
});

describe("the rank mirror matches fulfilment_state_rank()", () => {
  const sql = latestFunctionBody("fulfilment_state_rank");

  it("reads the SQL function at all", () => {
    expect(sql).toContain("WHEN 'paid'");
  });

  it("every WHEN in the SQL has the same rank in TypeScript", () => {
    const pairs = [...sql.matchAll(/WHEN\s+'([a-z_]+)'\s+THEN\s+(\d+)/gi)].map(
      (m) => [m[1], Number(m[2])] as const,
    );
    expect(pairs.length, "no WHEN clauses parsed — the assertion would be vacuous").toBe(7);
    for (const [state, rank] of pairs) {
      expect(fulfilmentRank(state as FulfilmentState), `rank of ${state}`).toBe(rank);
    }
  });

  it("FULFILMENT_SEQUENCE is exactly the ranked states, in rank order", () => {
    const ordered = [...sql.matchAll(/WHEN\s+'([a-z_]+)'\s+THEN\s+(\d+)/gi)]
      .map((m) => [m[1], Number(m[2])] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([s]) => s);
    expect([...FULFILMENT_SEQUENCE]).toEqual(ordered);
  });

  it("`cancelled` has no rank in either place", () => {
    // The SQL CASE has no WHEN for it, so it returns NULL. Coercing that to 0 in TypeScript
    // would make `cancelled` read as "before paid" and every move out of it look like progress.
    expect(sql).not.toMatch(/WHEN\s+'cancelled'/i);
    expect(fulfilmentRank("cancelled")).toBeNull();
  });
});

describe("the correction predicate matches the trigger's needs_authority", () => {
  const sql = latestFunctionBody("enforce_fulfilment_state");

  it("reads the trigger's current body, not a superseded one", () => {
    // Three versions now: 20260907100000 defined it with no named predicate at all,
    // 20260907110100 introduced `is_correction`, and 20260908120400 renamed it
    // `needs_authority` when entering `paid` joined the list. Asserting against an older body
    // would be asserting against a version that no longer exists.
    expect(sql).toContain("needs_authority");
    expect(sql).not.toContain("is_correction");
    expect(sql).toContain("fulfilment_state_reason");
  });

  it("the trigger's four clauses are the four this module implements", () => {
    const expr = sql.match(/needs_authority\s*:=\s*([\s\S]*?);/)?.[1] ?? "";
    expect(expr).toContain("NEW.fulfilment_state = 'cancelled'");
    expect(expr).toContain("OLD.fulfilment_state = 'cancelled'");
    // The newest clause: entering `paid` is a claim that money arrived, so it needs a D9 role
    // and a reason like any correction. Before `awaiting_payment` existed it was not a move.
    expect(expr).toContain("NEW.fulfilment_state = 'paid'");
    expect(expr).toContain("new_rank < old_rank");
  });

  it.each([
    ["paid", "allocated", false],
    ["allocated", "programmed", false],
    ["dispatched", "delivered", false],
    ["delivered", "tested", false],
    ["delivered", "dispatched", true],
    ["tested", "paid", true],
    ["paid", "cancelled", true],
    ["tested", "cancelled", true],
    ["cancelled", "paid", true],
    ["cancelled", "allocated", true],
    ["delivered", "delivered", false],
    // Forward, one step — and STILL needs a role and a reason, because it is a claim that money
    // arrived. This is the row that would have been `false` under the old three-clause rule.
    ["awaiting_payment", "paid", true],
    // Backwards out of it is an ordinary correction.
    ["paid", "awaiting_payment", true],
    ["allocated", "awaiting_payment", true],
    ["awaiting_payment", "cancelled", true],
    ["awaiting_payment", "awaiting_payment", false],
  ] as const)("%s → %s is a correction: %s", (from, to, expected) => {
    expect(isFulfilmentCorrection(from, to)).toBe(expected);
  });

  it("leaving `cancelled` is a correction even though it looks like progress", () => {
    // This is the clause a rank-only implementation gets wrong: `cancelled` has no rank, so
    // `cancelled → allocated` compares against NULL and reads as an ordinary forward move.
    expect(isFulfilmentCorrection("cancelled", "tested")).toBe(true);
  });
});

describe("forward moves are one step, and only one", () => {
  it("each sequenced state points at the next", () => {
    expect(nextFulfilmentState("paid")).toBe("allocated");
    expect(nextFulfilmentState("allocated")).toBe("programmed");
    expect(nextFulfilmentState("programmed")).toBe("dispatched");
    expect(nextFulfilmentState("dispatched")).toBe("delivered");
    expect(nextFulfilmentState("delivered")).toBe("tested");
  });

  it("`tested` is the end of the line and `cancelled` has no forward move", () => {
    expect(nextFulfilmentState("tested")).toBeNull();
    // Leaving `cancelled` is a correction, which is a different affordance with a dialog.
    expect(nextFulfilmentState("cancelled")).toBeNull();
  });

  it("never returns `awaiting_payment`, because nobody moves an order INTO it", () => {
    // The narrowed return type says so; this proves the implementation agrees, and it is what
    // lets FULFILMENT_ACTION_LABEL have no `awaiting_payment` entry to fill in with a lie.
    for (const s of FULFILMENT_STATES) {
      expect(nextFulfilmentState(s)).not.toBe("awaiting_payment");
    }
  });

  it("DOES return `paid` — from `awaiting_payment`, which is a real forward move", () => {
    // It is one step forward and it is owned by the payment webhook, not by a person: the
    // trigger demands a role and a reason for it, and STAFF_MOVABLE_STATES leaves it out.
    expect(nextFulfilmentState("awaiting_payment")).toBe("paid");
    expect(FULFILMENT_TRANSITION_OWNER.paid).toBe("payment");
    expect(STAFF_MOVABLE_STATES).not.toContain("paid");
  });

  it("the trigger refuses a skip, which is why nothing here offers one", () => {
    const sql = latestFunctionBody("enforce_fulfilment_state");
    expect(sql).toContain("new_rank <> old_rank + 1");
  });
});

describe("who owns each transition — the brief's two 'not a button' rules", () => {
  it("`programmed` is owned by the checklist and is NOT staff-movable", () => {
    // The brief: "completing the checklist IS the transition, not a separate button." A button
    // would let staff assert a pendant is configured without configuring it.
    expect(FULFILMENT_TRANSITION_OWNER.programmed).toBe("checklist");
    expect(STAFF_MOVABLE_STATES).not.toContain("programmed");
  });

  it("`allocated` is owned by allocation and is NOT staff-movable", () => {
    // A bare "mark as allocated" would claim a device is reserved for this member when none is.
    expect(FULFILMENT_TRANSITION_OWNER.allocated).toBe("allocation");
    expect(STAFF_MOVABLE_STATES).not.toContain("allocated");
  });

  it("the three a human really does press are staff-movable", () => {
    expect([...STAFF_MOVABLE_STATES].sort()).toEqual(["delivered", "dispatched", "tested"]);
  });
});

describe("D9 — the role gate mirrors may_reverse_fulfilment()", () => {
  const sql = latestFunctionBody("may_reverse_fulfilment");

  it("reads the SQL function at all", () => {
    expect(sql).toContain("get_staff_role");
  });

  it("exactly the roles the SQL allows are allowed here", () => {
    const allowedInSql = [...sql.matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      // The function also names PostgREST's request roles in its service-role branch; those are
      // database roles, not app_role values, so they are not part of the D9 set.
      .filter((v) => !["authenticated", "anon"].includes(v));
    expect(allowedInSql.length, "no roles parsed — the assertion would be vacuous").toBe(3);

    const allowedInTs = Object.entries(MAY_CORRECT_FULFILMENT)
      .filter(([, may]) => may)
      .map(([role]) => role);
    expect([...allowedInTs].sort()).toEqual([...allowedInSql].sort());
  });

  it("every app_role the database can hold has a decision recorded here", () => {
    // A role added by a migration must not default to "cannot", which would look like a working
    // screen with a missing button rather than an unanswered question.
    const roles = enumValuesFromMigrations("app_role");
    expect(roles.length).toBeGreaterThanOrEqual(4);
    for (const r of roles) {
      expect(
        Object.prototype.hasOwnProperty.call(MAY_CORRECT_FULFILMENT, r),
        `app_role '${r}' has no entry in MAY_CORRECT_FULFILMENT`,
      ).toBe(true);
    }
  });

  it("an ordinary call_centre operator cannot correct, and no role is assumed from absence", () => {
    expect(mayCorrectFulfilment("call_centre")).toBe(false);
    expect(mayCorrectFulfilment("call_centre_supervisor")).toBe(true);
    expect(mayCorrectFulfilment(null)).toBe(false);
    expect(mayCorrectFulfilment(undefined)).toBe(false);
  });
});

describe("every refusal the trigger can raise reaches a human in words", () => {
  const sql = latestFunctionBody("enforce_fulfilment_state");

  /** The literal text of each RAISE EXCEPTION format string, concatenated across its lines. */
  function raisedMessages(): string[] {
    const out: string[] = [];
    for (const m of sql.matchAll(/RAISE\s+EXCEPTION([\s\S]*?)USING\s+ERRCODE/gi)) {
      const literals = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      out.push(literals.join(""));
    }
    return out;
  }

  it("finds every refusal in the trigger", () => {
    // Five: a skip, the D9 role, a missing reason, tested without a staff id, and a commission
    // that has already been released. If a sixth is added, this fails until it is translated.
    expect(raisedMessages().length).toBe(5);
  });

  it("none of them falls through to the raw database message", () => {
    for (const msg of raisedMessages()) {
      const { title, body } = describeFulfilmentError(msg);
      expect(title, `unrecognised refusal:\n${msg}`).not.toBe("The change was refused");
      expect(body.length).toBeGreaterThan(20);
      // The words the operator sees must not be the words the developer wrote.
      expect(body).not.toContain("fulfilment_state_reason");
      expect(body).not.toContain("ERRCODE");
    }
  });

  it("an unrecognised refusal shows the raw message rather than hiding it", () => {
    // A database error this file does not know about is a bug in this file. A generic
    // "something went wrong" would hide the bug as well as the cause.
    const raw = "orders_member_id_fkey violated";
    expect(describeFulfilmentError(raw)).toEqual({
      title: "The change was refused",
      body: raw,
    });
  });
});

describe("`awaiting_stock` is a CONDITION, not a state — increment 6", () => {
  it("is not in the fulfilment enum at all", () => {
    // FULFILMENT_MODEL.md §2: it is `paid` with a failed allocation. Modelling it as a
    // sequence state is what let it become invisible in §1-B.
    expect(FULFILMENT_STATES as readonly string[]).not.toContain("awaiting_stock");
  });

  it.each([
    [{ fulfilment_state: "paid", status: "awaiting_stock" }, "awaiting_stock"],
    [{ fulfilment_state: "paid", status: "pending" }, "awaiting_allocation"],
    [{ fulfilment_state: "paid", status: "confirmed" }, "awaiting_allocation"],
    [{ fulfilment_state: "paid", status: null }, "awaiting_allocation"],
    [{ fulfilment_state: "allocated", status: "awaiting_stock" }, "none"],
    [{ fulfilment_state: "dispatched", status: "awaiting_stock" }, "none"],
    [{ fulfilment_state: "tested", status: "processing" }, "none"],
    [{ fulfilment_state: "cancelled", status: "awaiting_stock" }, "none"],
    [{ fulfilment_state: null, status: "awaiting_stock" }, "none"],
  ] as const)("%o → %s", (order, expected) => {
    expect(fulfilmentCondition(order)).toBe(expected);
  });

  it("distinguishes 'no stock exists' from 'nobody has allocated yet'", () => {
    // Different work: one is buying pendants, the other is walking to the shelf. A screen that
    // shows one number for both tells nobody what to do.
    expect(fulfilmentCondition({ fulfilment_state: "paid", status: "awaiting_stock" })).toBe(
      "awaiting_stock",
    );
    expect(fulfilmentCondition({ fulfilment_state: "paid", status: "confirmed" })).toBe(
      "awaiting_allocation",
    );
    expect(FULFILMENT_CONDITION_LABEL.awaiting_stock.work.fallback).toMatch(/buy stock/i);
    expect(FULFILMENT_CONDITION_LABEL.awaiting_allocation.work.fallback).toMatch(/allocate/i);
  });

  it("stops being a condition once a device is allocated, whatever the stale status says", () => {
    // An order at `allocated` whose status still reads `awaiting_stock` is DRIFT, which the
    // orders row flags separately and louder. Calling it a condition too would put a permanent
    // "Awaiting stock" chip on an order that has a pendant reserved.
    expect(fulfilmentCondition({ fulfilment_state: "allocated", status: "awaiting_stock" })).toBe(
      "none",
    );
  });
});

describe("the reconciliation with orders.status is explicit and checkable", () => {
  it("every mapped value is a real order_status", () => {
    for (const [state, status] of Object.entries(FULFILMENT_TO_ORDER_STATUS)) {
      if (status === null) continue;
      expect(ORDER_STATUSES, `${state} maps to a value order_status does not have`).toContain(
        status,
      );
    }
  });

  it("`delivered` is the one that maps to the commission-bearing status", () => {
    // FULFILMENT_MODEL.md §3: orders.status='delivered' creates the €50 partner commission.
    // Nothing else may map to it, or the commission fires twice for one delivery.
    const mapsToDelivered = Object.entries(FULFILMENT_TO_ORDER_STATUS)
      .filter(([, s]) => s === "delivered")
      .map(([f]) => f);
    expect(mapsToDelivered).toEqual(["delivered"]);
  });

  it("`programmed` and `tested` map to nothing, because orders.status cannot express them", () => {
    expect(FULFILMENT_TO_ORDER_STATUS.programmed).toBeNull();
    // An order in `tested` stays `delivered`, which is what the commission path should see.
    expect(FULFILMENT_TO_ORDER_STATUS.tested).toBeNull();
  });

  it("every fulfilment state has a decision recorded, null included", () => {
    for (const s of FULFILMENT_STATES) {
      expect(
        Object.prototype.hasOwnProperty.call(FULFILMENT_TO_ORDER_STATUS, s),
        `${s} has no entry in FULFILMENT_TO_ORDER_STATUS`,
      ).toBe(true);
    }
  });
});

describe("the hook does not write what the server stamps", () => {
  const hook = read("src/hooks/useFulfilmentState.ts");

  it("never sets a fulfilment timestamp or actor from the client", () => {
    // A timestamp written by the client is a timestamp the client can lie about, and
    // `tested_by` is the entire evidence that a named operator answered a real test call.
    for (const col of ["allocated_at", "programmed_at", "programmed_by", "tested_at", "tested_by"]) {
      expect(
        new RegExp(`${col}\\s*:`).test(hook),
        `useFulfilmentState assigns ${col} — the trigger stamps it`,
      ).toBe(false);
    }
  });

  it("moves fulfilment_state BEFORE orders.status", () => {
    // If the trigger refuses, nothing else must have happened yet. Reversed, a refused
    // fulfilment move would leave orders.status already changed — and, at `delivered`, a €50
    // commission created for a delivery the database just declined to record.
    const fulfilmentWrite = hook.indexOf('.from("orders")');
    const statusWrite = hook.indexOf("updateOrderStatus.mutateAsync");
    expect(fulfilmentWrite).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(fulfilmentWrite);
  });

  it("sends a reason only on a correction", () => {
    expect(hook).toContain("if (correction && reason)");
  });

  it("re-reads readiness after a move", () => {
    // `tested` is half of monitoring readiness. A stale readiness number is the one number on
    // this system that must not be stale.
    expect(hook).toContain("admin-monitoring-readiness-queue");
  });
});
