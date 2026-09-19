import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { toE164 } from "@/lib/phone";
import { normalisePhone } from "@/lib/iceCrmImport";
import { normalisePublicPhone } from "../../supabase/functions/_shared/public-submit";

/**
 * ONE PHONE NUMBER RULE, AND THE REASON IT HAS TO BE ONE.
 *
 * It existed twice, identically, kept in step by a comment on the second copy reading
 * "deliberately the same rule as `iceCrmImport.normalisePhone`". That is an accurate description
 * of a duplicate parallel implementation, not a defence of one, and the two could only stay
 * identical for as long as somebody kept reading the comment.
 *
 * THE COST OF THEM DRIFTING WAS NEVER COSMETIC. Every match between a lead and a member is a
 * string comparison on this column. A contact form storing `600111222` against a CRM import
 * storing `+34600111222` makes the same person two people — so a duplicate check on a
 * hand-added lead answers "no match" for somebody who is already a customer, and a staff member
 * rings an existing member to introduce them to a product they already pay for.
 */

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("the rule", () => {
  it("assumes +34 for a Spanish national number, and only for that shape", () => {
    // Nine digits beginning 6/7/8/9 is unambiguously Spanish. A staff member typing a number off
    // a business card types it the way it is printed.
    expect(toE164("600 111 222")).toBe("+34600111222");
    expect(toE164("950473199")).toBe("+34950473199");
    expect(toE164("712345678")).toBe("+34712345678");
    expect(toE164("812345678")).toBe("+34812345678");
  });

  it("leaves an international number alone, in any of the ways it is written", () => {
    expect(toE164("+34 600 111 222")).toBe("+34600111222");
    expect(toE164("0034600111222")).toBe("+34600111222");
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
    expect(toE164("+31 6 12345678")).toBe("+31612345678");
  });

  it("refuses rather than guesses", () => {
    /*
      "" is the caller's signal to refuse. A number we cannot dial is not better than no number:
      it is indistinguishable from one we can, until somebody tries it in front of a customer.
      `12345` is the interesting case — short enough not to be a phone number, and a rule that
      prepended +34 to anything would happily produce `+3412345`.
    */
    expect(toE164("12345")).toBe("");
    expect(toE164("abc")).toBe("");
    expect(toE164("")).toBe("");
    expect(toE164("   ")).toBe("");
    // Ten digits is not a Spanish national number and not international either.
    expect(toE164("5551234")).toBe("+5551234");
  });
});

describe("there is exactly one implementation", () => {
  it("all three names are the same function", () => {
    // Not "produce the same answers" — the SAME function object. Two implementations that agree
    // today is precisely the state this replaced.
    expect(normalisePublicPhone).toBe(toE164);
  });

  it("the CRM import's wrapper adds only its own cleaning, not its own rule", () => {
    /*
      `normalisePhone` still exists because this module's input is spreadsheet cells, which carry
      non-breaking spaces the general rule has no reason to know about. It must be a WRAPPER.
    */
    expect(normalisePhone("600 111 222")).toBe("+34600111222");
    expect(normalisePhone(" 600111222 ")).toBe("+34600111222");
    const src = read("src/lib/iceCrmImport.ts");
    expect(src).toContain("return toE164(clean(raw));");
  });

  it("nobody has written a second one", () => {
    /*
      THE SHAPE, not the name. A new copy would not be called `normalisePhone` — it would be
      `formatPhone` or `e164` in whichever file needed it next. What gives it away is the
      Spanish-national branch: `+34` prepended to a nine-digit string. Exactly one file may
      contain it.
    */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "node_modules" || name === "test" || name === ".git") continue;
          walk(p);
          continue;
        }
        if (!/\.tsx?$/.test(name)) continue;
        const rel = path.relative(process.cwd(), p).replace(/\\/g, "/");
        if (rel === "supabase/functions/_shared/phone.ts") continue;
        if (/\+34\$\{v\}|`\+34\$\{/.test(readFileSync(p, "utf8"))) offenders.push(rel);
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    walk(path.resolve(process.cwd(), "supabase/functions"));
    expect(
      offenders,
      `these prepend +34 themselves instead of calling toE164: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the sweep above is looking at files at all", () => {
    // It found two before this change; an empty sweep would pass it for ever.
    expect(read("supabase/functions/_shared/phone.ts")).toContain("`+34${v}`");
  });
});
