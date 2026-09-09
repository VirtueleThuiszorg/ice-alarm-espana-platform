// @vitest-environment node
//
// WHO MAY PUT A MESSAGE ON EVERY ADMIN'S PHONE.
//
// `notify-admin` had no caller check. It is not listed in supabase/config.toml, so `verify_jwt`
// defaults to true — which stops an anonymous caller and NOBODY ELSE. Any signed-in user, a
// member on the client surface included, could post
//
//     { event_type: "escalation.call_failed", payload: { member_name: "<anything>" } }
//
// and Twilio would put that text on every admin's WhatsApp, logged as a genuine SOS-ladder
// failure. The money is not the harm; the harm is an admin learning that the one alert which
// must never be ignored can be faked.
//
// These tests EXECUTE the guard. The version of this check that lived inline in notify-staff was
// asserted by source scan (`expect(fn).toContain('bearer === serviceRoleKey')`), which survives
// deleting the branch that uses it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  NOTIFY_CALLER_ROLES,
  identifyNotifyCaller,
  type CallerLookup,
} from "../../supabase/functions/_shared/admin-caller";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SERVICE_KEY = "service-role-key-xxxxxxxxxxxxxxxx";

/**
 * A Supabase client stub with only what the guard touches. `staffRow` is what the staff lookup
 * finds; null means "this user is not active staff".
 */
function fakeDb(opts: {
  user?: { id: string } | null;
  authError?: { message: string } | null;
  staffRow?: { role: string } | null;
}) {
  const calls = { getUser: [] as string[], from: [] as string[], eq: [] as Array<[string, unknown]> };
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      calls.eq.push([col, val]);
      return chain;
    },
    maybeSingle: async () => ({ data: opts.staffRow ?? null, error: null }),
  };
  const db = {
    auth: {
      getUser: async (token: string) => {
        calls.getUser.push(token);
        return {
          data: { user: opts.user ?? null },
          error: opts.authError ?? null,
        };
      },
    },
    from: (table: string) => {
      calls.from.push(table);
      return chain;
    },
  };
  // No cast: the guard takes a structural `CallerLookup`, which is the whole point — the rule
  // that decides who may text every admin is testable without a database.
  return { db: db as CallerLookup, calls };
}

