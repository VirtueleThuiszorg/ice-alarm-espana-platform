// @vitest-environment node
//
// THE SCREEN'S CLAIMS, AND WHY THEY HAVE TO BE TESTED SEPARATELY FROM THE ROUTER.
//
// A switch that changes nothing is worse than no switch: somebody turns SMS on for paid sales,
// nothing arrives, and the conclusion is that notifications are broken. Worse still is a screen
// that says "on" over a router that will not send — the UI then becomes the reason nobody
// investigates.
//
// So every cell state is a pure function of the same four inputs the router uses, in the router's
// own order, and these tests assert the two agree. The one place they MUST NOT differ is the four
// events that say the safety machinery itself has failed: the router ignores both tables for
// them, and a screen rendering them as switches would be a lie about what a switch does — in the
// worst possible place for one.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALWAYS_LOUD,
  CHANNEL_LABELS,
  EVENT_SPECS,
  GROUP_LABELS,
  GROUP_ORDER,
  NOTIFY_CHANNELS,
  NOTIFY_EVENTS,
  cellState,
  channelLiveness,
  isAlwaysOn,
  isCellEditable,
  livenessFor,
  matrixView,
  prefEnabled,
  routeEnabled,
  specsByGroup,
  wouldReach,
  type PrefRow,
  type RouteRow,
} from "@/lib/notifyMatrix";
import { planNotifications } from "../../supabase/functions/_shared/notify-staff";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ALL_LIVE = livenessFor({ flags: { sms: true, whatsapp: true, push: true, email: true }, proven: { sms: true, whatsapp: true, push: true, email: true } });
const NONE_LIVE = livenessFor({ flags: {} });

const route = (event: string, channel: string, enabled = true): RouteRow => ({ event_type: event, channel, enabled });
const pref = (staff: string, event: string, channel: string, enabled = true): PrefRow => ({ staff_id: staff, event_type: event, channel, enabled });

describe("every event is on the screen", () => {
  it("has a label and a plain-English detail for all nineteen", () => {
    expect(EVENT_SPECS).toHaveLength(NOTIFY_EVENTS.length);
    for (const type of NOTIFY_EVENTS) {
      const spec = EVENT_SPECS.find((s) => s.event === type);
      expect(spec, type).toBeTruthy();
      expect(spec!.label.length, type).toBeGreaterThan(8);
      // The words somebody would use about it — not the event name with the dot removed.
      expect(spec!.detail.length, type).toBeGreaterThan(20);
      expect(spec!.detail, type).not.toBe(spec!.label);
    }
  });

  it("groups them all, with no row stranded outside a rendered group", () => {
    /*
      The ratchet in the module is compile-time (a new event stops the build until it has a
      spec). This is the runtime half: a spec whose group is not in GROUP_ORDER would type-check
      and then simply not render — the event would be invisible on the screen and switchable by
      nobody, which is the silence the router exists to prevent.
    */
    const grouped = GROUP_ORDER.flatMap((g) => specsByGroup(g));
    expect(grouped).toHaveLength(EVENT_SPECS.length);
    for (const group of GROUP_ORDER) expect(GROUP_LABELS[group], group).toBeTruthy();
  });

  it("labels every channel", () => {
    for (const channel of NOTIFY_CHANNELS) expect(CHANNEL_LABELS[channel], channel).toBeTruthy();
  });
});

describe("the four are locked, not switched", () => {
  it("is exactly the router's ALWAYS_LOUD list", () => {
    // One list, in the module the router uses. Two copies drift, and this one decides whether
    // the alarm that says the SOS ladder is broken can be silenced from a settings page.
    expect(EVENT_SPECS.filter((s) => isAlwaysOn(s.event)).map((s) => s.event).sort()).toEqual(
      [...ALWAYS_LOUD].sort(),
    );
    expect(ALWAYS_LOUD).toHaveLength(4);
  });

  it("all four sit in the 'safety' group, which the screen labels as always-sent", () => {
    for (const event of ALWAYS_LOUD) {
      expect(EVENT_SPECS.find((s) => s.event === event)!.group, event).toBe("safety");
    }
    expect(specsByGroup("safety").map((s) => s.event).sort()).toEqual([...ALWAYS_LOUD].sort());
  });

  it("is not editable, even by an admin", () => {
    for (const event of ALWAYS_LOUD) {
      expect(isCellEditable(event, true), event).toBe(false);
    }
    expect(isCellEditable("sale.paid", true)).toBe(true);
    // ...and nobody edits anything without permission.
    expect(isCellEditable("sale.paid", false)).toBe(false);
  });

  it("reads always_on with EVERY route and preference off", () => {
    for (const event of ALWAYS_LOUD) {
      for (const channel of NOTIFY_CHANNELS) {
        expect(cellState(event, channel, [], ALL_LIVE), `${event}/${channel}`).toBe("always_on");
      }
    }
  });

  it("but NOT over a dead channel — that would be the worst lie on the screen", () => {
    /*
      Gate 1 still applies to the four: an unconfigured transport cannot physically send, and
      "always" printed over a channel with no credentials would tell somebody the SOS-ladder
      alarm is covered when nothing can deliver it.
    */
    for (const event of ALWAYS_LOUD) {
      expect(cellState(event, "sms", [], NONE_LIVE), event).toBe("on_but_dead");
    }
  });
});

