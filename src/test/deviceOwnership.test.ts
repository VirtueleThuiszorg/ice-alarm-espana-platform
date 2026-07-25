/**
 * DEVICE MODEL: the pendant is SOLD outright (€125 net + IVA) — Lee's ruling,
 * 2026-07-25. Customers own it.
 *
 * The Terms previously described three incompatible models at once: §7.1 said
 * "the device remains our property", §7.1/§9.4 required its return on
 * cancellation, and §8.4 offered refundable "device deposits" — while checkout
 * charged a one-time purchase price. These pins keep the sold model consistent
 * on every surface and in every locale.
 *
 * The one return scenario that must survive: the 14-day right of withdrawal
 * (§9.2), where the consumer returns the pendant and pays return postage.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOCALES = ["en", "es", "nl"] as const;

type Flat = Record<string, string>;
function flatten(locale: string): Flat {
  const raw = JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${locale}.json`), "utf8"));
  const out: Flat = {};
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    } else if (typeof node === "string") out[path] = node;
  };
  walk(raw, "");
  return out;
}
const flat = Object.fromEntries(LOCALES.map((l) => [l, flatten(l)])) as Record<string, Flat>;

const terms = (locale: string, key: string) =>
  Object.keys(flat[locale])
    .filter((k) => k.startsWith(`legal.terms.${key}[`))
    .map((k) => flat[locale][k])
    .join(" ");

describe("the pendant is sold, not lent", () => {
  it("§7.1 states the customer owns it on delivery", () => {
    expect(terms("en", "s7_1Items")).toMatch(/sold to you.*your property/is);
    expect(terms("es", "s7_1Items")).toMatch(/se le vende.*su propiedad/is);
    expect(terms("nl", "s7_1Items")).toMatch(/verkocht.*uw eigendom/is);
  });

  it("§7.1 no longer claims the device remains ours", () => {
    for (const locale of LOCALES) {
      const clause = terms(locale, "s7_1Items");
      expect(clause, `${locale} §7.1 must not claim our ownership`).not.toMatch(
        /remains our property|sigue siendo nuestra propiedad|blijft ons eigendom/i,
      );
    }
  });

  it("no surface requires the device back on cancellation", () => {
    const offenders: string[] = [];
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(flat[locale])) {
        // "return … if you cancel" / "must return any devices" and equivalents.
        if (
          /must return (the|any) device|devolver el dispositivo si cancela|debe devolver (el|cualquier) dispositivo|apparaten terug te sturen|collection of any equipment|recogida del equipo/i.test(
            value,
          )
        ) {
          offenders.push(`${locale}:${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("§9.4 says there is nothing to return, and is honest that SOS stops working", () => {
    expect(terms("en", "s9_4Items")).toMatch(/keep the pendant/i);
    expect(terms("en", "s9_4Items")).toMatch(/nothing to return/i);
    // a kept-but-dead pendant is a safety trap unless we say so plainly
    expect(terms("en", "s9_4Items")).toMatch(/no longer reach our team/i);
    expect(terms("es", "s9_4Items")).toMatch(/ya no contactará/i);
    expect(terms("nl", "s9_4Items")).toMatch(/bereikt ons team dan niet meer/i);
  });

  it("no surface offers a refundable device deposit (we take none)", () => {
    const offenders: string[] = [];
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(flat[locale])) {
        if (/device deposits?|fianza del dispositivo|borg voor het apparaat/i.test(value)) {
          offenders.push(`${locale}:${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the support FAQ tells members they keep it and that monitoring ends", () => {
    expect(flat.en["support.faq.cancelSubscriptionAnswer"]).toMatch(/keep your pendant/i);
    expect(flat.en["support.faq.cancelSubscriptionAnswer"]).toMatch(/no longer reaches our team/i);
    expect(flat.es["support.faq.cancelSubscriptionAnswer"]).toMatch(/Conserva su colgante/i);
    expect(flat.nl["support.faq.cancelSubscriptionAnswer"]).toMatch(/houdt uw hanger/i);
  });

  it("the 14-day withdrawal return survives, with the consumer paying postage", () => {
    for (const locale of LOCALES) {
      const clause = terms(locale, "s9_2Items");
      expect(clause, `${locale} must keep the withdrawal-window return`).toMatch(
        /return postage|gastos de devolución|retourkosten/i,
      );
    }
    expect(terms("en", "s7_1Items")).toMatch(/14-day right of withdrawal/i);
  });
});
