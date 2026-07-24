/**
 * Spanish holiday-law compliance guard (Estatuto de los Trabajadores art. 38):
 * statutory minimum 30 NATURAL days/year. The allowance previously defaulted
 * to 22 while deduction was calendar-day based — below the legal minimum.
 *
 * Locks: the corrective migration's exact semantics, the natural-day
 * deduction model, no lingering 22-day fallbacks in the UI, and the
 * three-locale UI note.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

function migration(prefix: string): string {
  const f = readdirSync(MIGRATIONS).find((m) => m.startsWith(prefix));
  expect(f, `migration ${prefix}* must exist`).toBeDefined();
  return readFileSync(join(MIGRATIONS, f!), "utf8");
}

describe("statutory 30-day minimum", () => {
  const sql = migration("20260724100000");

  it("new-staff default becomes 30", () => {
    expect(sql).toMatch(/ALTER COLUMN annual_holiday_days SET DEFAULT 30/);
  });

  it("backfill touches ONLY old-default (22) or never-set rows", () => {
    expect(sql).toMatch(
      /UPDATE public\.staff\s+SET annual_holiday_days = 30\s+WHERE annual_holiday_days = 22 OR annual_holiday_days IS NULL/,
    );
    // No unguarded update that would clobber manual convenio/seniority values.
    expect(sql).not.toMatch(/SET annual_holiday_days = 30\s*;/);
  });

  it("deduction model stays natural-day based (días naturales)", () => {
    const base = migration("20260301153008");
    expect(base).toMatch(/total_days INTEGER GENERATED ALWAYS AS \(end_date - start_date \+ 1\) STORED/);
  });

  it("no 22-day fallback lingers in staff UI code", () => {
    for (const f of [
      "src/components/admin/staff/StaffFormPanel.tsx",
      "src/pages/admin/StaffPage.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, `${f} still references a 22-day holiday fallback`).not.toMatch(
        /annual_holiday_days.{0,40}22|22.{0,10}annual_holiday_days/s,
      );
    }
  });

  it("the natural-days note exists in all three locales", () => {
    for (const loc of ["en", "es", "nl"]) {
      const d = JSON.parse(
        readFileSync(join(process.cwd(), `src/i18n/locales/${loc}.json`), "utf8"),
      );
      const note = d.holidays?.naturalDaysNote as string | undefined;
      expect(note, `${loc}: holidays.naturalDaysNote missing`).toBeTruthy();
      expect(note).toContain("30");
      expect(note.toLowerCase()).toMatch(/naturales|kalenderdagen|natural/);
    }
  });

  it("per-person override field exists in the staff form (convenio extras)", () => {
    const form = readFileSync(
      join(process.cwd(), "src/components/admin/staff/StaffFormPanel.tsx"),
      "utf8",
    );
    expect(form).toMatch(/name="annual_holiday_days"/);
  });
});
