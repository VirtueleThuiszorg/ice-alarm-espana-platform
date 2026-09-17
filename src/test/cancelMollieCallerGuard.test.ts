// @vitest-environment node
//
// `cancel-mollie-subscription` runs with verify_jwt = false and a service-role client. Until
// 17 Sep 2026 it had no caller check, so anybody holding a subscription id could cancel a
// member's Mollie subscription. It now uses the shared admin/service-role guard; this test pins
// that the guard runs BEFORE the function reads the request body or touches Mollie.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/stripComments";

const src = stripComments(
  readFileSync(join(process.cwd(), "supabase/functions/cancel-mollie-subscription/index.ts"), "utf8"),
);

describe("cancel-mollie-subscription caller guard", () => {
  it("imports and calls the shared admin/service-role guard", () => {
    expect(src).toContain('from "../_shared/admin-caller.ts"');
    expect(src).toMatch(/identifyNotifyCaller\(\s*supabase,\s*req\.headers\.get\("Authorization"\)/);
  });

  it("refuses before reading the body or calling Mollie", () => {
    const guard = src.indexOf("identifyNotifyCaller(");
    const refusal = src.indexOf("if (!verdict.ok)");
    expect(guard).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(guard);
    expect(refusal).toBeLessThan(src.indexOf("await req.json()"));
    expect(refusal).toBeLessThan(src.indexOf("settings_mollie_api_key"));
    expect(refusal).toBeLessThan(src.indexOf("method: \"DELETE\""));
  });
});
