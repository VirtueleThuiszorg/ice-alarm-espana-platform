/**
 * A ROUTING KEY IS NOT A TITLE, ON ANY SURFACE OR IN ANY LANGUAGE.
 *
 * `notification_log` has no `title` column — it has `event_type` and `message` — and
 * `useNotifications` filled the gap with `title: row.event_type`. So the bell, the admin
 * notifications page and the admin mobile home all rendered `shift.no_show` where a sentence
 * belongs, for every event type, since the day each was written.
 *
 * The three things worth pinning are the three ways this comes back:
 *
 *   1. a surface goes back to reading a `title` off the row (there is none to read now, but a
 *      future column called `title` holding a key would look plausible);
 *   2. a new event type is added to the router and nobody writes a title for it;
 *   3. a title exists in English and not in Spanish or Dutch, which is how a staff member in
 *      Almería ends up reading routing keys while Lee reads sentences.
 *
 * (2) is answered by construction rather than here: this module reads `EVENT_SPECS`, and
 * `notifyMatrix.ts` carries a compile-time ratchet that fails the BUILD when an event joins
 * `NOTIFY_EVENTS` without a spec. The test below still walks the list, because the ratchet
 * proves a spec exists and not that three locales have it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NOTIFY_EVENTS } from "@/lib/notifyMatrix";
import {
  humaniseEventType,
  notificationBody,
  notificationEventKey,
  notificationTitle,
  TITLED_EVENT_TYPES,
} from "@/lib/notificationTitles";

const ROOT = process.cwd();
const locale = (name: string) =>
  JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${name}.json`), "utf8")) as Record<
    string,
    Record<string, Record<string, { title?: string; body?: string }>>
  >;

const LOCALES = { en: locale("en"), es: locale("es"), nl: locale("nl") };

/** The real i18next behaviour the components rely on: the key if present, else the fallback. */
const translatorFor = (name: keyof typeof LOCALES) => (key: string, fallback: string) => {
  const parts = key.split(".");
  let node: unknown = LOCALES[name];
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return fallback;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : fallback;
};

describe("every event the router emits has a title, in all three languages", () => {
  it("covers every entry in NOTIFY_EVENTS", () => {
    // The router's list is the definition of "emitted"; nothing else decides it.
    expect([...TITLED_EVENT_TYPES].sort()).toEqual([...NOTIFY_EVENTS].sort());
  });

  for (const name of ["en", "es", "nl"] as const) {
    it(`${name}: a real title and body for every event`, () => {
      for (const event of NOTIFY_EVENTS) {
        const entry = LOCALES[name].notifications?.event?.[notificationEventKey(event)];
        expect(entry, `${name} is missing notifications.event.${notificationEventKey(event)}`).toBeTruthy();
        expect(entry.title?.trim().length, `${name} ${event} title`).toBeGreaterThan(0);
        expect(entry.body?.trim().length, `${name} ${event} body`).toBeGreaterThan(0);
        // The thing this whole change is about: the translation must not BE the key.
        expect(entry.title).not.toBe(event);
        expect(entry.title).not.toContain(".");
      }
    });
  }

  for (const name of ["en", "es", "nl"] as const) {
    it(`${name}: no rendered title is ever a raw key`, () => {
      const t = translatorFor(name);
      for (const event of NOTIFY_EVENTS) {
        const title = notificationTitle(event, t);
        expect(title).not.toBe(event);
        expect(title.length).toBeGreaterThan(0);
        // A key is recognisable by its shape: lowercase words joined by dots, no spaces.
        expect(title, `${name} ${event}`).not.toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/);
      }
    });
  }

  it("the Spanish and Dutch titles are not just the English ones", () => {
    // A locale file filled by copying English passes every check above and helps nobody.
    const en = translatorFor("en");
    const es = translatorFor("es");
    const nl = translatorFor("nl");
    const sameAsEnglish = NOTIFY_EVENTS.filter(
      (e) => notificationTitle(e, es) === notificationTitle(e, en) || notificationTitle(e, nl) === notificationTitle(e, en),
    );
    expect(sameAsEnglish).toEqual([]);
  });
});

describe("an event type with no spec at all", () => {
  /*
    `notification_log` keeps history and `NOTIFY_EVENTS` is today's registry, so a row can carry a
    type that was removed. That row still has to read as something.
  */
  const t = translatorFor("en");

  it("is humanised, never printed as a key", () => {
    expect(notificationTitle("member.moved_house", t)).toBe("Member · Moved house");
    expect(humaniseEventType("shift.no_show")).toBe("Shift · No show");
    expect(humaniseEventType("legacy")).toBe("Legacy");
    expect(humaniseEventType("")).toBe("Notification");
  });

  it("never returns a string that looks like a key", () => {
    for (const odd of ["a.b", "x_y.z_w", "weird..type", "UPPER.CASE"]) {
      expect(notificationTitle(odd, t)).not.toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/);
    }
  });
});

describe("the body under the title", () => {
  const t = translatorFor("en");

  it("drops the title the router composed into the message", () => {
    // `notify-staff` stores `${title} — ${body}`, so rendering the mapped title above the whole
    // message printed the event's name twice, in two different wordings.
    expect(notificationBody("⚠️ Staff No-Show — Travis Nelison, night shift", "shift.no_show", t)).toBe(
      "Travis Nelison, night shift",
    );
  });

  it("drops only the FIRST separator — a body may contain a dash of its own", () => {
    expect(notificationBody("Title — one — two", "test", t)).toBe("one — two");
  });

  it("keeps the channel marker on a pre-migration row", () => {
    // The runtime moves the channel into the text when `channel` has no column yet, and a reader
    // of an old row still needs to know whether it was a bell entry or an SMS attempt.
    expect(notificationBody("[sms] Title — Body", "test", t)).toBe("[sms] Body");
  });

  it("falls back to what the event MEANS when the message is empty", () => {
    expect(notificationBody("", "shift.no_show", t)).toBe("Their shift started and they are not on duty.");
    expect(notificationBody(null, "shift.no_show", t)).toBe("Their shift started and they are not on duty.");
  });

  it("keeps a message that is only a title rather than rendering nothing", () => {
    expect(notificationBody("Something happened", "test", t)).toBe("Something happened");
  });
});

describe("the surfaces read the mapping, not the row", () => {
  const files = [
    "src/components/notifications/NotificationBell.tsx",
    "src/pages/admin/NotificationsPage.tsx",
    "src/components/admin/dashboard/AdminMobileHome.tsx",
  ];

  it("no surface renders notification.title or a bare notification.type", () => {
    for (const file of files) {
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(src, file).toContain("notificationTitle(");
      expect(src, file).not.toMatch(/\{notification\.title\}/);
      // The admin page rendered the raw key a SECOND time, in a badge beside the title.
      expect(src, file).not.toMatch(/\{notification\.type\}/);
    }
  });

  it("the hook no longer invents a title from the event type", () => {
    const hook = readFileSync(join(ROOT, "src/hooks/useNotifications.ts"), "utf8");
    expect(hook).not.toMatch(/title:\s*\(row\.event_type/);
  });
});
