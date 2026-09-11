// @vitest-environment node
//
// THE EDGE FUNCTIONS ARE THE ONE PART OF THIS PLATFORM WITH NO COMPILE STEP — and they are the
// part that talks to Stripe.
//
// THE DEFECT, found on 2026-09-11 while extending the same function:
//
//     const admin = createClient(...);
//     ...
//     const { methods } = await loadCheckoutPaymentMethods(supabase);   // ← no such identifier
//
// `send-payment-link` declared its client as `admin` and then passed `supabase`, which exists
// nowhere in the file. In an ES module that is a ReferenceError the moment the line runs, so
// EVERY staff-sent payment link returned a 500 — and it did so AFTER
// `create_payment_link_order` had already written the pending order, the pending payment and the
// pending subscription. A member the staff believed had been sent a link had an order waiting
// for a payment that no Stripe session existed to take.
//
// NOTHING WOULD HAVE CAUGHT IT. CI typechecks `tsconfig.app.json` and `tsconfig.node.json`, and
// neither includes `supabase/functions/**`. `typescript-eslint`'s recommended config switches
// `no-undef` off — correctly, for code the compiler checks; these files are checked by nothing.
//
// So the gate is `no-undef`, switched back on for `supabase/functions/**` in eslint.config.js,
// and this file is what stops that being quietly removed again. `deno check` is the better gate
// and is worth adding when Deno is in CI; this one costs a config block and runs today.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const eslintConfig = read("eslint.config.js");

describe("the gate exists", () => {
  it("lints the edge functions as their own block", () => {
    expect(eslintConfig).toContain('files: ["supabase/functions/**/*.ts"]');
  });

  it("turns no-undef back ON there — the rule tsc would otherwise be doing", () => {
    const block = eslintConfig.slice(eslintConfig.indexOf('files: ["supabase/functions/**/*.ts"]'));
    expect(block).toMatch(/"no-undef":\s*"error"/);
  });

  it("declares Deno, so the rule is about real mistakes and not about Deno.env", () => {
    expect(eslintConfig).toMatch(/Deno:\s*"readonly"/);
  });

  it("does not disable it again anywhere after", () => {
    expect(eslintConfig).not.toMatch(/"no-undef":\s*"off"/);
  });

  // `eslint .` is what CI runs; a block scoped to a path nothing lints would be decoration.
  it("is reached by the lint script CI actually runs", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.lint).toBe("eslint .");
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/run:\s*npm run lint/);
    // `ignores` is the one way a path can be excluded from `eslint .`.
    const ignores = eslintConfig.match(/ignores:\s*\[(.*?)\]/s)?.[1] ?? "";
    expect(ignores).not.toContain("supabase");
  });
});

describe("the one that got through", () => {
  const source = read("supabase/functions/send-payment-link/index.ts");

  it("reads its checkout settings off the client it created", () => {
    expect(source).toContain("loadCheckoutPaymentMethods(admin)");
  });

  it("and no longer names a client it does not have", () => {
    expect(source).not.toContain("loadCheckoutPaymentMethods(supabase)");
  });

  // The failure was not "the link did not send" — it was "the link did not send AND the rows
  // were already there". Pinned so the order is not quietly reversed into something that looks
  // tidier and leaves a Stripe session with no order behind it.
  it("still writes the pending rows BEFORE asking Stripe for a session", () => {
    expect(source.indexOf("create_payment_link_order")).toBeGreaterThan(0);
    expect(source.indexOf("create_payment_link_order")).toBeLessThan(
      source.indexOf("stripe.checkout.sessions.create"),
    );
  });
});
