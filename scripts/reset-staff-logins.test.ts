/**
 * Tests for scripts/reset-staff-logins.ts.
 *
 * The centrepiece is the project-ref guard: feed it a mismatched
 * (SUPABASE_URL, service key) pair and assert it REFUSES. That mismatch is the
 * failure this script exists to prevent, so it is asserted negatively — the run
 * must not be permitted — per GOALS.md "prove the negative".
 *
 * No real project ref, email, password or key appears here. Every ref below is a
 * 20-char fake in the Supabase shape; every key is a locally-constructed unsigned
 * JWT. Nothing in this file can authenticate against anything.
 */

import { describe, expect, it } from "vitest";
import {
  assertRefMatch,
  describePassword,
  loadConfig,
  main,
  maskEmail,
  parseArgs,
  projectRefFromUrl,
  refClaimFromServiceKey,
  RefMismatchError,
  renderDiff,
  validateConfig,
  type ResolvedAccount,
} from "../scripts/reset-staff-logins.ts";

// ── helpers ────────────────────────────────────────────────────────────────

/** Builds an unsigned JWT carrying the given claims. Not a credential. */
function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.not-a-real-signature`;
}

const serviceKeyFor = (ref: string) => fakeJwt({ iss: "supabase", ref, role: "service_role" });

// Two distinct fake refs, both in the real 20-lowercase-char Supabase shape.
const REF_A = "aaaaaaaaaaaaaaaaaaaa";
const REF_B = "bbbbbbbbbbbbbbbbbbbb";

const urlFor = (ref: string) => `https://${ref}.supabase.co`;

// ── the guard: the mismatch case that matters most ─────────────────────────

describe("assertRefMatch — the ref-mismatch guard", () => {
  it("REFUSES a mismatched url/key pair", () => {
    expect(() => assertRefMatch(urlFor(REF_A), serviceKeyFor(REF_B))).toThrow(RefMismatchError);
  });

  it("names both refs in the refusal so the operator can see which is wrong", () => {
    let caught: unknown;
    try {
      assertRefMatch(urlFor(REF_A), serviceKeyFor(REF_B));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RefMismatchError);
    const message = (caught as Error).message;
    expect(message).toContain("PROJECT REF MISMATCH");
    expect(message).toContain(REF_A);
    expect(message).toContain(REF_B);
    // It must be explicit that nothing happened, and that bypassing is wrong.
    expect(message).toContain("Nothing was read or written");
    expect(message).toContain("do not bypass");
  });

  it("refuses regardless of which side is which (symmetry)", () => {
    expect(() => assertRefMatch(urlFor(REF_B), serviceKeyFor(REF_A))).toThrow(RefMismatchError);
  });

  it("allows a correctly matched pair, and reports it verified", () => {
    const result = assertRefMatch(urlFor(REF_A), serviceKeyFor(REF_A));
    expect(result).toEqual({ urlRef: REF_A, keyRef: REF_A, verified: true });
  });

  it("refuses an opaque sb_secret_* key, because the ref cannot be verified", () => {
    expect(() => assertRefMatch(urlFor(REF_A), "sb_secret_opaque_value_not_a_jwt")).toThrow(
      /cannot verify the service key belongs to project/,
    );
  });

  it("allows an unverifiable key only under the explicit override, and marks it unverified", () => {
    const result = assertRefMatch(urlFor(REF_A), "sb_secret_opaque_value_not_a_jwt", {
      acceptUnverifiableRef: true,
    });
    expect(result.verified).toBe(false);
    expect(result.urlRef).toBe(REF_A);
  });

  it("refuses a JWT with no ref claim even though it parses", () => {
    expect(() => assertRefMatch(urlFor(REF_A), fakeJwt({ role: "service_role" }))).toThrow(
      /no `ref` claim/,
    );
  });

  it("refuses a remote key aimed at a local URL", () => {
    expect(() => assertRefMatch("http://localhost:54321", serviceKeyFor(REF_A))).toThrow(
      /local host, but the service key belongs to remote project/,
    );
  });

  it("refuses a malformed SUPABASE_URL rather than guessing", () => {
    expect(() => assertRefMatch("not-a-url", serviceKeyFor(REF_A))).toThrow(RefMismatchError);
  });

  it("does not treat a ref that merely prefixes another as a match", () => {
    const shortRef = "aaaaaaaaaaaaaaaaaaa"; // 19 chars — a prefix of REF_A
    expect(() => assertRefMatch(urlFor(REF_A), serviceKeyFor(shortRef))).toThrow(RefMismatchError);
  });
});