describe("a dark cell says which of the three reasons", () => {
  it("your switch, reported first because it is the fix", () => {
    const state = channelLiveness("sms", { flags: { sms: false }, visible: { twilioAccount: false } });
    expect(state.live).toBe(false);
    expect(state.reason).toBe("switch_off");
    // Telling somebody their Twilio number is missing when the channel is off sends them to the
    // wrong screen — so the switch outranks the credentials in the message, as in the router.
    expect(state.detail).toMatch(/switched off/i);
  });

  it("missing credentials, and where they live", () => {
    const sms = channelLiveness("sms", { flags: { sms: true }, visible: { twilioAccount: true, smsNumber: false } });
    expect(sms).toMatchObject({ live: false, reason: "no_credentials" });
    expect(sms.detail).toContain("Twilio");

    const push = channelLiveness("push", { flags: { push: true }, proven: { push: false } });
    expect(push).toMatchObject({ live: false, reason: "no_credentials" });
    // Named, because "not configured" sends somebody hunting.
    expect(push.detail).toContain("FIREBASE_SERVICE_ACCOUNT");
  });

  it("unproven — switched on, credentials server-side, not a failure", () => {
    /*
      Push and email are decided by Edge secrets the browser cannot read. Guessing "off" would
      show a red badge on a working channel; guessing "on" would show green over silence. The
      third state is the honest one, and the test button resolves it by asking the function that
      does the sending.
    */
    const state = channelLiveness("email", { flags: { email: true } });
    expect(state).toMatchObject({ live: false, reason: "unproven" });
    expect(state.detail).toMatch(/test/i);
  });

  it("and the sender's answer outranks every guess here", () => {
    const guessedDead = { flags: { whatsapp: true }, visible: { twilioAccount: true, whatsappNumber: false } };
    expect(channelLiveness("whatsapp", guessedDead).live).toBe(false);
    expect(channelLiveness("whatsapp", { ...guessedDead, proven: { whatsapp: true } }).live).toBe(true);

    const guessedLive = { flags: { sms: true }, visible: { twilioAccount: true, smsNumber: true } };
    expect(channelLiveness("sms", guessedLive).live).toBe(true);
    expect(channelLiveness("sms", { ...guessedLive, proven: { sms: false } }).live).toBe(false);
  });

  it("never claims a channel is live just because the switch is on", () => {
    for (const channel of NOTIFY_CHANNELS) {
      const state = channelLiveness(channel, { flags: { [channel]: true } });
      if (channel === "sms" || channel === "whatsapp") {
        // No visible credentials either way — unknown, not live.
        expect(state.live, channel).toBe(false);
      } else {
        expect(state.live, channel).toBe(false);
      }
    }
  });
});

describe("an absent row reads as off — the same way the router reads it", () => {
  it("for routes", () => {
    expect(routeEnabled([], "sale.paid", "sms")).toBe(false);
    expect(routeEnabled([route("sale.paid", "sms", false)], "sale.paid", "sms")).toBe(false);
    expect(routeEnabled([route("sale.paid", "sms")], "sale.paid", "sms")).toBe(true);
    // Not the wrong channel's row.
    expect(routeEnabled([route("sale.paid", "sms")], "sale.paid", "email")).toBe(false);
  });

  it("for preferences", () => {
    expect(prefEnabled([], "s1", "sale.paid", "sms")).toBe(false);
    expect(prefEnabled([pref("s1", "sale.paid", "sms")], "s2", "sale.paid", "sms")).toBe(false);
    expect(prefEnabled([pref("s1", "sale.paid", "sms")], "s1", "sale.paid", "sms")).toBe(true);
  });

  it("and the four cell states are distinguishable", () => {
    const routes = [route("sale.paid", "sms"), route("lead.new", "sms", false)];
    expect(cellState("sale.paid", "sms", routes, ALL_LIVE)).toBe("on");
    expect(cellState("lead.new", "sms", routes, ALL_LIVE)).toBe("off");
    expect(cellState("sale.paid", "sms", routes, NONE_LIVE)).toBe("on_but_dead");
    expect(cellState("lead.new", "sms", routes, NONE_LIVE)).toBe("off_and_dead");
  });
});

