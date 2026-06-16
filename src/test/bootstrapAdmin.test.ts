import { describe, it, expect, vi } from "vitest";
import {
  canBootstrapFirstAdmin,
  validateBootstrapInput,
  type StaffBootstrapClient,
} from "../../supabase/functions/bootstrap-admin/guard";

/**
 * Mock a Supabase-like client whose `.from("staff").select(...).eq(...)` resolves to the
 * given {count,error} (or rejects). Tracks the queried table for assertions.
 */
function makeClient(
  resolve: () => Promise<{ count: number | null; error: unknown }>,
) {
  const fromSpy = vi.fn();
  const client: StaffBootstrapClient = {
    from: (table: string) => {
      fromSpy(table);
      return {
        select: () => ({
          eq: () => resolve(),
        }),
      };
    },
  };
  return { client, fromSpy };
}

const ZERO = () => Promise.resolve({ count: 0, error: null });
const ONE = () => Promise.resolve({ count: 1, error: null });
const MANY = () => Promise.resolve({ count: 5, error: null });
const NULL_COUNT = () => Promise.resolve({ count: null, error: null });
const DB_ERROR = () =>
  Promise.resolve({ count: null, error: { message: "connection reset" } });
const REJECTS = () => Promise.reject(new Error("network down"));

describe("bootstrap guard — REFUSES when a super_admin already exists", () => {
  it("refuses when exactly one super_admin exists", async () => {
    const { client, fromSpy } = makeClient(ONE);
    const d = await canBootstrapFirstAdmin(client);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("super_admin_exists");
    expect(fromSpy).toHaveBeenCalledWith("staff");
  });

  it("refuses when several super_admins exist", async () => {
    const { client } = makeClient(MANY);
    const d = await canBootstrapFirstAdmin(client);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("super_admin_exists");
  });
});

describe("bootstrap guard — ALLOWS only on a truly empty project", () => {
  it("allows when count is 0", async () => {
    const { client } = makeClient(ZERO);
    const d = await canBootstrapFirstAdmin(client);
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("no_super_admin");
  });

  it("allows when count is null (no rows)", async () => {
    const { client } = makeClient(NULL_COUNT);
    const d = await canBootstrapFirstAdmin(client);
    expect(d.allowed).toBe(true);
  });
});

describe("bootstrap guard — FAILS CLOSED on uncertainty (never escalate)", () => {
  it("refuses on a lookup error", async () => {
    const { client } = makeClient(DB_ERROR);
    const d = await canBootstrapFirstAdmin(client);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("lookup_error");
  });

  it("refuses when the lookup throws", async () => {
    const { client } = makeClient(REJECTS);
    const d = await canBootstrapFirstAdmin(client);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("lookup_error");
  });
});

describe("bootstrap input validation", () => {
  const valid = {
    user_id: "3f0c2b7a-1d2e-4c3b-9a8f-0123456789ab",
    email: "lee@example.com",
    first_name: "Lee",
    last_name: "Wakeman",
  };

  it("accepts a well-formed request and trims names/email", () => {
    const r = validateBootstrapInput({ ...valid, first_name: "  Lee  ", email: " lee@example.com " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.first_name).toBe("Lee");
      expect(r.value.email).toBe("lee@example.com");
    }
  });

  it("rejects a non-UUID user_id", () => {
    const r = validateBootstrapInput({ ...valid, user_id: "not-a-uuid" });
    expect(r.ok).toBe(false);
  });

  it("rejects a missing/invalid email", () => {
    expect(validateBootstrapInput({ ...valid, email: "nope" }).ok).toBe(false);
    expect(validateBootstrapInput({ ...valid, email: undefined }).ok).toBe(false);
  });

  it("rejects blank names", () => {
    expect(validateBootstrapInput({ ...valid, first_name: "   " }).ok).toBe(false);
    expect(validateBootstrapInput({ ...valid, last_name: "" }).ok).toBe(false);
  });
});
