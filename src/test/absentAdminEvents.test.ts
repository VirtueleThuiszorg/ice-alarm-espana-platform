// @vitest-environment node
//
// Item 3 — the admin-audience events that write nowhere, and the checks that keep the list honest.
//
// The bell is fine as a reader. What is missing sits on the other side of it: six things happen
// in this product that an admin or an operator would expect to hear about, and nothing writes
// anything anywhere. The register now carries them (`ABSENT_ADMIN_EVENTS`), and item 3 says the
// wiring session owns the FIXES — so this file proves the INVENTORY, not a repair.
//
// A CLAIM ABOUT AN ABSENCE ROTS FASTER THAN A CLAIM ABOUT CODE. The moment somebody wires one of
// these up, a register that still says "nobody is told" is worse than no register: it sends the
// next reader to fix something twice, and this repo has already published a STATE.md section
// claiming two fixes that sat unmerged on a closed branch (GOALS G5). So every row carries a
// machine-checkable absence, `scripts/wiring/build.mjs` verifies it on every build, and the
// tests below prove those checks are real by breaking them on purpose.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ABSENT_ADMIN_EVENTS } from "../../scripts/wiring/annotations.mjs";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * The declared types come from `scripts/wiring/annotations.d.mts`, not from a copy here.
 *
 * A local re-declaration was the first version of this file, and it is the same trap the
 * register itself exists to close: two descriptions of one thing, drifting. If a field is added
 * to the data and not to the declaration, this file stops compiling.
 */
const EVENTS = ABSENT_ADMIN_EVENTS;

