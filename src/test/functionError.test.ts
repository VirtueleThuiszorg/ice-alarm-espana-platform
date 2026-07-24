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
import { extractFunctionError } from "@/lib/functionError";

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

  it("non-JSON body → falls back to the error's own message", async () => {
    const err = httpError("<html>Bad Gateway</html>", { status: 502 });
    // FunctionsHttpError's message is the generic non-2xx string
    expect(await extractFunctionError(err, "fallback")).toBe(err.message);
  });

  it("empty/whitespace error fields don't win over the fallback ladder", async () => {
    const err = httpError(JSON.stringify({ error: "" }));
    expect(await extractFunctionError(err, "fallback")).toBe(err.message);
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
    expect(await extractFunctionError(err, "fallback")).toBe(err.message);
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