describe("projectRefFromUrl", () => {
  it("takes the first host label", () => {
    expect(projectRefFromUrl(urlFor(REF_A))).toBe(REF_A);
  });

  it("returns null for loopback hosts, which have no project ref", () => {
    expect(projectRefFromUrl("http://localhost:54321")).toBeNull();
    expect(projectRefFromUrl("http://127.0.0.1:54321")).toBeNull();
  });

  it("throws on a bare hostname with no domain", () => {
    expect(() => projectRefFromUrl("https://someheost")).toThrow(RefMismatchError);
  });
});

describe("refClaimFromServiceKey", () => {
  it("reads the ref claim from a JWT", () => {
    expect(refClaimFromServiceKey(serviceKeyFor(REF_A))).toEqual({ parsable: true, ref: REF_A });
  });

  it("reports opaque keys as unparsable rather than as a match", () => {
    const result = refClaimFromServiceKey("sb_secret_abc");
    expect(result.parsable).toBe(false);
  });

  it("reports undecodable payloads as unparsable", () => {
    expect(refClaimFromServiceKey("a.!!!not-base64-json!!!.c").parsable).toBe(false);
  });

  it("rejects a non-string ref claim", () => {
    expect(refClaimFromServiceKey(fakeJwt({ ref: 42 })).parsable).toBe(false);
  });
});

// ── redaction: no secret may reach a log ───────────────────────────────────

describe("redaction", () => {
  it("never returns the password itself", () => {
    const password = "correct-horse-battery-staple";
    const described = describePassword(password);
    expect(described).not.toContain(password);
    expect(described).toBe(`<redacted, ${password.length} chars>`);
  });

  it("masks the local part and domain name but keeps the shape readable", () => {
    expect(maskEmail("alice@example.com")).toBe("a****@e******.com");
  });

  it("does not leak the full local part of an address", () => {
    expect(maskEmail("supervisor@icealarm.es")).not.toContain("supervisor");
  });

  it("handles a single-character local part", () => {
    expect(maskEmail("a@b.co")).toBe("a*@b*.co");
  });

  it("masks defensively when there is no @", () => {
    expect(maskEmail("garbage")).toBe("*******");
  });
});

// ── config validation: refuse anything that could half-apply ───────────────