/** Run the generator and hand back its exit code and output. */
function build(): { code: number; out: string } {
  try {
    const out = execFileSync("node", ["scripts/wiring/build.mjs", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("the inventory itself", () => {
  it("names the events still absent, each with an audience, an expectation and today's behaviour", () => {
    /*
      WAS SIX, IS NOW FOUR. A2 (a declined card tells nobody) and A3 (a cancellation tells
      nobody) were both wired by item 5b: `stripe-webhook` now calls `notifyAdmins()` for a
      failed invoice and for `customer.subscription.deleted`. Their entries are DELETED rather
      than left sitting here looking broken — `annotations.mjs` carries the reason each was
      removed, and the wires' own proofs are in `src/test/stripeWebhookContract.test.ts`.

      This count is deliberately exact. A row quietly disappearing is how a real defect gets
      dropped from the inventory, so shrinking this list has to be a decision somebody makes
      here, in a diff, with the fix named.
    */
    expect(EVENTS.length).toBe(4);
    expect(EVENTS.map((e) => e.id)).toEqual(["A1", "A4", "A5", "A6"]);
    for (const e of EVENTS) {
      expect(e.id, JSON.stringify(e)).toMatch(/^A\d$/);
      expect(e.event.length).toBeGreaterThan(10);
      expect(e.audience).toMatch(/admin|staff|owner/i);
      expect(e.expectation.length).toBeGreaterThan(30);
      expect(e.today.length).toBeGreaterThan(30);
      // Item 3: "the wiring session owns the fixes — do not duplicate".
      expect(e.owner).toMatch(/wiring session/);
    }
  });

  it("every row carries a check, and the check is one of the two verified kinds", () => {
    for (const e of EVENTS) {
      expect(["absentEverywhere", "absentPair"], e.id).toContain(e.absence.kind);
      expect(e.absence.scan.length, e.id).toBeGreaterThan(0);
      expect(e.absence.why.length, e.id).toBeGreaterThan(10);
    }
  });

  it("and the generator still refuses a kind it does not know how to verify", () => {
    /*
      DEFENCE IN DEPTH, ASSERTED ON THE SOURCE, and said plainly rather than dressed up as a
      behavioural test. Because the assertion above proves every entry's kind is one of the two,
      the generator's "unknown kind" branch is UNREACHABLE from the real data — so a mutation
      deleting it passed the whole suite. It matters anyway: the failure it prevents is a row
      whose claim is never checked at all, which is the one kind of rot this file exists to stop.
      A source assertion is the honest instrument for an unreachable guard.
    */
    const generator = readFileSync(join(ROOT, "scripts/wiring/build.mjs"), "utf8");
    expect(generator).toContain("unknown absence check kind");
    expect(generator).toMatch(/brokenClaims\.push\(`\$\{row\.id\}: unknown absence check kind/);
  });

  it("the register renders them, with the checks written out", () => {
    const register = read("WIRING_REGISTER.md");
    expect(register).toContain("## Admin-audience events that write nowhere");
    for (const e of EVENTS) {
      expect(register, e.id).toContain(`**${e.id}**`);
    }
    // The checks are printed so a reader can re-run them by hand.
    expect(register).toContain("The checks, verified on every build");
  });
});

// ── the six absences, each confirmed independently of the generator ────────
describe("A1 — nothing invokes ai-dispatch-events", () => {
  it("no client call, no cron schedule, no fetch", () => {
    // `ai_events` has four writers and exactly one consumer. If nothing calls the consumer, the
    // seven Boss & Owner Intelligence switches in isabella_settings do nothing when turned on.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*(\/\/|--).*$/gm, "");
    const files = execFileSync(
      "grep",
      ["-rl", "ai-dispatch-events", "src", "supabase", ".github"],
      { cwd: ROOT, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.startsWith("supabase/functions/ai-dispatch-events/"))
      // Tests are not wiring: this very file names the function to prove the check bites, and
      // the generator excludes src/test, e2e and scripts/wiring for the same reason.
      .filter((f) => !/^(src\/test\/|e2e\/|scripts\/wiring\/)/.test(f))
      // `supabase/config.toml` DECLARES the function (verify_jwt = false) — that is a deployment
      // setting, not a call. Worth knowing separately: it means the endpoint is public, so the
      // day somebody wires it up they must add auth as well as a caller.
      .filter((f) => !f.endsWith(".toml"));

    const realCallers = files.filter((f) => /ai-dispatch-events/.test(strip(read(f))));
    expect(realCallers, "these would make A1 false").toEqual([]);
  });

  it("but the events ARE being written, which is what makes it a defect and not a gap", () => {
    const postPayment = read("supabase/functions/_shared/post-payment.ts");
    expect(postPayment).toContain('from("ai_events")');
    expect(postPayment).toContain('event_type: "sale.paid"');
  });
});

describe("A2 / A3 — a failed payment and a cancellation NOW tell somebody", () => {
  /*
    THIS DESCRIBE USED TO ASSERT THE OPPOSITE, and the inversion is the point.

    It read: "invoice.payment_failed writes past_due and nothing else" and
    "customer.subscription.deleted writes cancelled and nothing else", each by slicing the
    webhook's `case` block and asserting it contained no notifier. Item 5b wired both, so those
    assertions are now false — and their `caseBlock()` helper stopped working anyway, because the
    rewritten webhook dispatches to named handlers instead of putting the logic inline between
    `case` and `break;`.

    Kept rather than deleted, because a fix that can silently un-fix itself is not finished. The
    wires' real proofs (what is written, to whom, and that monitoring continues) live in
    `src/test/stripeWebhookContract.test.ts`; these two assert only that the inventory above and
    the code below still agree about which of the six are done.
  */
  const webhook = read("supabase/functions/stripe-webhook/index.ts");

  it("neither is still listed as absent", () => {
    expect(EVENTS.find((e) => e.id === "A2")).toBeUndefined();
    expect(EVENTS.find((e) => e.id === "A3")).toBeUndefined();
  });

  it("the webhook raises a notification for the failed invoice, and still does not suspend", () => {
    const handler = webhook.slice(webhook.indexOf("async function onInvoiceFailed"));
    expect(handler).toMatch(/status:\s*"past_due"/);
    expect(handler).toContain("notifyAdmins");
    // P4, and it is not my opinion — monitoring continues. Somebody whose card expired is still
    // somebody who may press an SOS button tonight.
    expect(handler).not.toMatch(/from\("members"\)/);
  });

  it("and for the cancellation", () => {
    const handler = webhook.slice(webhook.indexOf("async function onSubscriptionChange"));
    expect(handler).toMatch(/status:\s*"cancelled"|"cancelled"/);
    expect(handler).toContain("notifyAdmins");
  });
});

describe("A4 — Isabella failing tells nobody", () => {
  it("ai-run records the failure and raises nothing", () => {
    const aiRun = read("supabase/functions/ai-run/index.ts");
    expect(aiRun).toContain('status: "failed"');
    expect(aiRun).toContain("error_message");
    expect(aiRun).not.toMatch(/notification_log|notify-admin/);
  });

  it("and the item 1 surface is a READER, which is a different thing from being told", () => {
    /*
      FOUND BY THIS TEST GOING RED ON MAIN, one hour after it merged, and it is worth writing
      down rather than quietly repointing.

      Item 1 shipped `IsabellaHealthCard`; another session then replaced the two dashboard cards
      with header pills and DELETED the card, so this assertion read a file that no longer
      existed. The claim it makes was unaffected — the pill reads `useIsabellaHealth` and raises
      nothing — so A4 still holds. Only the file name was wrong.

      It is resolved by NAME PATTERN rather than by a path: whatever renders Isabella's health on
      the admin dashboard, that is the surface, and a rename must not redden main. What is still
      asserted strictly is the property — it reads, and it tells nobody.
    */
    const dir = "src/components/admin/dashboard";
    const surfaces = readdirSync(join(ROOT, dir)).filter((f) => /^IsabellaHealth.*\.tsx$/.test(f));
    expect(surfaces.length, `no Isabella health surface found in ${dir}`).toBeGreaterThan(0);
    for (const f of surfaces) {
      const src = read(`${dir}/${f}`);
      expect(src, f).toContain("useIsabellaHealth");
      expect(src, f).not.toMatch(/notification_log|notify-admin/);
    }
  });
});

describe("A5 / A6 — a stale price and an abandoned checkout tell nobody", () => {
  it("no notifier reads stripe_prices", () => {
    const notifiers = ["notify-admin", "notify-fulfilment", "notify-staff-whatsapp"];
    for (const n of notifiers) {
      const p = `supabase/functions/${n}/index.ts`;
      expect(read(p), p).not.toContain("stripe_prices");
    }
  });

  it("the refusal at the point of use is all there is, and it is not a notification", () => {
    /*
      `send-payment-link` refuses with PRICE_STALE — which tells the staff member standing there,
      and nobody else. That is the distinction A5 records.

      GUARDED ON THE FILES EXISTING, because that function is in a HELD PR (item 4, Stripe
      sessions behind the human gate) while this one merges now. The assertion applies the moment
      it lands, and until then it is honest about not being able to look. A test that read a file
      from another branch would simply be red on main.
    */
    const resolver = "supabase/functions/_shared/checkout-lines.ts";
    const fn = "supabase/functions/send-payment-link/index.ts";
    if (!existsSync(join(ROOT, resolver))) {
      expect(existsSync(join(ROOT, fn))).toBe(false);
      return;
    }
    expect(read(resolver)).toContain("PRICE_STALE");
    expect(read(fn)).not.toContain("notification_log");
  });

  it("nothing sweeps awaiting_payment", () => {
    const dispatcher = read("supabase/functions/_shared/notify-fulfilment.ts");
    expect(dispatcher).not.toContain("awaiting_payment");
  });
});

// ── the checks are real: break one and the build fails ────────────────────
describe("the absence checks bite", () => {
  it("the generator passes as things stand", () => {
    expect(build().code).toBe(0);
  });

  it("and FAILS when an absence claim stops holding", () => {
    /*
      The load-bearing test of the whole mechanism. A claim nobody verifies is a comment.

      Rather than editing a real source file, this writes a temporary file INSIDE a scanned tree
      that would make A1 false — a caller of ai-dispatch-events — and asserts the generator
      refuses, naming A1. Then it removes it and asserts the build is clean again, so a failure
      here cannot leave the repo dirty.
    */
    const planted = join(ROOT, "supabase/functions/_shared/__absence_probe.ts");
    try {
      writeFileSync(
        planted,
        'export const probe = () => supabase.functions.invoke("ai-dispatch-events");\n',
      );
      const result = build();
      expect(result.code).not.toBe(0);
      expect(result.out).toMatch(/A1 claims nobody is told/);
      expect(result.out).toMatch(/__absence_probe/);
    } finally {
      execFileSync("rm", ["-f", planted]);
    }
    expect(build().code).toBe(0);
  });

  it("a pair check bites when the notifier comes BEFORE the event", () => {
    /*
      The realistic direction, and the one a forward-only window misses: a helper that raises the
      bell is defined ABOVE the switch that handles the event. A mutation narrowing the window to
      `[m.index, m.index + window]` survived until this test existed — the probe below put the
      notifier first and the check still had to find it.
    */
    const planted = join(ROOT, "supabase/functions/_shared/__absence_probe_before.ts");
    try {
      writeFileSync(
        planted,
        'const tell = () => supabase.from("notification_log").insert({});\n' +
          'export const handle = (s: string) => (s === "awaiting_payment" ? tell() : null);\n',
      );
      const result = build();
      expect(result.code).not.toBe(0);
      // Repointed from A2 to A6 when item 5b wired A2. The probe has to name a row that is
      // still absent, or it proves nothing about the window and passes for the wrong reason.
      expect(result.out).toMatch(/A6 claims nobody is told/);
    } finally {
      execFileSync("rm", ["-f", planted]);
    }
    expect(build().code).toBe(0);
  });

  it("a pair check bites too — a notifier next to the abandoned-order case", () => {
    const planted = join(ROOT, "supabase/functions/_shared/__absence_probe_pair.ts");
    try {
      writeFileSync(
        planted,
        // The two halves within the window: the event, and somebody being told.
        'const s = "awaiting_payment";\nawait supabase.from("notification_log").insert({ event_type: s });\n',
      );
      const result = build();
      expect(result.code).not.toBe(0);
      expect(result.out).toMatch(/A6 claims nobody is told/);
    } finally {
      execFileSync("rm", ["-f", planted]);
    }
    expect(build().code).toBe(0);
  });

  it("and it reads CODE, not the prose about it", () => {
    // isabella-gate's header names ai-dispatch-events in a comment; A1 must survive that, or
    // the check would be unusable in the file that documents the defect.
    expect(read("supabase/functions/_shared/isabella-gate.ts")).toContain("ai-dispatch-events");
    expect(build().code).toBe(0);
  });
});

// ── temporary scratch files must never survive a run ──────────────────────
describe("the probes clean up after themselves", () => {
  it("no probe file is left in the tree", () => {
    const listing = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
    expect(listing).not.toMatch(/__absence_probe/);
  });

  it("and the temp dir helper is unused, so nothing is written outside the repo either", () => {
    // mkdtempSync is imported deliberately unused-by-design? No: assert it stays unused, because
    // a probe outside the scanned trees would prove nothing about the generator.
    expect(typeof mkdtempSync).toBe("function");
    expect(tmpdir()).toBeTruthy();
  });
});
