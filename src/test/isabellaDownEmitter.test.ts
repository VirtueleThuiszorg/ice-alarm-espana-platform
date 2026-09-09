// @vitest-environment node
//
// THE NOTIFICATION THE 8 SEPTEMBER OUTAGE DID NOT PRODUCE.
//
// The Anthropic balance hit zero. Every Isabella run failed, all day. Each failure was recorded
// faithfully in `ai_runs.error_message` and told nobody, while the admin dashboard went on
// saying ACTIVE. The health pill added since makes it visible — but a pill is a reader, not a
// notifier: it says so only to somebody who happens to open that page.
//
// So there are two things to prove, and the second is the one that decides whether this is an
// improvement or a new problem:
//   1. a failure raises the event, from the place that records it; and
//   2. a DAY of failures raises it once an hour, not once per run.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEDUPE_WINDOW_MS,
  hourlyKey,
  isabellaDownEvent,
  reportIsabellaDown,
  summarise,
} from "../../supabase/functions/_shared/isabella-down";
import { ERROR_WINDOW_MS } from "@/lib/isabellaHealth";
import { NOTIFY_EVENTS } from "../../supabase/functions/_shared/notify-staff";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the event", () => {
  const at = new Date("2026-09-08T14:37:02.000Z");

  it("is an event type the router accepts", () => {
    // A type the router refuses is a 400 where a notification should have been.
    expect(NOTIFY_EVENTS).toContain(isabellaDownEvent("boom", at).type);
  });

  it("names the likeliest cause, because it was the actual cause", () => {
    const event = isabellaDownEvent("401 {\"error\":\"credit balance too low\"}", at);
    expect(event.title).toBe("Isabella is failing");
    expect(event.body).toContain("credit balance too low");
    // Fixable in two minutes by somebody holding a phone — if the message says where to look.
    expect(event.body).toContain("Anthropic balance");
    expect(event.link).toBe("/admin/isabella");
  });

  it("says something when there is no error message at all", () => {
    // `ai_runs.error_message` is nullable, and "Isabella is failing: undefined" is the kind of
    // notification that gets ignored the second time it arrives.
    expect(isabellaDownEvent("", at).body).toContain("no error message recorded");
  });

  it("keeps the title to one line, however long the API's answer is", () => {
    const long = `Anthropic API error: ${"x".repeat(400)}\nstack line\nanother`;
    const body = isabellaDownEvent(long, at).body;
    expect(body).not.toContain("stack line");
    expect(summarise(long).length).toBeLessThanOrEqual(160);
    expect(summarise("first\nsecond")).toBe("first");
  });
});

describe("one per hour, and the hour is not arbitrary", () => {
  it("gives every failure in the same clock hour the same key", () => {
    const keys = [
      "2026-09-08T14:00:00.000Z",
      "2026-09-08T14:00:01.000Z",
      "2026-09-08T14:37:02.000Z",
      "2026-09-08T14:59:59.999Z",
    ].map((iso) => hourlyKey(new Date(iso)));

    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("isabella.down:hour:2026-09-08T14");
  });

  it("and a different key in the next hour, so a continuing outage keeps saying so", () => {
    // Silence after the first notification would be worse than the original defect: an outage
    // that stops being mentioned reads as an outage that ended.
    expect(hourlyKey(new Date("2026-09-08T15:00:00.000Z"))).not.toBe(
      hourlyKey(new Date("2026-09-08T14:59:59.999Z")),
    );
  });

  it("turns a whole day of failures into 24 notifications, not thousands", () => {
    const keys = new Set<string>();
    for (let minute = 0; minute < 60 * 24; minute++) {
      keys.add(hourlyKey(new Date(Date.UTC(2026, 8, 8, 0, minute))));
    }
    expect(keys.size).toBe(24);
  });

  it("matches the window the health pill turns red on", () => {
    /*
      THE MIRROR THAT KEEPS THE TWO HONEST. src/lib/isabellaHealth.ts calls the assistant FAILING
      when there is at least one failed run in the last `ERROR_WINDOW_MS`. An hourly key is
      therefore exactly "the pill has turned red and stayed red". If somebody widens that window
      to six hours, this goes red rather than the notification quietly disagreeing with the
      dashboard for the rest of its life.
    */
    expect(DEDUPE_WINDOW_MS).toBe(ERROR_WINDOW_MS);
  });
});

