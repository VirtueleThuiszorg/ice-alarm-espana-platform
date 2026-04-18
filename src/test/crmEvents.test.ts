import { describe, it, expect, beforeEach } from "vitest";
import {
  generateReferralLink,
  extractUtmParams,
  storeReferralData,
  getStoredReferralData,
  clearReferralData,
} from "@/lib/crmEvents";

// ============================================================
//  generateReferralLink
// ============================================================

describe("generateReferralLink", () => {
  it("generates a clean /r/ path link with referral code", () => {
    const link = generateReferralLink("PARTNER123");
    const url = new URL(link);

    expect(url.pathname).toBe("/r/PARTNER123");
  });

  it("uses window.location.origin as default base URL", () => {
    const link = generateReferralLink("CODE1");
    expect(link).toContain("/r/CODE1");
    expect(link).toBe(`${window.location.origin}/r/CODE1`);
  });
});

// ============================================================
//  extractUtmParams
// ============================================================

describe("extractUtmParams", () => {
  it("extracts all UTM parameters", () => {
    const params = new URLSearchParams(
      "utm_source=partner&utm_campaign=PROMO1&utm_medium=referral&utm_content=banner&utm_term=keyword"
    );

    const result = extractUtmParams(params);
    expect(result).toEqual({
      utm_source: "partner",
      utm_campaign: "PROMO1",
      utm_medium: "referral",
      utm_content: "banner",
      utm_term: "keyword",
    });
  });

  it("ignores non-UTM parameters", () => {
    const params = new URLSearchParams("ref=CODE1&foo=bar&utm_source=partner");
    const result = extractUtmParams(params);

    expect(result).toEqual({ utm_source: "partner" });
    expect(result).not.toHaveProperty("ref");
    expect(result).not.toHaveProperty("foo");
  });

  it("returns empty object when no UTM params present", () => {
    const params = new URLSearchParams("ref=CODE1&page=1");
    expect(extractUtmParams(params)).toEqual({});
  });
});

// ============================================================
//  storeReferralData / getStoredReferralData / clearReferralData
// ============================================================

describe("referral data storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores referral code in localStorage", () => {
    storeReferralData("PARTNER1", {});
    expect(localStorage.getItem("partner_ref")).toBe("PARTNER1");
  });

  it("stores UTM data in localStorage", () => {
    storeReferralData("PARTNER1", { utm_source: "partner", utm_campaign: "PROMO" });
    const utm = JSON.parse(localStorage.getItem("partner_utm") || "{}");
    expect(utm.utm_source).toBe("partner");
    expect(utm.utm_campaign).toBe("PROMO");
  });

  it("uses first-touch attribution (does not overwrite)", () => {
    storeReferralData("FIRST_PARTNER", { utm_source: "first" });
    storeReferralData("SECOND_PARTNER", { utm_source: "second" });

    expect(localStorage.getItem("partner_ref")).toBe("FIRST_PARTNER");
    const utm = JSON.parse(localStorage.getItem("partner_utm") || "{}");
    expect(utm.utm_source).toBe("first");
  });

  it("retrieves stored referral data", () => {
    storeReferralData("CODE1", { utm_source: "partner" });
    const data = getStoredReferralData();

    expect(data.referralCode).toBe("CODE1");
    expect(data.utmParams.utm_source).toBe("partner");
    expect(data.refPostId).toBeNull();
  });

  it("returns null referralCode when no data stored", () => {
    const data = getStoredReferralData();
    expect(data.referralCode).toBeNull();
    expect(data.utmParams).toEqual({});
  });

  it("clears all referral data", () => {
    storeReferralData("CODE1", { utm_source: "test" });
    clearReferralData();

    expect(localStorage.getItem("partner_ref")).toBeNull();
    expect(localStorage.getItem("partner_utm")).toBeNull();
    expect(localStorage.getItem("partner_referral")).toBeNull();
  });

  it("prefers tracked link referral data over regular", () => {
    // Store regular referral
    storeReferralData("REGULAR", {});

    // Store tracked link referral (simulating /r/<code>/<slug> flow)
    localStorage.setItem(
      "partner_referral",
      JSON.stringify({
        ref_partner_code: "TRACKED",
        ref_post_id: "post-123",
        ref_expires: Date.now() + 86400000, // 24h from now
      })
    );

    const data = getStoredReferralData();
    expect(data.referralCode).toBe("TRACKED");
    expect(data.refPostId).toBe("post-123");
  });

  it("falls back to regular referral when tracked link is expired", () => {
    storeReferralData("REGULAR", {});

    localStorage.setItem(
      "partner_referral",
      JSON.stringify({
        ref_partner_code: "TRACKED",
        ref_post_id: "post-123",
        ref_expires: Date.now() - 1000, // Already expired
      })
    );

    const data = getStoredReferralData();
    expect(data.referralCode).toBe("REGULAR");
    expect(data.refPostId).toBeNull();
  });
});
