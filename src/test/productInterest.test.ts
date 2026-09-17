import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidEmail } from "@/lib/productInterest";

describe("the browser no longer builds the lead row", () => {
  it("has no builder left — `public-submit` assembles it with the service role", () => {
    /*
      `buildProductInterestLead` set `source` and `status` in the browser. Those fields are now
      chosen server-side, where a POST cannot pick its own provenance — so the builder going is
      the point, not a tidy-up. (The anon INSERT policy that made a browser-built row possible at
      all is revoked in the migration that follows this change.)
    */
    // The EXPORT, not the word: the comment above it explains what went and why, and a test
    // that forbids the prose would forbid the explanation.
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/productInterest.ts"), "utf8");
    expect(src).not.toMatch(/export function buildProductInterestLead/);
    expect(src).not.toMatch(/source:\s*"product_interest"/);

    // And the dialog no longer writes the table at all.
    const dialog = readFileSync(
      path.resolve(process.cwd(), "src/components/products/NotifyInterestDialog.tsx"),
      "utf8",
    );
    expect(dialog).not.toMatch(/\.from\("leads"\)/);
    expect(dialog).toContain('invoke("public-submit"');
  });
});

describe("isValidEmail, which is a convenience and not the rule", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail(" name@sub.domain.co ")).toBe(true);
  });
  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("@b.com")).toBe(false);
  });
});
