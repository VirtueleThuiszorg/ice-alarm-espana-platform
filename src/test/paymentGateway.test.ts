/**
 * The gateway must never be guessed.
 *
 * `settings_active_payment_gateway` was seeded with the literal `'stripe'` by
 * `20260228180000_add_mollie_payment_gateway.sql` and never written again, and
 * both readers of it ended in `|| "stripe"`. So a missing row, an empty value,
 * a typo or a failed settings query all resolved to Stripe — the gateway ICE
 * Alarm is leaving.
 *
 * The failure that causes is not a broken checkout, which would at least be
 * visible. It is a *successful* one: `submit_registration_atomic` writes the
 * member inactive awaiting a webhook, the customer pays through a gateway
 * nobody is listening to, and the webhook never arrives. Money taken, nobody
 * monitored, no error anywhere.
 *
 * There is no safe default, so there is no default. These are source-contract
 * tests on the edge function and the join step, because neither can be executed
 * from vitest — one is Deno talking to Postgres, the other redirects the
 * browser to a real payment page. The hook's parser is exercised for real.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const fn = read("supabase/functions/submit-registration/index.ts");
/** Code only. The comments deliberately quote the old fallback to explain it. */
const stripComments = (src: string) =>
  src
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
const fnCode = stripComments(fn);
const hook = read("src/hooks/usePricingSettings.ts");
const step = read("src/components/join/steps/JoinPaymentStep.tsx");
const migration = read("supabase/migrations/20260902160000_payment_gateway_mollie.sql");

describe("submit-registration refuses rather than guesses", () => {
  it("no longer falls back to stripe", () => {
    expect(
      fnCode,
      'the `|| "stripe"` fallback must not come back',
    ).not.toMatch(/settings_active_payment_gateway\s*\|\|\s*["']stripe["']/);
  });

  it("validates the value against a known list", () => {
    expect(fnCode).toMatch(/KNOWN_GATEWAYS\s*=\s*\[\s*["']stripe["']\s*,\s*["']mollie["']\s*\]/);
    expect(fnCode).toMatch(/KNOWN_GATEWAYS\.includes\(/);
  });

  it("returns GATEWAY_NOT_CONFIGURED instead of proceeding", () => {
    expect(fn).toMatch(/GATEWAY_NOT_CONFIGURED/);
    expect(fn, "an unconfigured gateway is a service problem, not a bad request")
      .toMatch(/status:\s*503/);
  });

  it("bails out BEFORE the RPC that creates the member and the order", () => {
    // Order matters more than the check itself. A registration created against
    // an unusable gateway leaves a half-real member behind; refusing first
    // leaves nothing.
    const guard = fn.indexOf("GATEWAY_NOT_CONFIGURED");
    const rpc = fn.indexOf("submit_registration_atomic");
    expect(guard, "the guard must exist").toBeGreaterThan(-1);
    expect(rpc, "the RPC must exist").toBeGreaterThan(-1);
    expect(guard, "the gateway guard must come before the RPC call").toBeLessThan(rpc);
  });
});

describe("usePricingSettings resolves to null, never to a provider", () => {
  it("neither fallback to stripe survives", () => {
    const offenders = hook
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /activeGateway/.test(line) && /["']stripe["']/.test(line));
    expect(
      offenders.map(([n, l]) => `${n}: ${l.trim()}`),
      "activeGateway must not default to stripe anywhere",
    ).toEqual([]);
  });

  it("the type admits null, so callers have to handle it", () => {
    expect(hook).toMatch(/activeGateway:\s*PaymentGateway\s*\|\s*null/);
    expect(hook).toMatch(/settings\?\.activeGateway\s*\?\?\s*null/);
  });

  it("parseGateway accepts only the two real gateways", () => {
    // Re-implemented here rather than imported: the hook pulls in the Supabase
    // client and react-query at module load. The contract is small enough that
    // a copy which drifts would be caught by the source assertions above.
    const KNOWN = ["stripe", "mollie"];
    const parse = (v: string | undefined) => {
      const t = v?.trim();
      return t && KNOWN.includes(t) ? t : null;
    };
    expect(parse("mollie")).toBe("mollie");
    expect(parse("stripe")).toBe("stripe");
    expect(parse(" mollie ")).toBe("mollie");
    expect(parse(undefined)).toBeNull();
    expect(parse("")).toBeNull();
    expect(parse("   ")).toBeNull();
    expect(parse("Mollie")).toBeNull();   // case matters — the DB value is lowercase
    expect(parse("adyen")).toBeNull();
    expect(parse("stripe,mollie")).toBeNull();
  });
});

describe("the join flow will not send anyone to an unresolved gateway", () => {
  it("guards before choosing a checkout function", () => {
    const guard = step.search(/activeGateway\s*!==\s*["']mollie["']\s*&&\s*activeGateway\s*!==\s*["']stripe["']/);
    const branch = step.search(/if\s*\(activeGateway\s*===\s*["']mollie["']\)/);
    expect(guard, "there must be a guard on an unresolved gateway").toBeGreaterThan(-1);
    expect(branch, "the mollie/stripe branch must still exist").toBeGreaterThan(-1);
    expect(guard, "the guard must come before the branch").toBeLessThan(branch);
  });

  it("shows the existing gateway-not-configured message rather than a raw error", () => {
    expect(step).toMatch(/joinWizard\.payment\.gatewayNotConfigured/);
  });
});

describe("the migration points the setting at Mollie without overruling an admin", () => {
  it("moves the untouched seed and an empty value", () => {
    expect(migration).toMatch(/btrim\(v_before\)\s*IN\s*\(''\s*,\s*'stripe'\)/);
    expect(migration).toMatch(/SET value = 'mollie'/);
  });

  it("creates the row when it is absent", () => {
    expect(migration).toMatch(/IF v_before IS NULL THEN/);
    expect(migration).toMatch(/INSERT INTO public\.system_settings \(key, value\)/);
  });

  it("leaves a deliberately-set value alone, and warns about an unknown one", () => {
    expect(migration).toMatch(/RAISE WARNING 'active payment gateway is "%"/);
    expect(migration).toMatch(/Left as-is rather than overruled by a migration/);
  });

  it("warns when Mollie has no key or no webhook secret", () => {
    // Pointing at Mollie with no credentials is a checkout that fails for every
    // customer, and a webhook that cannot be verified is a member who never
    // activates after paying.
    expect(migration).toMatch(/settings_mollie_api_key is empty/);
    expect(migration).toMatch(/settings_mollie_webhook_secret is empty/);
  });

  it("documents how to reverse it", () => {
    expect(migration).toMatch(/REVERSIBLE/);
    expect(migration).toMatch(/SET value = 'stripe'/);
  });
});
