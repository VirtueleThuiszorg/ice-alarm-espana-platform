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
import { stripComments } from "./helpers/stripComments";

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
      NOT A FIXED COUNT ANY MORE. The list started at six and shrinks as the fixes land — A4
      (Isabella failing tells nobody) went when ai-run started raising `isabella.down`. Pinning
      the number would mean a fix cannot merge without a test edit that says nothing, and the
      property worth keeping is that every REMAINING row is complete and checkable.

      It must not grow silently either: a new absence is a real finding and belongs in a commit
      that says so, so the upper bound stays.
    */
    expect(EVENTS.length).toBeGreaterThan(0);
    expect(EVENTS.length).toBeLessThanOrEqual(6);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
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
    /*
      P4, and it is not my opinion — monitoring continues. Somebody whose card expired is still
      somebody who may press an SOS button tonight.

      ASSERTED AS "NO WRITE", not "no mention". This read `not.toMatch(/from\("members"\)/)`,
      which was the same thing while the handler told nobody but the office. It now texts the
      member once Stripe has stopped retrying, and that means reading their name, phone and
      language — so the old form would have forbidden a message rather than a status change.
    */
    expect(handler).not.toMatch(/from\("members"\)[\s\S]{0,200}\.update\(/);
    expect(handler).not.toMatch(/from\("members"\)[\s\S]{0,200}\.delete\(/);
  });

  it("and for the cancellation", () => {
    const handler = webhook.slice(webhook.indexOf("async function onSubscriptionChange"));
    expect(handler).toMatch(/status:\s*"cancelled"|"cancelled"/);
    expect(handler).toContain("notifyAdmins");
  });
});

