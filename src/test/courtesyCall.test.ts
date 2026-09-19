import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CALL_CHECKLIST,
  CALL_OUTCOMES,
  OUTCOME_OPTIONS,
  REACHED_OUTCOMES,
  formatCallDuration,
  isReached,
} from "@/lib/courtesyCall";

/** The migration that defines the RPC, found by content so a rename does not silently skip it. */
const migrationSource = (): string => {
  const dir = path.resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((f) =>
    readFileSync(path.join(dir, f), "utf8").includes("FUNCTION public.close_courtesy_call"),
  );
  if (!file) throw new Error("close_courtesy_call migration not found");
  return readFileSync(path.join(dir, file), "utf8");
};

describe("the outcome vocabulary is one list, not two", () => {
  /**
   * The RPC refuses an outcome it does not know, so a value the dialog offers and the function
   * rejects is an operator finishing a call and being told the close failed — with the notes
   * still only in a draft. These two lists must agree, and nothing but a test makes them.
   */
  it("every outcome the dialog offers is one the RPC accepts", () => {
    const sql = migrationSource();
    const accepted = sql
      .slice(sql.indexOf("p_outcome NOT IN ("))
      .slice(0, 300)
      .match(/'([a-z_]+)'/g)
      ?.map((s) => s.replace(/'/g, ""));

    expect(accepted, "could not read the accepted outcomes out of the migration").toBeTruthy();
    expect([...CALL_OUTCOMES].sort()).toEqual([...(accepted as string[])].sort());
  });

  it("every outcome has a radio option, and every option is a real outcome", () => {
    expect(OUTCOME_OPTIONS.map((o) => o.value).sort()).toEqual([...CALL_OUTCOMES].sort());
  });

  /**
   * `v_reached` in the migration decides whether the task closes and next month is booked. The
   * dialog uses its own copy only to word the button; if the two disagree the operator is told
   * one thing and the record says another.
   */
  it("the reached set matches v_reached in the migration", () => {
    const sql = migrationSource();
    const line = sql.slice(sql.indexOf("v_reached := p_outcome IN ("));
    const inSql = line
      .slice(0, line.indexOf(";"))
      .match(/'([a-z_]+)'/g)
      ?.map((s) => s.replace(/'/g, ""));

    expect(inSql, "could not read v_reached out of the migration").toBeTruthy();
    expect([...REACHED_OUTCOMES].sort()).toEqual([...(inSql as string[])].sort());
  });

  it("voicemail is NOT reaching someone", () => {
    // A message into an empty room is not a check-in. If this ever flips, a member who has not
    // been spoken to for months reads as seen.
    expect(isReached("voicemail")).toBe(false);
    expect(isReached("no_answer")).toBe(false);
  });

  it("speaking to a carer counts, and so does a member who declines to talk", () => {
    expect(isReached("spoke_member")).toBe(true);
    expect(isReached("spoke_carer")).toBe(true);
    expect(isReached("declined")).toBe(true);
  });
});

describe("the checklist", () => {
  it("asks five questions, each with a stable id for the note", () => {
    expect(CALL_CHECKLIST).toHaveLength(5);
    expect(CALL_CHECKLIST.map((c) => c.id)).toEqual([
      "member_well",
      "pendant_worn",
      "test_press",
      "contacts_correct",
      "anything_changed",
    ]);
  });

  it("has no duplicate ids, because the checklist becomes a JSON object", () => {
    expect(new Set(CALL_CHECKLIST.map((c) => c.id)).size).toBe(CALL_CHECKLIST.length);
  });
});

describe("the call timer", () => {
  it.each([
    [0, "00:00"],
    [9, "00:09"],
    [60, "01:00"],
    [599, "09:59"],
    [4452, "74:12"],
  ])("%i seconds reads %s", (seconds, expected) => {
    expect(formatCallDuration(seconds)).toBe(expected);
  });

  it("does not wrap at an hour — a 74-minute call reads 74 minutes, not 14", () => {
    expect(formatCallDuration(74 * 60)).toBe("74:00");
  });

  it("never renders a negative time if the clock jumps backwards", () => {
    expect(formatCallDuration(-5)).toBe("00:00");
  });
});
