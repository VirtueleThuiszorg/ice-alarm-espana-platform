// @vitest-environment node
//
// /admin/products, walked end to end (Lee's dashboard notes, 9 Sep, item 6). Two defects came
// out of that walk, and both are about the same thing: `products` holds two kinds of row and the
// screens treated them as one.
//
//   1. THE PUBLIC SITE LISTED THREE THINGS THAT ARE NOT PRODUCTS. 20260123114307 seeded
//      'GPS Pendant' (125.00 @ 21%), 'Registration Fee' (59.99) and 'Shipping' (14.99) into
//      `products` as price rows, before `pricing_settings` existed. They have no slug and no
//      copy. When 20260420090000 added `status TEXT NOT NULL DEFAULT 'active'` they all became
//      `active`, and the public catalog query selects `status IN ('active','coming_soon')` — so
//      /products has been showing "Shipping" and "Registration Fee" as cards to browse, each
//      linking to `/products/null` because ProductsPage renders
//      `<Link to={`/products/${product.slug}`}>`.
//
//   2. THREE CHARGED PRICES EXIST IN TWO PLACES. Those same three numbers live in
//      `pricing_settings` as pendant_net / registration_base / shipping_amount, which is what
//      checkout charges. Editing them in the catalog editor changes what the public page QUOTES
//      and nothing about what a customer PAYS — the same shape as the registration-fee switch
//      that turned nothing off (REVIEW_JOIN_PATH.md P5).
//
// The mapping is not invented: the assertions below read the migration and check the three SKUs
// are the ones it really seeds, with the amounts it really seeds them at.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_PRICE_SKUS,
  canonicalGross,
  catalogGross,
  isCatalogEntry,
  priceAuthority,
  type PricedProduct,
} from "@/lib/catalogPriceAuthority";
import type { PricingConfig } from "../../supabase/functions/_shared/pricing-calc";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** The seeded canonical values (20260617120000), which are the live ones. */
const PRICING: PricingConfig = {
  single: { monthlyNet: 24.99, annualMonths: 10, subscriptionTaxRate: 0.1 },
  couple: { monthlyNet: 34.99, annualMonths: 10, subscriptionTaxRate: 0.1 },
  pendantNet: 125,
  pendantTaxRate: 0.21,
  shipping: 14.99,
  registrationBase: 59.99,
  registrationTaxRate: 0,
};

const product = (over: Partial<PricedProduct> = {}): PricedProduct => ({
  slug: "pendant",
  sku: null,
  selling_price_net: 125,
  selling_tax_rate: 0.21,
  ...over,
});

describe("what counts as a catalog product", () => {
  it("a row with a slug is one", () => {
    expect(isCatalogEntry({ slug: "glucose-monitor" })).toBe(true);
  });

  it("a row with NO slug is not — it has no page to link to", () => {
    expect(isCatalogEntry({ slug: null })).toBe(false);
  });

  it("nor is a row with a blank slug", () => {
    // `/products/` + "" is the list page, so a blank slug is a card that links to itself.
    expect(isCatalogEntry({ slug: "" })).toBe(false);
    expect(isCatalogEntry({ slug: "   " })).toBe(false);
  });
});

describe("the public catalog queries exclude the non-products", () => {
  const hook = read("src/hooks/useProductCatalog.ts");

  it("the list query filters on a non-null slug", () => {
    expect(hook).toContain('.not("slug", "is", null)');
  });

  it("BOTH queries do — the detail lookup as well as the list", () => {
    expect(hook.split('.not("slug", "is", null)').length - 1).toBe(2);
  });

  it("the reason is recorded where the filter is", () => {
    // A bare `.not(...)` looks like a performance tweak to the next reader; the three rows and
    // the DEFAULT 'active' that exposed them are why it is there.
    expect(hook).toMatch(/Registration Fee/);
    expect(hook).toMatch(/products\/null|\/products\/\$\{slug\}/);
  });

  it("ProductsPage still links by slug, which is what made a null slug a dead card", () => {
    // If this ever stops being true the filter above can be revisited; while it holds, a
    // slugless row on the public page is a card that navigates to /products/null.
    expect(read("src/pages/ProductsPage.tsx")).toContain("to={`/products/${product.slug}`}");
  });
});

describe("the three SKUs really are the ones the migration seeds", () => {
  const seed = read(
    "supabase/migrations/20260123114307_c3cb0d05-788b-487e-906e-0152a9a067e0.sql",
  );

  it("every SKU in the map appears in that seed", () => {
    for (const sku of Object.keys(CANONICAL_PRICE_SKUS)) {
      expect(seed, `${sku} is not in the seed — the mapping would be fiction`).toContain(sku);
    }
  });

  it("and it seeds them with the same numbers pricing_settings holds", () => {
    // 125.00 @ 0.21, 59.99 @ 0, 14.99 @ 0 — the duplication, in the migration text.
    expect(seed).toMatch(/'PENDANT-GPS-001'.*125\.00, 0\.21/s);
    expect(seed).toMatch(/'FEE-REG-001'.*59\.99, 0/s);
    expect(seed).toMatch(/'SHIP-STD-001'.*14\.99, 0/s);
  });

  it("the seed gives them no slug, which is why they are not catalog entries", () => {
    // The INSERT names only name/sku/description/prices/supplier — no slug column at all.
    const insert = seed.slice(seed.indexOf("INSERT INTO public.products"));
    expect(insert.slice(0, 200)).not.toContain("slug");
  });

  it("and 20260420090000 is what made them publicly visible", () => {
    const ext = read("supabase/migrations/20260420090000_extend_products_for_catalog.sql");
    expect(ext).toMatch(/status TEXT NOT NULL DEFAULT 'active'/);
  });
});

