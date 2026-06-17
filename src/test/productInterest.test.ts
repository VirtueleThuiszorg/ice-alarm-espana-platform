import { describe, it, expect } from "vitest";
import { buildProductInterestLead, isValidEmail } from "@/lib/productInterest";

describe("buildProductInterestLead", () => {
  it("builds a leads row tagged product_interest with the product in the message", () => {
    const lead = buildProductInterestLead("Pill Dispenser", "user@example.com");
    expect(lead.source).toBe("product_interest");
    expect(lead.email).toBe("user@example.com");
    expect(lead.message).toContain("Pill Dispenser");
    expect(lead.status).toBe("new");
  });

  it("trims the email", () => {
    expect(buildProductInterestLead("X", "  a@b.com  ").email).toBe("a@b.com");
  });
});

describe("isValidEmail", () => {
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