describe("would this person actually be told", () => {
  const routes = [route("sale.paid", "email"), route("sale.paid", "sms")];
  const prefs = [pref("s1", "sale.paid", "email")];
  const base = { routes, prefs, staffId: "s1", liveness: ALL_LIVE };

  it("names the gate that stops it, in the router's order", () => {
    expect(wouldReach("sale.paid", "email", base)).toEqual({ reach: true });
    // Company policy says yes, they said no.
    expect(wouldReach("sale.paid", "sms", base)).toEqual({ reach: false, blockedBy: "pref" });
    // They said nothing and policy says nothing.
    expect(wouldReach("lead.new", "email", base)).toEqual({ reach: false, blockedBy: "route" });
    // The channel outranks both — the fix is elsewhere.
    expect(wouldReach("sale.paid", "email", { ...base, liveness: NONE_LIVE })).toEqual({
      reach: false,
      blockedBy: "channel",
    });
  });

  it("says yes for the four regardless of both tables", () => {
    for (const event of ALWAYS_LOUD) {
      expect(wouldReach(event, "sms", { routes: [], prefs: [], staffId: "s1", liveness: ALL_LIVE }), event).toEqual({
        reach: true,
      });
    }
  });
});

describe("the screen and the router cannot disagree", () => {
  /*
    THE LOAD-BEARING TEST. `wouldReach` is a second implementation of the router's gate order,
    written for a UI. A second implementation drifts — so this drives both over the whole product
    of events × channels × switch states and asserts they agree on every one.
  */
  const recipient = {
    staffId: "s1",
    userId: "u1",
    firstName: "Lee",
    role: "super_admin",
    email: "lee@example.com",
    phone: "+34600000000",
    whatsappNumber: "+34600000000",
    pushTokens: [{ token: "t1", platform: "ios" }],
  };

  it("agrees with planNotifications for every event, channel and combination of switches", () => {
    const flags = { sms: true, whatsapp: true, push: true, email: true };
    const configured = { sms: true, whatsapp: true, push: true, email: true };
    let compared = 0;

    for (const spec of EVENT_SPECS) {
      for (const channel of NOTIFY_CHANNELS) {
        for (const routeOn of [true, false]) {
          for (const prefOn of [true, false]) {
            const routes = routeOn ? [route(spec.event, channel)] : [];
            const prefs = prefOn ? [pref("s1", spec.event, channel)] : [];

            const planned = planNotifications({
              event: { type: spec.event, title: "t", body: "b" },
              recipients: [recipient],
              routes,
              prefs,
              flags,
              configured,
            });
            const decision = planned.find((p) => p.channel === channel)!;
            const screen = wouldReach(spec.event, channel, {
              routes,
              prefs,
              staffId: "s1",
              liveness: livenessFor({ flags, proven: configured }),
            });

            expect(screen.reach, `${spec.event}/${channel} route=${routeOn} pref=${prefOn}`).toBe(
              decision.send,
            );
            compared++;
          }
        }
      }
    }

    // 19 events × 4 channels × 2 × 2.
    expect(compared).toBe(EVENT_SPECS.length * NOTIFY_CHANNELS.length * 4);
  });

  it("agrees about a channel that is switched off, for every event", () => {
    const flags = { sms: false, whatsapp: false, push: false, email: false };
    for (const spec of EVENT_SPECS) {
      const planned = planNotifications({
        event: { type: spec.event, title: "t", body: "b" },
        recipients: [recipient],
        routes: NOTIFY_CHANNELS.map((c) => route(spec.event, c)),
        prefs: NOTIFY_CHANNELS.map((c) => pref("s1", spec.event, c)),
        flags,
        configured: { sms: true, whatsapp: true, push: true, email: true },
      });
      for (const channel of NOTIFY_CHANNELS) {
        expect(planned.find((p) => p.channel === channel)!.send, `${spec.event}/${channel}`).toBe(false);
        expect(
          wouldReach(spec.event, channel, { routes: [], prefs: [], staffId: "s1", liveness: livenessFor({ flags }) })
            .reach,
        ).toBe(false);
      }
    }
  });
});