describe("which price governs a row", () => {
  it("an ordinary catalog product's own price governs it", () => {
    const a = priceAuthority(product({ sku: "GLUCOSE-01" }), PRICING);
    expect(a.authority).toBe("catalog");
    expect(a.mismatch).toBe(false);
    expect(a.charged).toBeUndefined();
  });

  it("a row with no SKU at all is governed by itself", () => {
    expect(priceAuthority(product({ sku: null }), PRICING).authority).toBe("catalog");
  });

  it("the pendant price row is governed by the PRICING TABLES, not by itself", () => {
    const a = priceAuthority(
      product({ slug: null, sku: "PENDANT-GPS-001", selling_price_net: 125, selling_tax_rate: 0.21 }),
      PRICING,
    );
    expect(a.authority).toBe("pricing");
    expect(a.canonical).toBe("pendant");
    expect(a.charged).toBe(151.25); // 125 x 1.21
    expect(a.mismatch).toBe(false);
    expect(a.editedAt).toMatch(/Canonical pricing/);
  });

  it("and says so for the registration fee and shipping too", () => {
    const fee = priceAuthority(
      product({ slug: null, sku: "FEE-REG-001", selling_price_net: 59.99, selling_tax_rate: 0 }),
      PRICING,
    );
    expect(fee.charged).toBe(59.99);
    expect(fee.mismatch).toBe(false);

    const ship = priceAuthority(
      product({ slug: null, sku: "SHIP-STD-001", selling_price_net: 14.99, selling_tax_rate: 0 }),
      PRICING,
    );
    expect(ship.charged).toBe(14.99);
    expect(ship.mismatch).toBe(false);
  });

  it("FLAGS a mismatch when somebody edits the catalog copy of the price", () => {
    // The actual failure mode: an admin raises the pendant price in the catalog editor, the
    // public page quotes 181.50 and checkout still charges 151.25.
    const a = priceAuthority(
      product({ slug: null, sku: "PENDANT-GPS-001", selling_price_net: 150, selling_tax_rate: 0.21 }),
      PRICING,
    );
    expect(a.mismatch).toBe(true);
    expect(a.catalog).toBe(181.5);
    expect(a.charged).toBe(151.25);
  });

  it("flags it the other way too — canonical raised, catalog left behind", () => {
    const a = priceAuthority(
      product({ slug: null, sku: "PENDANT-GPS-001", selling_price_net: 125, selling_tax_rate: 0.21 }),
      { ...PRICING, pendantNet: 150 },
    );
    expect(a.mismatch).toBe(true);
    expect(a.charged).toBe(181.5);
  });

  it("claims NO mismatch while the pricing config is still loading", () => {
    // A warning that appears for a second on every page load teaches people to ignore it.
    const a = priceAuthority(product({ slug: null, sku: "PENDANT-GPS-001" }), null);
    expect(a.authority).toBe("catalog");
    expect(a.mismatch).toBe(false);
  });

  it("the registration fee compares against the BASE, not base + IVA", () => {
    // calculateOrder charges the fee without applying registration_tax_rate, so the base is
    // what a customer is billed. Comparing against base x 1.21 would report a permanent
    // mismatch on a row that is correct.
    const a = priceAuthority(
      product({ slug: null, sku: "FEE-REG-001", selling_price_net: 59.99, selling_tax_rate: 0 }),
      { ...PRICING, registrationTaxRate: 0.21 },
    );
    expect(a.charged).toBe(59.99);
    expect(a.mismatch).toBe(false);
  });
});

describe("the arithmetic", () => {
  it("catalogGross is net x (1 + rate), to the cent", () => {
    expect(catalogGross({ selling_price_net: 125, selling_tax_rate: 0.21 })).toBe(151.25);
    expect(catalogGross({ selling_price_net: 14.99, selling_tax_rate: 0 })).toBe(14.99);
  });

  it("rounds where binary floating point would drop a cent", () => {
    // 24.99 * 1.21 is 30.237899999999996; 0.145-style cases are the ones that bite.
    expect(catalogGross({ selling_price_net: 0.145, selling_tax_rate: 0 })).toBe(0.15);
    expect(catalogGross({ selling_price_net: 8.165, selling_tax_rate: 0 })).toBe(8.17);
  });

  it("canonicalGross reads the pricing tables, so a table change moves it", () => {
    expect(canonicalGross("pendant", PRICING)).toBe(151.25);
    expect(canonicalGross("pendant", { ...PRICING, pendantTaxRate: 0 })).toBe(125);
    expect(canonicalGross("shipping", { ...PRICING, shipping: 19.99 })).toBe(19.99);
    expect(canonicalGross("registration", { ...PRICING, registrationBase: 0 })).toBe(0);
  });
});

describe("the admin screen says which price governs", () => {
  const page = read("src/pages/admin/ProductCatalogPage.tsx");

  it("marks a row that is not a catalog product", () => {
    expect(page).toContain("Not a catalog product");
    expect(page).toContain("isCatalogEntry");
  });

  it("names the charged price and where to change it", () => {
    expect(page).toContain("priceAuthority");
    expect(page).toMatch(/not what customers are charged/);
    expect(page).toMatch(/authority\.editedAt/);
  });

  it("does not compare against a half-loaded pricing config", () => {
    expect(page).toContain("pricingLoading ? null : pricing");
  });
});
