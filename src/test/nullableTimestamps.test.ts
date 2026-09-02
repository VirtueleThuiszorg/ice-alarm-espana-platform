/**
 * The 1970 bug, and the null-identity bug behind it.
 *
 * When the generated Supabase types were brought back in line with the schema
 * (`scripts/sync-supabase-types.py`), a large batch of columns turned out to be
 * nullable that the pages had been treating as always-present. Most of those
 * were cosmetic, but two classes were not:
 *
 * 1. `format(new Date(row.created_at), …)` on a null timestamp. `new Date(null)`
 *    is the Unix epoch, so a missing timestamp renders as **1 January 1970** —
 *    on a payments table or an alert log, a row that looks like a real, very old
 *    record rather than an empty field.
 *
 * 2. `.eq("staff_id", currentStaffId)` with a null staff id. PostgREST matches
 *    nothing, so the edit or delete silently did nothing while the UI reported
 *    success. That one is a correctness bug on an operator screen: an operator
 *    who believes they corrected a shift note that was never corrected.
 *
 * These tests pin both. The first group is a real unit test of the helper; the
 * second is a source contract, because the guard it protects lives inside a
 * React event handler talking to PostgREST and cannot be exercised from vitest.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatDate, toDate } from "@/lib/formatDate";

const ROOT = process.cwd();

describe("formatDate never renders a missing timestamp as a date", () => {
  it("returns the fallback for null and undefined", () => {
    expect(formatDate(null, "d MMM yyyy")).toBe("—");
    expect(formatDate(undefined, "d MMM yyyy")).toBe("—");
  });

  it("does NOT fall through to the Unix epoch", () => {
    // The whole point: `new Date(null)` is 1970-01-01, and `format` is happy to
    // print it. A fallback that contains "1970" would mean the guard is gone.
    expect(formatDate(null, "yyyy")).not.toContain("1970");
    expect(formatDate(null, "yyyy")).not.toBe("1970");
  });

  it("returns the fallback for the empty string and for unparseable input", () => {
    expect(formatDate("", "yyyy")).toBe("—");
    expect(formatDate("not a date", "yyyy")).toBe("—");
  });

  it("accepts a caller-supplied fallback", () => {
    expect(formatDate(null, "yyyy", "Never")).toBe("Never");
  });

  it("formats a real timestamp normally", () => {
    expect(formatDate("2026-09-02T10:30:00.000Z", "yyyy")).toBe("2026");
    expect(formatDate(new Date("2026-09-02T10:30:00.000Z"), "yyyy")).toBe("2026");
  });

  it("toDate returns null rather than the epoch", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate("")).toBeNull();
    expect(toDate("not a date")).toBeNull();
    expect(toDate("2026-09-02T10:30:00.000Z")?.getUTCFullYear()).toBe(2026);
  });
});

describe("a null staff id never reaches a PostgREST filter", () => {
  const page = readFileSync(join(ROOT, "src/pages/call-centre/ShiftNotesPage.tsx"), "utf8");

  it("guards both the edit and the delete before filtering on staff_id", () => {
    // `currentStaffId` starts null and is filled in asynchronously. Without the
    // guard, an update or delete fired before it resolves matches zero rows and
    // still reports success.
    const guards = page.match(/if\s*\(\s*!currentStaffId\s*\)/g) ?? [];
    expect(
      guards.length,
      "both handleSaveEdit and handleDelete must bail out on a null staff id",
    ).toBeGreaterThanOrEqual(2);
  });

  it("every staff_id filter sits after a guard, not before one", () => {
    const lines = page.split("\n");
    const filterLines = lines
      .map((line, i) => [i, line] as const)
      .filter(([, line]) => /\.eq\(\s*["']staff_id["']\s*,\s*currentStaffId\s*\)/.test(line));

    expect(filterLines.length, "the page must still filter by staff_id").toBeGreaterThan(0);

    for (const [index] of filterLines) {
      const preceding = lines.slice(Math.max(0, index - 25), index).join("\n");
      expect(
        /if\s*\(\s*!currentStaffId\s*\)/.test(preceding),
        `the staff_id filter on line ${index + 1} is not preceded by a null guard`,
      ).toBe(true);
    }
  });
});