describe("raising it never breaks the caller", () => {
  const post = (impl: () => Promise<{ ok: boolean; status: number }>) => {
    const calls: unknown[] = [];
    return {
      calls,
      post: (body: unknown) => {
        calls.push(body);
        return impl();
      },
    };
  };

  it("posts the event with the admin audience", async () => {
    const spy = post(async () => ({ ok: true, status: 200 }));
    const outcome = await reportIsabellaDown("credit balance too low", {
      post: spy.post,
      now: () => new Date("2026-09-08T14:00:00.000Z"),
    });

    expect(outcome).toBe("sent");
    expect(spy.calls).toHaveLength(1);
    const body = spy.calls[0] as { event: { type: string; idempotencyKey: string }; audience: { roles: string[] } };
    expect(body.event.type).toBe("isabella.down");
    expect(body.event.idempotencyKey).toBe("isabella.down:hour:2026-09-08T14");
    // An operator cannot top up an Anthropic balance.
    expect(body.audience.roles.sort()).toEqual(["admin", "super_admin"]);
  });

  it("reports a refusal instead of throwing it", async () => {
    const spy = post(async () => ({ ok: false, status: 403 }));
    expect(await reportIsabellaDown("boom", { post: spy.post })).toBe("failed");
  });

  it("SWALLOWS a thrown error — the caller is already handling an AI failure", async () => {
    /*
      This is the load-bearing one. The caller is Isabella's own failure path: it has caught an
      API error and is about to answer the member. An exception raised HERE would replace a
      handled degradation with an unhandled 500, so a notification that cannot be sent must cost
      nothing.
    */
    const spy = post(async () => {
      throw new Error("network down");
    });
    expect(await reportIsabellaDown("boom", { post: spy.post })).toBe("errored");
  });
});

describe("it fires from the place that records the failure", () => {
  const aiRun = stripComments(read("supabase/functions/ai-run/index.ts"));

  it("goes through ONE funnel, at all three failure sites", () => {
    // Two chat paths (through recordChatRun) and the agent/event branch's direct update. A
    // fourth added later that notified nobody would be the original defect again.
    expect(aiRun.match(/status: "failed"/g) ?? []).toHaveLength(3);
    expect(aiRun.match(/notifyIsabellaDown\(/g) ?? []).toHaveLength(3);
    expect(aiRun.match(/reportIsabellaDown\(/g) ?? []).toHaveLength(1);
  });

  it("records the run BEFORE notifying, so the two cannot disagree", () => {
    const fn = aiRun.slice(aiRun.indexOf("async function recordChatRun("));
    const insert = fn.indexOf('from("ai_runs").insert');
    const notify = fn.indexOf("notifyIsabellaDown");
    expect(insert).toBeGreaterThan(-1);
    expect(notify).toBeGreaterThan(insert);
  });

  it("notifies only on a failure, never on a completed run", () => {
    expect(aiRun).toMatch(/if \(fields\.status === "failed" && fields\.notify\)/);
  });

  it("reaches the router with the service-role key", () => {
    const funnel = aiRun.slice(
      aiRun.indexOf("async function notifyIsabellaDown("),
      aiRun.indexOf("async function recordChatRun("),
    );
    expect(funnel).toContain("/functions/v1/notify-staff");
    expect(funnel).toMatch(/Authorization: `Bearer \$\{serviceKey\}`/);
    // notify-staff admits the service role or an admin JWT and nothing else, so a missing
    // bearer here is a 401 and a silent non-notification.
    expect(funnel).toContain("serviceKey");
  });

  it("does not log the member's message, or anything else Isabella was handling", () => {
    const funnel = aiRun.slice(
      aiRun.indexOf("async function notifyIsabellaDown("),
      aiRun.indexOf("async function recordChatRun("),
    );
    // The error text goes to admins. A chat message can carry anything a member typed, and a
    // notification is not the place to copy it.
    expect(funnel).not.toMatch(/currentMessage|conversationHistory|input_context/);
  });
});
