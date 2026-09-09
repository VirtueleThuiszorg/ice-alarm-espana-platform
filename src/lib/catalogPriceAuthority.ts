/**
 * WHICH PRICE ACTUALLY GOVERNS — the `products` table, or the canonical pricing tables.
 *
 * THE DEFECT THIS EXISTS FOR. `products` holds two completely different kinds of row, and the
 * admin catalog editor shows them as one list:
 *
 *   1. CATALOG PRODUCTS — the pendant, the glucose monitor, the family pack. Seeded by
 *      20260420090100 with a `slug`, a hero image, and translated copy. These are things a
 *      visitor browses at /products/<slug>.
 *
 *   2. THREE PRICE ROWS THAT ARE NOT PRODUCTS. 20260123114307 seeded 'GPS Pendant'
 *      (125.00 @ 21%), 'Registration Fee' (59.99 @ 0%) and 'Shipping' (14.99 @ 0%) — the same
 *      three numbers that now live in `pricing_settings` as `pendant_net`, `registration_base`
 *      and `shipping_amount`. They predate that table. They have no slug and no copy.
 *
 * So three of the platform's charged prices exist in two places at once. Editing them in the
 * catalog editor changes what the public /products page QUOTES and nothing about what checkout
 * CHARGES, which is the same shape as the registration-fee switch that turned nothing off
 * (REVIEW_JOIN_PATH.md P5) and the Stripe prices that could sit stale behind the tables.
 *
 * Nothing here writes anything. It answers two questions the screens need to ask:
 * is this row a catalog product at all, and if its price also lives in `pricing_settings`,
 * what is the figure that actually gets charged.
 */

import type { PricingConfig } from "../../supabase/functions/_shared/pricing-calc";

/** The three SKUs 20260123114307 seeded, and the canonical price each one duplicates. */
export const CANONICAL_PRICE_SKUS = {
  "PENDANT-GPS-001": {
    canonical: "pendant",
    /** Where an admin changes the figure that is really charged. */
    editedAt: "Admin → Settings → Canonical pricing (pendant net + IVA)",
  },
  "FEE-REG-001": {
    canonical: "registration",
    editedAt: "Admin → Settings → Canonical pricing (registration base)",
  },
  "SHIP-STD-001": {
    canonical: "shipping",
    editedAt: "Admin → Settings → Canonical pricing (shipping)",
  },
} as const;

export type CanonicalPrice = (typeof CANONICAL_PRICE_SKUS)[keyof typeof CANONICAL_PRICE_SKUS]["canonical"];

/** The minimum a caller has to know about a row for these questions to be answerable. */
export interface PricedProduct {
  slug: string | null;
  sku: string | null;
  selling_price_net: number;
  selling_tax_rate: number;
}

/**
 * Is this row a catalog product?
 *
 * Slug-addressable by construction: /products/<slug> IS the product page, and ProductsPage
 * renders every card as `<Link to={`/products/${slug}`}>`. A row with no slug produces a card
 * that navigates to `/products/null` — which is how "Shipping" and "Registration Fee" came to be
 * listed on the public site as things a visitor could click.
 */
export function isCatalogEntry(p: Pick<PricedProduct, "slug">): boolean {
  return typeof p.slug === "string" && p.slug.trim().length > 0;
}

/** The gross price the catalog row itself carries, net × (1 + rate), as the pages compute it. */
export function catalogGross(p: Pick<PricedProduct, "selling_price_net" | "selling_tax_rate">): number {
  return round2(p.selling_price_net * (1 + p.selling_tax_rate));
}

/** Two decimals, via a string, so 151.24999999999997 does not become 151.24. */
function round2(n: number): number {
  return Math.round(Number((n * 100).toFixed(4))) / 100;
}

/** The canonical gross for one of the three duplicated prices, from the pricing tables. */
export function canonicalGross(which: CanonicalPrice, c: PricingConfig): number {
  switch (which) {
    case "pendant":
      return round2(c.pendantNet * (1 + c.pendantTaxRate));
    case "registration":
      // `calculateOrder` charges the registration fee WITHOUT applying registration_tax_rate
      // (REVIEW_JOIN_PATH.md notes this), so the honest comparison is the base figure — the one
      // a customer is actually billed.
      return round2(c.registrationBase);
    case "shipping":
      // Already IVA-included in pricing_settings.
      return round2(c.shipping);
  }
}

export interface PriceAuthority {
  /** 'catalog' — this row's own price is the only one. 'pricing' — the tables decide. */
  authority: "catalog" | "pricing";
  /** Which canonical price it duplicates, when it duplicates one. */
  canonical?: CanonicalPrice;
  /** What the catalog row says. */
  catalog: number;
  /** What is really charged, when a canonical price governs. */
  charged?: number;
  /** True when the two disagree — an admin has edited one of them. */
  mismatch: boolean;
  /** Where to change the figure that governs, for the screen to say out loud. */
  editedAt?: string;
}

/**
 * Which price governs this row, and whether the two have drifted apart.
 *
 * `config` may be null while pricing is still loading; the answer is then "catalog", because
 * claiming a mismatch on a half-loaded config would put a false warning on the screen — worse
 * than a late one.
 */
export function priceAuthority(p: PricedProduct, config: PricingConfig | null): PriceAuthority {
  const catalog = catalogGross(p);
  const entry = p.sku ? CANONICAL_PRICE_SKUS[p.sku as keyof typeof CANONICAL_PRICE_SKUS] : undefined;

  if (!entry || !config) {
    return { authority: "catalog", catalog, mismatch: false };
  }

  const charged = canonicalGross(entry.canonical, config);
  return {
    authority: "pricing",
    canonical: entry.canonical,
    catalog,
    charged,
    mismatch: catalog !== charged,
    editedAt: entry.editedAt,
  };
}
