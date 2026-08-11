/**
 * Real-error surfacing for edge-function calls (Lee, 2026-07-24).
 *
 * `supabase.functions.invoke()` wraps any non-2xx response in a
 * FunctionsHttpError whose `.message` is the generic "Edge Function returned
 * a non-2xx status code" — the function's actual JSON error body sits unread
 * on `.context`. The staff-register failure showed the consequence: "email
 * already exists", "only admins", validation rejects, and 500s all rendered
 * as the same generic toast.
 *
 * extractFunctionError() is proven BY EXECUTION here against real
 * FunctionsHttpError instances carrying real Response bodies, plus the
 * fallback ladder; source contracts pin that the staff hooks actually use it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { extractFunctionError, functionError } from "@/lib/functionError";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const httpError = (body: BodyInit | null, init?: ResponseInit) =>
  new FunctionsHttpError(new Response(body, { status: 400, ...init }));

describe("extractFunctionError — by execution", () => {
  it("surfaces the function's {error} body verbatim", async () => {
    const err = httpError(JSON.stringify({ error: "A staff member with this email already exists" }));
    expect(await extractFunctionError(err, "fallback")).toBe(
      "A staff member with this email already exists",
    );
  });

  it("surfaces a {message} body when there is no {error}", async () => {
    const err = httpError(JSON.stringify({ message: "Only admins can create staff accounts" }), { status: 403 });
    expect(await extractFunctionError(err, "fallback")).toBe(
      "Only admins can create staff accounts",
    );
  });

  it("non-JSON body → the caller's fallback, NOT the generic non-2xx string", async () => {
    const err = httpError("<html>Bad Gateway</html>", { status: 502 });
    // Behaviour change (deliberate): this used to return err.message, i.e. the
    // literal "Edge Function returned a non-2xx status code" — the exact string a
    // partner saw instead of a password rule. For a FunctionsHttpError that message
    // is never informative, so the caller's fallback wins.
    expect(await extractFunctionError(err, "fallback")).toBe("fallback");
    expect(await extractFunctionError(err, "fallback")).not.toContain("non-2xx");
  });

  it("empty/whitespace error fields don't win over the fallback ladder", async () => {
    const err = httpError(JSON.stringify({ error: "" }));
    expect(await extractFunctionError(err, "fallback")).toBe("fallback");
  });

  it("plain Error → its message; unknown junk → the caller's fallback", async () => {
    expect(await extractFunctionError(new Error("You must be logged in"), "fallback")).toBe(
      "You must be logged in",
    );
    expect(await extractFunctionError(undefined, "Failed to create staff member")).toBe(
      "Failed to create staff member",
    );
    expect(await extractFunctionError({ odd: true }, "Failed to create staff member")).toBe(
      "Failed to create staff member",
    );
  });

  it("never throws, even on a consumed body", async () => {
    const response = new Response(JSON.stringify({ error: "x" }), { status: 400 });
    await response.json(); // consume it first
    const err = new FunctionsHttpError(response);
    expect(await extractFunctionError(err, "fallback")).toBe("fallback");
  });
});

describe("the staff hooks actually use it (source contracts)", () => {
  it("useCreateStaff surfaces the real staff-register error", () => {
    const hook = read("src/hooks/useStaffMembers.ts");
    expect(hook).toMatch(/extractFunctionError\(response\.error, "Failed to create staff member"\)/);
    expect(hook).not.toMatch(/response\.error\.message \|\| "Failed to create staff member"/);
  });

  it("useSendInvite surfaces the real staff-send-invite error", () => {
    const hook = read("src/hooks/useStaffInvites.ts");
    expect(hook).toMatch(/extractFunctionError\(response\.error, "Failed to send invitation"\)/);
    expect(hook).not.toMatch(/response\.error\.message \|\| "Failed to send invitation"/);
  });
});

// ============================================================
//  The reported production failure, asserted directly
// ============================================================
//
// A partner submitted /partner/join. partner-register rejected the password and
// logged `Validation failed: [ "password: Invalid" ]`. The browser showed only
// "Edge Function returned a non-2xx status code".
//
// `_shared/validation.ts` returns
//   { error: "Invalid request data", details: ["password: Invalid"] }
// so `body.error` alone is "Invalid request data" — it names neither the field
// nor the rule. These tests fail against the pre-fix helper, which returned
// exactly that.

describe("validation rejects reach the user with the field and rule", () => {
  it("includes the details, not just the headline", async () => {
    const err = httpError(
      JSON.stringify({ error: "Invalid request data", details: ["password: Invalid"] }),
      { status: 400 },
    );

    const message = await extractFunctionError(err, "Registration failed");

    expect(message).toContain("password");
    // The pre-fix helper stopped at the headline; that is the regression.
    expect(message).not.toBe("Invalid request data");
    expect(message).not.toContain("non-2xx");
  });

  it("joins multiple field errors so none is hidden", async () => {
    const err = httpError(
      JSON.stringify({
        error: "Invalid request data",
        details: ["password: Invalid", "payout_iban: String must contain at least 1 character(s)"],
      }),
      { status: 400 },
    );

    const message = await extractFunctionError(err, "Registration failed");

    expect(message).toContain("password");
    expect(message).toContain("payout_iban");
  });

  it("accepts a details string as well as an array", async () => {
    const err = httpError(JSON.stringify({ error: "Nope", details: "password: Invalid" }), {
      status: 400,
    });
    expect(await extractFunctionError(err, "fallback")).toContain("password: Invalid");
  });

  it("ignores an empty or non-string details payload", async () => {
    const empty = httpError(JSON.stringify({ error: "Nope", details: [] }), { status: 400 });
    expect(await extractFunctionError(empty, "fallback")).toBe("Nope");

    const junk = httpError(JSON.stringify({ error: "Nope", details: { a: 1 } }), { status: 400 });
    expect(await extractFunctionError(junk, "fallback")).toBe("Nope");
  });

  it("functionError wraps the same message as a throwable Error", async () => {
    const err = httpError(
      JSON.stringify({ error: "Invalid request data", details: ["password: Invalid"] }),
      { status: 400 },
    );

    const wrapped = await functionError(err, "Registration failed");

    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toContain("password");
  });

  it("functionError defaults its fallback rather than leaking the generic string", async () => {
    const err = httpError("<html>502</html>", { status: 502 });
    const wrapped = await functionError(err);
    expect(wrapped.message).not.toContain("non-2xx");
    expect(wrapped.message).toBe("Request failed");
  });
});
