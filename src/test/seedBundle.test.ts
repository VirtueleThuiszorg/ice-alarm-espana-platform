// @vitest-environment node
//
// THE HELD SEED BUNDLE — rows, and the claims they are allowed to make.
//
// A seed migration is content, and content is the part no compiler checks. These assertions are
// the ones that would matter if a row were wrong in production, in the order they would matter:
//
//   1. the `tested` message must not tell a member they are protected — readiness is TWO
//      conditions (D4) and a member with no emergency contacts is not covered. A false all-clear
//      is the failure READINESS_MODEL.md §1-A exists to prevent, and by SMS it is worse than on
//      a screen: there is no page to correct it on;
//   2. no template may use a placeholder `renderTemplate` cannot fill;
//   3. every language must have every row, or a Dutch member silently gets nothing —
//      `skipped_no_template` is recorded, but the member notices only the silence;
//   4. no operator script may give medical advice, triage an emergency, promise a member can
//      test their own pendant, or carry a phone number that will go stale.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
  join(process.cwd(), "supabase/migrations/20260907120000_wp3_wp6_seed_bundle.sql"),
  "utf8",
);

/** Everything outside the `--` comment lines: the rows, not the reasoning about them. */
const ROWS = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

const LOCALES = ["en", "es", "nl"];

// ── canned replies ──────────────────────────────────────────────────────────────────────────
const cannedRows = [...ROWS.matchAll(/\('(\/[a-z-]+)',\s*'(en|es|nl)',/g)].map((m) => ({
  shortcut: m[1],
  locale: m[2],
}));

describe("the canned replies", () => {
  it("are there at all — an assertion over an empty list proves nothing", () => {
    expect(cannedRows.length).toBeGreaterThanOrEqual(15);
  });

  it("exist in all three languages for every shortcut", () => {
    const byShortcut = new Map<string, Set<string>>();
    for (const row of cannedRows) {
      const set = byShortcut.get(row.shortcut) ?? new Set<string>();
      set.add(row.locale);
      byShortcut.set(row.shortcut, set);
    }
    for (const [shortcut, locales] of byShortcut) {
      expect([...locales].sort(), shortcut).toEqual(LOCALES);
    }
  });

  it("include the two an operator needs when a conversation turns clinical", () => {
    const shortcuts = new Set(cannedRows.map((r) => r.shortcut));
    expect(shortcuts.has("/no-medical")).toBe(true);
    expect(shortcuts.has("/emergency")).toBe(true);
  });

  it("send an emergency to 112 in every language", () => {
    const emergency = ROWS.split("('/emergency'").slice(1);
    expect(emergency).toHaveLength(3);
    for (const row of emergency) expect(row.slice(0, 400)).toContain("112");
  });

  it("carry NO phone number of our own — that lives in system_settings and goes stale here", () => {
    // 112 is the emergency number and is deliberately allowed; anything that looks like one of
    // ours is not. `950 473 199` is the real 24-hour line: correct today, wrong the day it moves.
    expect(ROWS).not.toMatch(/\+?34[\s\d]{9}/);
    expect(ROWS).not.toContain("950 473 199");
  });

  it("never promise a member can test their own pendant — Q1 is operator-confirmed", () => {
    // Checked PER LANGUAGE. An alternation over all three joined together passes while two of
    // them are right and the third tells the member to press the button and be done.
    const chunks = ROWS.split("('/pendant-test'").slice(1).map((c) => c.slice(0, 700));
    expect(chunks).toHaveLength(3);
    const promises = [/We will call/, /Le llamaremos/, /Wij bellen/];
    chunks.forEach((chunk, i) => expect(chunk, `pendant-test #${i}`).toMatch(promises[i]));

    // And the negative: nothing here may describe the test as something the member finishes.
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/complete the test|completar la prueba|de test.{0,20}(afronden|voltooien)/i);
    }
  });
});

// ── notification templates ──────────────────────────────────────────────────────────────────
const templateRows = [...ROWS.matchAll(
  /\('(fulfilment\.[a-z_]+\.[a-z]+)',\s*'(sms|email|whatsapp)',\s*'(en|es|nl)',/g,
)].map((m) => ({ eventKey: m[1], channel: m[2], locale: m[3] }));

describe("the notification templates", () => {
  it("are there at all", () => {
    expect(templateRows.length).toBeGreaterThanOrEqual(30);
  });

  it("use the event key shape the dispatcher builds", () => {
    // `eventKeyFor()` is `fulfilment.${transition}.${audience}`. A key that does not match is a
    // row no dispatcher will ever find, and it fails as `skipped_no_template` — silently.
    for (const row of templateRows) {
      expect(row.eventKey, row.eventKey).toMatch(
        /^fulfilment\.(allocated|programmed|dispatched|delivered|tested|cancelled)\.(member|payer)$/,
      );
    }
  });

  it("are MEMBER templates only, because every payer send is refused today", () => {
    expect(templateRows.filter((r) => r.eventKey.endsWith(".payer"))).toEqual([]);
  });

  it("cover all three channels and all three languages for every event", () => {
    const byEvent = new Map<string, Set<string>>();
    for (const row of templateRows) {
      const set = byEvent.get(row.eventKey) ?? new Set<string>();
      set.add(`${row.channel}:${row.locale}`);
      byEvent.set(row.eventKey, set);
    }
    for (const [eventKey, combos] of byEvent) {
      for (const channel of ["sms", "email", "whatsapp"]) {
        for (const locale of LOCALES) {
          expect(combos.has(`${channel}:${locale}`), `${eventKey} ${channel} ${locale}`).toBe(true);
        }
      }
    }
  });

  it("use only the placeholders `renderTemplate` is given", () => {
    // An unknown placeholder is rendered AS IS rather than blanked, so a typo reaches a member
    // as `{{nombre}}`. That is the right runtime behaviour and the wrong thing to ship.
    const allowed = new Set(["name", "order_number", "member_name"]);
    const used = new Set([...ROWS.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
    for (const placeholder of used) expect(allowed.has(placeholder), placeholder).toBe(true);
  });

  it("DO NOT tell a tested member they are protected — readiness is two conditions", () => {
    const tested = ROWS.split("fulfilment.tested.member").slice(1).join("\n");
    expect(tested).not.toMatch(/protected|protegid|beschermd/i);
    expect(tested).not.toMatch(/now monitored|ya está monitoriz|nu bewaakt/i);
    // What it says instead: the call worked.
    expect(tested).toMatch(/test call worked|llamada de prueba ha funcionado|testoproep is gelukt/);
  });
});

// ── the migration itself ────────────────────────────────────────────────────────────────────
describe("the migration", () => {
  it("overwrites nothing — a hand-edited row must win over a redeploy", () => {
    const inserts = [...ROWS.matchAll(/INSERT INTO/g)].length;
    const guards = [...ROWS.matchAll(/ON CONFLICT[\s\S]{0,60}?DO NOTHING/g)].length;
    expect(guards).toBe(inserts);
  });

  it("carries a rollback, and admits the one line that cannot be rolled back", () => {
    expect(SQL).toContain("ROLLBACK");
    // `ALTER TYPE … ADD VALUE` has no inverse in Postgres. Saying so beats a rollback comment
    // that quietly does not cover it.
    expect(SQL).toMatch(/CANNOT be dropped/);
  });

  it("adds `resume` to member_action, which WP7 W7 recorded as the gap", () => {
    expect(ROWS).toContain("ALTER TYPE public.member_action ADD VALUE IF NOT EXISTS 'resume'");
  });
});