describe("validateConfig", () => {
  const valid = {
    accounts: [
      { currentEmail: "old@test.invalid", newEmail: "new@test.invalid", newPassword: "a".repeat(16) },
    ],
  };

  it("accepts a well-formed config", () => {
    expect(validateConfig(valid).accounts).toHaveLength(1);
  });

  it("rejects a non-object", () => {
    expect(() => validateConfig(null)).toThrow(/must be an object/);
    expect(() => validateConfig([])).toThrow(/must be an object/);
  });

  it("rejects an empty accounts array", () => {
    expect(() => validateConfig({ accounts: [] })).toThrow(/empty/);
  });

  it("rejects a missing field", () => {
    expect(() =>
      validateConfig({ accounts: [{ currentEmail: "a@b.invalid", newEmail: "c@d.invalid" }] }),
    ).toThrow(/newPassword is required/);
  });

  it("rejects a malformed email", () => {
    expect(() =>
      validateConfig({
        accounts: [{ currentEmail: "not-an-email", newEmail: "c@d.invalid", newPassword: "a".repeat(16) }],
      }),
    ).toThrow(/currentEmail is not a valid email/);
  });

  it("rejects a short password — these are privileged logins", () => {
    expect(() =>
      validateConfig({
        accounts: [{ currentEmail: "a@b.invalid", newEmail: "c@d.invalid", newPassword: "short" }],
      }),
    ).toThrow(/shorter than 12 characters/);
  });

  it("rejects duplicate currentEmail entries", () => {
    expect(() =>
      validateConfig({
        accounts: [
          { currentEmail: "a@b.invalid", newEmail: "c@d.invalid", newPassword: "a".repeat(16) },
          { currentEmail: "A@B.invalid", newEmail: "e@f.invalid", newPassword: "a".repeat(16) },
        ],
      }),
    ).toThrow(/Duplicate currentEmail/);
  });

  it("rejects two accounts collapsing onto one newEmail", () => {
    expect(() =>
      validateConfig({
        accounts: [
          { currentEmail: "a@b.invalid", newEmail: "same@x.invalid", newPassword: "a".repeat(16) },
          { currentEmail: "c@d.invalid", newEmail: "SAME@x.invalid", newPassword: "a".repeat(16) },
        ],
      }),
    ).toThrow(/same newEmail/);
  });

  it("does not put a password into its own error message", () => {
    const password = "sh0rt";
    let message = "";
    try {
      validateConfig({
        accounts: [{ currentEmail: "a@b.invalid", newEmail: "c@d.invalid", newPassword: password }],
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(password);
  });
});

describe("loadConfig", () => {
  it("explains how to supply config when the file is absent", () => {
    expect(() => loadConfig("scripts/definitely-not-here.json")).toThrow(/Never commit real addresses/);
  });
});

// ── CLI: dry run is the default ────────────────────────────────────────────

describe("parseArgs", () => {
  it("defaults to a dry run", () => {
    expect(parseArgs([]).apply).toBe(false);
  });

  it("requires --apply to enable writes", () => {
    expect(parseArgs(["--apply"]).apply).toBe(true);
  });

  it("defaults to masked emails", () => {
    expect(parseArgs([]).unmask).toBe(false);
  });

  it("defaults to enforcing the ref check", () => {
    expect(parseArgs([]).acceptUnverifiableRef).toBe(false);
  });

  it("accepts a custom config path", () => {
    expect(parseArgs(["--config", "/tmp/x.json"]).configPath).toBe("/tmp/x.json");
  });

  it("rejects an unknown flag rather than ignoring it", () => {
    expect(() => parseArgs(["--aply"])).toThrow(/Unknown argument/);
  });

  it("rejects --config with no value", () => {
    expect(() => parseArgs(["--config"])).toThrow(/requires a path/);
  });
});

// ── the dry-run diff: exact, and free of secrets ───────────────────────────

describe("renderDiff", () => {
  const resolved: ResolvedAccount[] = [
    {
      spec: {
        currentEmail: "old.one@test.invalid",
        newEmail: "new.one@test.invalid",
        newPassword: "p".repeat(20),
      },
      staffId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      currentEmailInDb: "old.one@test.invalid",
      role: "admin",
      status: "active",
    },
    {
      spec: {
        currentEmail: "same@test.invalid",
        newEmail: "same@test.invalid",
        newPassword: "q".repeat(14),
      },
      staffId: "33333333-3333-3333-3333-333333333333",
      userId: "44444444-4444-4444-4444-444444444444",
      currentEmailInDb: "same@test.invalid",
      role: "super_admin",
      status: "active",
    },
  ];

  it("lists every account with both ids", () => {
    const diff = renderDiff(resolved, false);
    for (const account of resolved) {
      expect(diff).toContain(account.staffId);
      expect(diff).toContain(account.userId);
    }
  });

  it("shows the email transition for a changing address", () => {
    expect(renderDiff(resolved, true)).toContain("old.one@test.invalid  ->  new.one@test.invalid");
  });

  it("marks an unchanged address as unchanged instead of faking a diff", () => {
    expect(renderDiff(resolved, true)).toContain("same@test.invalid  (unchanged)");
  });

  it("states that public.staff is updated in the same run", () => {
    expect(renderDiff(resolved, false)).toContain("public.staff.email");
    expect(renderDiff(resolved, false)).toContain("lock-step");
  });

  it("never prints a password, masked or not", () => {
    for (const unmask of [true, false]) {
      const diff = renderDiff(resolved, unmask);
      expect(diff).not.toContain("p".repeat(20));
      expect(diff).not.toContain("q".repeat(14));
      expect(diff).toContain("<redacted, 20 chars>");
    }
  });

  it("masks addresses by default", () => {
    const diff = renderDiff(resolved, false);
    expect(diff).not.toContain("old.one@test.invalid");
    expect(diff).toContain("o******@t***.invalid");
  });

  it("shows the email_confirm flag so the operator knows confirmation is forced", () => {
    expect(renderDiff(resolved, false)).toContain("email_confirm : true");
  });
});

// ── end-to-end dry run: prints the full diff, writes nothing ───────────────

describe("main — dry run end to end", () => {
  const STAFF_ROWS = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      user_id: "22222222-2222-2222-2222-222222222222",
      email: "first@test.invalid",
      role: "admin",
      status: "active",
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      user_id: "44444444-4444-4444-4444-444444444444",
      email: "second@test.invalid",
      role: "super_admin",
      status: "active",
    },
  ];

  const CONFIG = JSON.stringify({
    accounts: [
      {
        currentEmail: "first@test.invalid",
        newEmail: "first.new@test.invalid",
        newPassword: "z".repeat(18),
      },
      {
        currentEmail: "second@test.invalid",
        newEmail: "second.new@test.invalid",
        newPassword: "y".repeat(19),
      },
    ],
  });

  /** Records every call so we can assert the dry run wrote nothing. */
  function stubClient() {
    const calls: string[] = [];
    const client = {
      from(table: string) {
        return {
          select: () => ({
            ilike: (_column: string, value: string) => {
              calls.push(`select:${table}`);
              return Promise.resolve({
                data: STAFF_ROWS.filter((r) => r.email.toLowerCase() === value.toLowerCase()),
                error: null,
              });
            },
          }),
          update: () => {
            calls.push(`update:${table}`);
            return { eq: () => Promise.resolve({ error: null }) };
          },
          insert: () => {
            calls.push(`insert:${table}`);
            return Promise.resolve({ error: null });
          },
        };
      },
      auth: {
        admin: {
          updateUserById: () => {
            calls.push("auth.updateUserById");
            return Promise.resolve({ error: null });
          },
        },
      },
    };
    return { client, calls };
  }

  async function runDryRun(argv: string[] = []) {
    const { client, calls } = stubClient();
    const lines: string[] = [];

    const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, cfg: process.env.STAFF_LOGINS_CONFIG };
    process.env.SUPABASE_URL = urlFor(REF_A);
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKeyFor(REF_A);
    process.env.STAFF_LOGINS_CONFIG = CONFIG;

    try {
      const code = await main(argv, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createClient: () => client as any,
        log: (line) => lines.push(line),
      });
      return { code, output: lines.join("\n"), calls };
    } finally {
      process.env.SUPABASE_URL = previous.url;
      process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
      process.env.STAFF_LOGINS_CONFIG = previous.cfg;
    }
  }

  it("exits 0 and announces DRY RUN", async () => {
    const { code, output } = await runDryRun();
    expect(code).toBe(0);
    expect(output).toContain("DRY RUN (writes nothing)");
    expect(output).toContain("DRY RUN — nothing was written");
  });

  it("prints the intended diff for EVERY account", async () => {
    const { output } = await runDryRun(["--unmask"]);
    expect(output).toContain("accounts       : 2");
    expect(output).toContain("first@test.invalid  ->  first.new@test.invalid");
    expect(output).toContain("second@test.invalid  ->  second.new@test.invalid");
    for (const row of STAFF_ROWS) {
      expect(output).toContain(row.id);
      expect(output).toContain(row.user_id);
    }
  });

  it("performs NO write of any kind — only the staff lookups", async () => {
    const { calls } = await runDryRun();
    expect(calls).toEqual(["select:staff", "select:staff"]);
    expect(calls).not.toContain("auth.updateUserById");
    expect(calls).not.toContain("update:staff");
    expect(calls).not.toContain("insert:activity_logs");
  });

  it("confirms the verified project ref in the header", async () => {
    const { output } = await runDryRun();
    expect(output).toContain(`project        : ${REF_A}`);
    expect(output).toContain("ref verified   : yes");
  });

  it("leaks no password into the dry-run output", async () => {
    const { output } = await runDryRun(["--unmask"]);
    expect(output).not.toContain("z".repeat(18));
    expect(output).not.toContain("y".repeat(19));
    expect(output).toContain("<redacted, 18 chars>");
    expect(output).toContain("<redacted, 19 chars>");
  });

  it("refuses at the top of main when the ref is mismatched, before any lookup", async () => {
    const { client, calls } = stubClient();
    const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, cfg: process.env.STAFF_LOGINS_CONFIG };
    process.env.SUPABASE_URL = urlFor(REF_A);
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKeyFor(REF_B);
    process.env.STAFF_LOGINS_CONFIG = CONFIG;

    try {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        main([], { createClient: () => client as any, log: () => {} }),
      ).rejects.toThrow(RefMismatchError);
      // Nothing was even read.
      expect(calls).toEqual([]);
    } finally {
      process.env.SUPABASE_URL = previous.url;
      process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
      process.env.STAFF_LOGINS_CONFIG = previous.cfg;
    }
  });

  it("aborts before writing when an account cannot be resolved", async () => {
    const { client, calls } = stubClient();
    const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, cfg: process.env.STAFF_LOGINS_CONFIG };
    process.env.SUPABASE_URL = urlFor(REF_A);
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKeyFor(REF_A);
    process.env.STAFF_LOGINS_CONFIG = JSON.stringify({
      accounts: [
        { currentEmail: "ghost@test.invalid", newEmail: "ghost.new@test.invalid", newPassword: "w".repeat(15) },
      ],
    });

    try {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        main(["--apply"], { createClient: () => client as any, log: () => {} }),
      ).rejects.toThrow(/no public.staff row with that email/);
      expect(calls).not.toContain("auth.updateUserById");
    } finally {
      process.env.SUPABASE_URL = previous.url;
      process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
      process.env.STAFF_LOGINS_CONFIG = previous.cfg;
    }
  });
});
