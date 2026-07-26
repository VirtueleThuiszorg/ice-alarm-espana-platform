/**
 * Member-visible Billing & Subscription FAQ (documentation row, visibility
 * includes 'member' — it renders in the member portal's knowledge base).
 *
 * It still taught two things Lee has since ruled otherwise on, and it omitted
 * the statutory right entirely:
 *   - "30-day notice required" to cancel → ruled: cancel any time, no notice
 *     (already fixed in support.faq and Terms §9.1, #82)
 *   - "Pendant must be returned" → ruled: sold outright, customers own it
 *     (already fixed in Terms §7.1/§9.4, #87)
 *   - no mention of the 14-day withdrawal right, which is the ONE case where
 *     the pendant does go back
 *
 * Migration 20260726090000 corrects the row in en and es (the only languages
 * the table allows). These pins keep the corrected wording and the guards.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sql = read("supabase/migrations/20260726090000_billing_faq_cancel_and_device.sql");

describe("billing FAQ content fix", () => {
  it("removes the 30-day cancellation notice in both locales", () => {
    expect(sql).toMatch(/30-day notice required/); // the old string being replaced
    expect(sql).toMatch(/no minimum term and no notice period/i);
    expect(sql).toMatch(/No hay plazo mínimo ni preaviso/);
  });

  it("stops telling members to return a pendant they own", () => {
    expect(sql).toMatch(/You keep it\. The pendant was sold to you/);
    expect(sql).toMatch(/Lo conserva\. El colgante se le vendió/);
    expect(sql).toMatch(/You keep both pendants/);
    expect(sql).toMatch(/Conserva ambos colgantes/);
  });

  it("is honest that monitoring — and therefore SOS — stops", () => {
    expect(sql).toMatch(/SOS button will no longer reach our team/);
    expect(sql).toMatch(/botón SOS ya no contactará con nuestro equipo/);
  });

  it("adds the 14-day withdrawal right, the one case where the pendant goes back", () => {
    expect(sql).toMatch(/right of withdrawal/);
    expect(sql).toMatch(/derecho legal de desistimiento/);
    expect(sql).toMatch(/you pay the return postage/);
    expect(sql).toMatch(/gastos de devolución corren por su cuenta/);
  });

  it("every statement is guarded, so a prod edit is not clobbered", () => {
    const updates = sql.match(/UPDATE public\.documentation/g) ?? [];
    const guards = sql.match(/WHERE slug = 'billing-subscription-faq-(en|es)'/g) ?? [];
    expect(updates.length).toBe(8);
    expect(guards.length).toBe(updates.length);
    // in-place replace(), never a whole-row overwrite
    expect(sql).not.toMatch(/SET content = '/);
    expect(sql).toMatch(/-- Rollback:/);
  });

  it("touches only the billing FAQ — no other document is edited", () => {
    const slugs = new Set(sql.match(/slug = '([a-z0-9-]+)'/g) ?? []);
    expect([...slugs].sort()).toEqual([
      "slug = 'billing-subscription-faq-en'",
      "slug = 'billing-subscription-faq-es'",
    ]);
  });
});