describe("identifyNotifyCaller", () => {
  it("accepts the service role by exact key match, with no round trip to the auth server", async () => {
    // No round trip on purpose: the loud safety alerts are raised by runners at the moment
    // something is already going wrong, and an auth call is one more thing that can fail.
    const { db, calls } = fakeDb({});
    const verdict = await identifyNotifyCaller(db, `Bearer ${SERVICE_KEY}`, SERVICE_KEY);

    expect(verdict).toEqual({ ok: true, caller: "service_role", userId: null });
    expect(calls.getUser).toHaveLength(0);
    expect(calls.from).toHaveLength(0);
  });

  it("accepts a bare key with no Bearer prefix, and tolerates whitespace", async () => {
    const { db } = fakeDb({});
    expect(await identifyNotifyCaller(db, SERVICE_KEY, SERVICE_KEY)).toMatchObject({
      caller: "service_role",
    });
    expect(await identifyNotifyCaller(db, `bearer  ${SERVICE_KEY} `, SERVICE_KEY)).toMatchObject({
      caller: "service_role",
    });
  });

  it("REFUSES the empty header even when the service-role key is itself unset", async () => {
    /*
      The failure this exists to prevent: with SUPABASE_SERVICE_ROLE_KEY missing from the
      function's environment, `bearer === serviceRoleKey` is `"" === ""` — true. Every caller,
      including an anonymous one, would arrive as the service role, and the guard would read as
      if it were working. The empty-bearer refusal is what makes that unreachable, so deleting
      it is not "one redundant check fewer".
    */
    const { db, calls } = fakeDb({ user: { id: "u-1" }, staffRow: { role: "admin" } });
    expect(await identifyNotifyCaller(db, "Bearer ", "")).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    expect(await identifyNotifyCaller(db, null, "")).toMatchObject({ ok: false, status: 401 });
    // Nothing was even looked up: no user, no staff row, no service role.
    expect(calls.getUser).toHaveLength(0);

    // ...and a real token is still judged on its merits rather than matched against "".
    expect(await identifyNotifyCaller(db, "Bearer some-user-jwt", "")).toMatchObject({
      ok: true,
      caller: "admin",
    });
    expect(calls.getUser).toEqual(["some-user-jwt"]);
  });

  it("refuses a missing or unreadable token with 401", async () => {
    expect(await identifyNotifyCaller(fakeDb({}).db, null, SERVICE_KEY)).toMatchObject({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    expect(await identifyNotifyCaller(fakeDb({ user: null }).db, "Bearer nope", SERVICE_KEY)).toMatchObject({
      ok: false,
      status: 401,
      error: "Invalid token",
    });
    // A getUser that ERRORS is not a caller either — the pattern copied into six other functions
    // checks `authError` in some and not others.
    const errored = fakeDb({ user: { id: "u-1" }, authError: { message: "jwt expired" } });
    expect(await identifyNotifyCaller(errored.db, "Bearer expired", SERVICE_KEY)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("accepts admin and super_admin — and refuses every other staff role with 403", async () => {
    for (const role of NOTIFY_CALLER_ROLES) {
      const { db } = fakeDb({ user: { id: "u-1" }, staffRow: { role } });
      expect(await identifyNotifyCaller(db, "Bearer jwt", SERVICE_KEY), role).toMatchObject({
        ok: true,
        caller: "admin",
        userId: "u-1",
      });
    }

    // An operator is deliberately not enough: somebody who can post here can text the whole
    // company, and every one of those messages arrives looking official.
    for (const role of ["operator", "call_centre", "nurse", "partner", "staff", "viewer"]) {
      const { db } = fakeDb({ user: { id: "u-2" }, staffRow: { role } });
      expect(await identifyNotifyCaller(db, "Bearer jwt", SERVICE_KEY), role).toEqual({
        ok: false,
        status: 403,
        error: "Admin access required",
      });
    }
  });

  it("refuses a signed-in user who is not staff at all — the member-surface case", async () => {
    // The actual attacker in the paragraph at the top of this file: a member with a valid JWT.
    const { db, calls } = fakeDb({ user: { id: "member-1" }, staffRow: null });
    expect(await identifyNotifyCaller(db, "Bearer member-jwt", SERVICE_KEY)).toEqual({
      ok: false,
      status: 403,
      error: "Admin access required",
    });
    expect(calls.from).toEqual(["staff"]);
  });

  it("looks the caller up by user_id AND is_active — a deactivated admin is not an admin", async () => {
    const { db, calls } = fakeDb({ user: { id: "u-9" }, staffRow: { role: "admin" } });
    await identifyNotifyCaller(db, "Bearer jwt", SERVICE_KEY);
    expect(calls.eq).toEqual([
      ["user_id", "u-9"],
      ["is_active", true],
    ]);
  });
});

describe("both notification doors use it", () => {
  // Pinned as the CALL and the BRANCH, never as the word: a mutation that keeps the import and
  // drops the `if (!verdict.ok)` return would leave the name in place.
  for (const fn of ["notify-admin", "notify-staff"]) {
    it(`${fn} identifies its caller and returns the refusal`, () => {
      const src = stripComments(read(`supabase/functions/${fn}/index.ts`));
      expect(src).toMatch(/await identifyNotifyCaller\(\s*\w+,\s*req\.headers\.get\("Authorization"\)/);
      expect(src).toMatch(/if \(!verdict\.ok\)/);
      expect(src).toMatch(/verdict\.status/);
      // The guard runs BEFORE the body is read and acted on, so a refused caller never reaches
      // the formatters or the dispatcher.
      expect(src.indexOf("identifyNotifyCaller")).toBeLessThan(src.indexOf("req.json()"));
      // ...and there is no second, looser copy of the rule left behind in the function.
      expect(src).not.toMatch(/bearer === serviceRoleKey/);
      expect(src).not.toMatch(/is_staff|isStaff/);
    });
  }

  it("is ONE implementation, not one per function", () => {
    for (const fn of ["notify-admin", "notify-staff"]) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, fn).not.toContain("auth.getUser");
      expect(src, fn).not.toContain('"Admin access required"');
    }
  });
});

describe("the guard cannot be bypassed by the shape of the header", () => {
  it("does not accept a key that merely contains, or is contained by, the service-role key", async () => {
    /*
      `.includes()` or `.startsWith()` instead of `===` promotes a caller to the SERVICE ROLE —
      the one identity that skips the role check completely.

      THE FAKE HERE IS A VALID ADMIN on purpose. The first version of this test used a fake with
      no user, so every header came back `{ok: false}` and the assertion passed whether the
      comparison was `===`, `.includes()` or `.startsWith()` — it was reading the fake's missing
      user, not the guard. With a real admin behind the token, a correct guard answers `admin`
      (having gone to the auth server) and a broken one answers `service_role` (having not).
    */
    for (const header of [
      `Bearer ${SERVICE_KEY}-extra`,
      `Bearer x${SERVICE_KEY}`,
      `Bearer ${SERVICE_KEY.slice(0, 10)}`,
      `Bearer ${SERVICE_KEY.slice(4)}`,
    ]) {
      const { db, calls } = fakeDb({ user: { id: "u-1" }, staffRow: { role: "admin" } });
      const verdict = await identifyNotifyCaller(db, header, SERVICE_KEY);
      expect(verdict, header).toMatchObject({ ok: true, caller: "admin" });
      expect(calls.getUser, header).toHaveLength(1);
    }

    // And a non-staff holder of such a token is refused outright rather than promoted.
    const { db } = fakeDb({ user: { id: "member-1" }, staffRow: null });
    expect(await identifyNotifyCaller(db, `Bearer ${SERVICE_KEY}-extra`, SERVICE_KEY)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("never logs the token it was given", () => {
    const src = read("supabase/functions/_shared/admin-caller.ts");
    expect(src).not.toMatch(/console\.(log|info|warn|error)/);
  });
});

describe("no other caller of these two functions is broken by the guard", () => {
  /*
    Ten internal callers reach notify-admin. Each one must present the service-role key, or the
    change silences a live alert — including the four loud safety alerts. Asserted by reading the
    call sites, because "it compiled" says nothing about an Authorization header.
  */
  const serviceRoleCallers = [
    "supabase/functions/ev07b-checkin/index.ts",
    "supabase/functions/ev07b-sos-alert/index.ts",
    "supabase/functions/ev07b-offline-monitor/index.ts",
    "supabase/functions/staff-shift-monitor/index.ts",
    "supabase/functions/sos-escalation-runner/index.ts",
    "supabase/functions/_shared/notify-emergency-contacts.ts",
    "supabase/functions/_shared/post-payment.ts",
  ];

  it("every fetch() to notify-admin sends a bearer, and it is the service-role key", () => {
    for (const path of serviceRoleCallers) {
      const src = read(path);
      // Every occurrence, and the headers that follow it. A call site that grew a second,
      // unauthenticated fetch would be caught by the loop rather than hidden by the first.
      const sites = [...src.matchAll(/functions\/v1\/notify-admin/g)].map((m) =>
        src.slice(m.index ?? 0, (m.index ?? 0) + 400),
      );
      expect(sites.length, `${path} has a notify-admin call`).toBeGreaterThan(0);

      for (const site of sites) {
        const bearer = site.match(/"?Authorization"?:\s*`Bearer \$\{(.+?)\}`/);
        expect(bearer, `${path} sends an Authorization header`).not.toBeNull();
        const expr = bearer![1].trim();

        // THE NAME IS NOT THE PROOF — resolve the expression. Three legitimate shapes:
        //   * the secret read inline:   `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`
        //   * a local bound to it:      `const serviceKey = Deno.env.get("SUPABASE_...")`
        //   * the shared helper's own `serviceKey` parameter, whose two call sites are
        //     resolved by the next test.
        const inline = /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(expr);
        const boundHere =
          /^[A-Za-z_][\w.]*$/.test(expr) &&
          new RegExp(`${expr}\\s*=\\s*Deno\\.env\\.get\\("SUPABASE_SERVICE_ROLE_KEY"\\)`).test(src);
        const isHelperParam =
          path.endsWith("notify-emergency-contacts.ts") && expr === "serviceKey";

        expect(
          inline || boundHere || isHelperParam,
          `${path}: bearer \`${expr}\` is the service-role key`,
        ).toBe(true);
      }
    }
  });

  it("the shared emergency-contact helper is handed the service-role key by both callers", () => {
    // Its `serviceKey` parameter is the bearer for the LOUD escalation alerts. A caller passing
    // an anon key would silence exactly the alerts that say the SOS ladder failed.
    for (const path of [
      "supabase/functions/ev07b-checkin/index.ts",
      "supabase/functions/ev07b-sos-alert/index.ts",
    ]) {
      const src = read(path);
      const call = src.slice(src.indexOf("notifyEmergencyContacts("));
      // Second positional argument, whether passed inline or as a local.
      const arg = call.match(/notifyEmergencyContacts\(\s*[^,]+,\s*([^,]+),/);
      expect(arg, path).not.toBeNull();
      const expr = arg![1].trim().replace(/!$/, "");
      const resolves =
        /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(expr) ||
        (/^[A-Za-z_][\w.]*$/.test(expr) &&
          new RegExp(`${expr}\\s*=\\s*Deno\\.env\\.get\\("SUPABASE_SERVICE_ROLE_KEY"\\)`).test(src));
      expect(resolves, `${path}: ${expr} is the service-role key`).toBe(true);
    }
  });

  it("partner-register invokes it on a service-role client", () => {
    const src = read("supabase/functions/partner-register/index.ts");
    expect(src).toMatch(/createClient\(supabaseUrl, supabaseServiceKey/);
    expect(src).toContain('invoke("notify-admin"');
  });

  it("the two browser callers are on admin screens", () => {
    for (const path of [
      "src/components/admin/dashboard/NotificationSettings.tsx",
      "src/components/admin/dashboard/PaidSalesFeed.tsx",
    ]) {
      expect(read(path), path).toContain('invoke("notify-admin"');
    }
    // Both render inside /admin, which is behind requireAdmin — so their JWT satisfies the
    // guard's second branch. If either ever moved to a staff page, the test button would 403.
    const routes = read("src/App.tsx");
    expect(routes).toMatch(/requireAdmin|AdminRoute|RequireAdmin/);
  });
});