describe("only an admin may change it, and every change is audited", () => {
  const hook = stripComments(read("src/hooks/useNotificationMatrix.ts"));
  const page = read("src/pages/admin/SettingsPage.tsx");
  const matrix = stripComments(read("src/components/admin/settings/NotificationMatrix.tsx"));

  it("the page passes canEdit from the staff role, not from being on /admin", () => {
    expect(page).toContain("isAdminRole(staffRole)");
    expect(page).toMatch(/<NotificationMatrix canEdit=\{canEditNotifications\} \/>/);
  });

  it("every switch in the matrix is disabled without it", () => {
    // Three switch groups: the channel flags, the routes, the per-staff prefs. All three.
    const switches = matrix.match(/disabled=\{!canEdit \|\| isSaving\}/g) ?? [];
    expect(switches.length).toBe(3);
    expect(matrix).not.toMatch(/<Switch(?![\s\S]{0,200}?disabled)/);
  });

  it("writes an activity_logs row for each of the three kinds of change", () => {
    const audits = hook.match(/await logActivity\(\{/g) ?? [];
    expect(audits).toHaveLength(3);
    // Old AND new value: "who turned off the paid-sale WhatsApp" needs both to be answerable.
    expect(hook.match(/oldValues: \{ enabled:/g) ?? []).toHaveLength(3);
    expect(hook.match(/newValues: \{ enabled:/g) ?? []).toHaveLength(3);
    // Greppable ids rather than opaque uuids.
    expect(hook).toContain("`notification_routes:${event}:${channel}`");
    expect(hook).toContain("`staff_notification_prefs:${staffId}:${event}:${channel}`");
  });

  it("audits AFTER the write succeeds, never before", () => {
    // An audit row for a change that failed is worse than none: it is evidence of something
    // that did not happen.
    for (const mutation of ["flagMutation", "routeMutation", "prefMutation"]) {
      const block = hook.slice(hook.indexOf(`const ${mutation} =`), hook.indexOf("onSuccess", hook.indexOf(`const ${mutation} =`)));
      expect(block.indexOf("if (error) throw error;"), mutation).toBeGreaterThan(-1);
      expect(block.indexOf("if (error) throw error;"), mutation).toBeLessThan(block.indexOf("logActivity"));
    }
  });

  it("writes to the tables the router reads, and upserts on their unique keys", () => {
    expect(hook).toContain('from("notification_routes")');
    expect(hook).toContain('from("staff_notification_prefs")');
    // The unique constraints the migration declares. A wrong onConflict is a duplicate-key error
    // on every second toggle.
    expect(hook).toContain('onConflict: "event_type,channel"');
    expect(hook).toContain('onConflict: "staff_id,event_type,channel"');
    expect(hook).toContain('onConflict: "key"');
  });

  it("reports a failed write instead of leaving a switch looking saved", () => {
    expect(hook.match(/onError: \(e: Error\) => toast\.error/g) ?? []).toHaveLength(3);
  });

  it("a test notification goes to ONE person, not to the company", () => {
    expect(hook).toContain("audience: { staffIds: [staffId] }");
    // ...and it never claims success when nothing was sent.
    expect(hook).toContain("Nothing was sent");
  });

  it("renders the held-migration state rather than an empty grid", () => {
    /*
      "NOTHING IS ROUTED ANYWHERE" IS A TRUE AND FRIGHTENING STATEMENT, and it must not be what a
      missing table looks like — nor what a failed read looks like. Both honest answers are
      actionable ("apply the migration", "this could not be read"); an empty grid is not.

      Executed, because the first version of this test asserted the component CONTAINED the word
      `schemaMissing` — which survives replacing the branch with `if (false)`.
    */
    expect(matrixView({ isLoading: true, error: null, schemaMissing: false })).toBe("loading");
    expect(matrixView({ isLoading: false, error: null, schemaMissing: true })).toBe("schema_missing");
    expect(matrixView({ isLoading: false, error: new Error("nope"), schemaMissing: false })).toBe("error");
    expect(matrixView({ isLoading: false, error: null, schemaMissing: false })).toBe("ready");

    // A read that failed for some other reason tells us nothing about whether the tables exist,
    // so `error` outranks `schema_missing` — never the reverse.
    expect(matrixView({ isLoading: false, error: new Error("nope"), schemaMissing: true })).toBe("error");
    // ...and loading outranks both, or a first paint would flash "not applied yet".
    expect(matrixView({ isLoading: true, error: new Error("nope"), schemaMissing: true })).toBe("loading");

    // The component switches on that decision, and names the migration it is waiting for.
    expect(matrix).toMatch(/const view = matrixView\(/);
    expect(matrix).toMatch(/if \(view === "schema_missing"\)/);
    expect(matrix).toContain("20260909120000_notify_staff.sql");
    // The two PostgREST codes for "no such table" — the hook's own detection.
    expect(hook).toContain("42P01");
    expect(hook).toContain("PGRST205");
  });

  it("the staff view is read-only, with the reason", () => {
    const staffView = read("src/components/notifications/MyNotificationPrefs.tsx");
    expect(staffView).not.toContain("<Switch");
    expect(staffView).not.toContain(".upsert(");
    expect(staffView).toMatch(/Read-only/);
    // And it distinguishes "nobody gets this" from "you switched it off".
    expect(staffView).toContain("not sent to anyone");
    expect(staffView).toContain("off for you");
  });
});