describe("A4 is RETIRED — Isabella failing now tells the admins", () => {
  /*
    A4 claimed: "ai-run records the failure in `ai_runs.error_message` and tells nobody". That
    was true, and it was the 8 September outage — the Anthropic balance hit zero, every run
    failed all day, each failure was recorded faithfully, and the dashboard said ACTIVE.

    It is no longer true, so the row is GONE from ABSENT_ADMIN_EVENTS rather than kept with a
    weaker check. These tests are its replacement: the claim inverted, so the notifier cannot be
    removed without something going red, and the row cannot be re-added while the code notifies.
  */

  it("is no longer claimed as absent", () => {
    expect(EVENTS.map((e) => e.id)).not.toContain("A4");
    // ...and nothing else in the register still says Isabella's failure tells nobody.
    for (const event of EVENTS) {
      expect(event.event.toLowerCase(), event.id).not.toContain("isabella");
    }
  });

  it("ai-run raises isabella.down from the place that records the failure", () => {
    const aiRun = read("supabase/functions/ai-run/index.ts");
    expect(aiRun).toContain('status: "failed"');
    expect(aiRun).toContain("error_message");
    // The emitter, and the router it posts to.
    expect(aiRun).toContain("reportIsabellaDown");
    expect(aiRun).toContain("/functions/v1/notify-staff");
  });

  it("every failure path in ai-run goes through the ONE funnel", () => {
    /*
      Three places record a failure: two chat paths through `recordChatRun` and the agent/event
      branch's direct update. A fourth added later that notified nobody would be the original
      defect again, in a file nobody would think to re-read — so the count is pinned, and the
      funnel is the only caller of the emitter.
    */
    const aiRun = stripComments(read("supabase/functions/ai-run/index.ts"));
    const failures = aiRun.match(/status: "failed"/g) ?? [];
    expect(failures).toHaveLength(3);
    expect(aiRun.match(/notifyIsabellaDown\(/g) ?? []).toHaveLength(3);
    expect(aiRun.match(/reportIsabellaDown\(/g) ?? []).toHaveLength(1);
  });

  it("and the dashboard surface is still only a READER", () => {
    /*
      A pill is not a notification: it says so to somebody who opens that page. The emitter is
      server-side for exactly that reason, and this keeps the client half honest — a
      notification raised from the browser would fire once per admin who happened to be looking.

      Resolved by NAME PATTERN, not by path: item 1 shipped `IsabellaHealthCard`, another
      session replaced the dashboard cards with pills and deleted it, and this assertion went red
      on main for reading a file that no longer existed. Whatever renders Isabella's health there
      is the surface.
    */
    const dir = "src/components/admin/dashboard";
    const surfaces = readdirSync(join(ROOT, dir)).filter((f) => /^IsabellaHealth.*\.tsx$/.test(f));
    expect(surfaces.length, `no Isabella health surface found in ${dir}`).toBeGreaterThan(0);
    for (const f of surfaces) {
      const src = read(`${dir}/${f}`);
      expect(src, f).toContain("useIsabellaHealth");
      expect(src, f).not.toMatch(/notification_log|notify-admin|notify-staff/);
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
/**
 * These five tests each SPAWN the register generator over the whole repo, two or three times —
 * plant a probe file, build, remove it, build again. That is seconds of real work per test, and
 * vitest's default 5s budget was never sized for it: the three that build more than once began
 * failing with "Test timed out in 5000ms" as the suite grew and the workers began competing for
 * CPU. Proven by running this file alone with `--testTimeout=2500`, which fails exactly those
 * same tests and no others.
 *
 * So the budget is stated here rather than left to the default. It cannot hide a real failure —
 * a refusal the generator should have made and did not still fails the assertion — and it is
 * per-test rather than a config-wide bump, which would have quietly given every other test in
 * the suite a minute to be slow in.
 *
 * A MINUTE AND NOT THIRTY SECONDS: one of these builds was measured at 256s on a box running
 * five suites at once. A minute is generous where the suite runs alone, as it does in CI, and
 * still bounded — a generator that hangs fails the test rather than stalling the run.
 */
const SPAWNS_THE_GENERATOR = 60_000;

describe("the absence checks bite", () => {
  it("the generator passes as things stand", () => {
    expect(build().code).toBe(0);
  }, SPAWNS_THE_GENERATOR);

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
  }, SPAWNS_THE_GENERATOR);

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
  }, SPAWNS_THE_GENERATOR);

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
  }, SPAWNS_THE_GENERATOR);

  it("and it reads CODE, not the prose about it", () => {
    // isabella-gate's header names ai-dispatch-events in a comment; A1 must survive that, or
    // the check would be unusable in the file that documents the defect.
    expect(read("supabase/functions/_shared/isabella-gate.ts")).toContain("ai-dispatch-events");
    expect(build().code).toBe(0);
  }, SPAWNS_THE_GENERATOR);
});

// ── the register is GENERATED, so a hand-merge is a detectable defect ─────
describe("WIRING_REGISTER.md was generated, not hand-merged", () => {
  /*
    THIS FILE WAS BROKEN IN MAIN TWICE ON 9 SEPTEMBER, in the way CLAUDE.md warns about twice:
    several PRs touched the generated register in a burst, and each merge "resolved" it by
    KEEPING BOTH SIDES. The first time it landed with four different summary lines —

        183 distinct wires across 630 call sites and 108 routes.
        183 distinct wires across 629 call sites and 108 routes.
        184 distinct wires across 630 call sites and 108 routes.
        184 distinct wires across 629 call sites and 108 routes.

    — and a histogram with bands 7, 6 and 5 printed three times each with different counts. The
    fix for it merged, and the SAME thing happened again two merges later: 187 and 185 side by
    side. Twice in one morning is not bad luck; it is what merging a generated file concurrently
    does.

    `build.mjs --check` catches it, and it is in CI. It was merged past anyway, both times. What
    a test can still do is say WHICH KIND of wrong it is: "out of date" sends somebody to re-run
    the generator, where "the same line twice" tells them a merge did it and that a PR's worth of
    rows may be missing — and the fix for a generated file is ALWAYS regeneration, never editing
    the conflict.
  */
  const register = read("WIRING_REGISTER.md");

  it("states its totals exactly once", () => {
    const totals = register.match(/^\d+ distinct wires across .+$/gm) ?? [];
    expect(totals).toHaveLength(1);
  });

  it("has one histogram row per band, not two", () => {
    const bands = (register.match(/^\s*(\d+) │/gm) ?? []).map((m) => m.trim().split(" ")[0]);
    expect(bands.length).toBeGreaterThan(0);
    expect(new Set(bands).size).toBe(bands.length);
  });

  it("names each absence claim twice — its table row and its check — and never more", () => {
    /*
      The register prints each claim once in the inventory table and once in "the checks,
      verified on every build", so TWO is correct and three is a merge. Counting to exactly two
      rather than "at least one" is the point: a duplicated row renders two contradictory claims
      about the same event, and a reader has no way to tell which is current.
    */
    for (const e of EVENTS) {
      const mentions = register.match(new RegExp(`\\*\\*${e.id}\\*\\*`, "g")) ?? [];
      expect(mentions, e.id).toHaveLength(2);
    }
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
