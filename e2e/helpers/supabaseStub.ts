import type { Page, Route } from "@playwright/test";

/**
 * A stub for Supabase's HTTP surface, installed via Playwright route interception.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
 *
 * REAL here: the production bundle, a real Chromium, real React Router, the real
 * `AuthContext`, the real `ProtectedRoute`, the real `supabase-js` client (it
 * builds its own requests, parses its own responses, and persists its own session
 * to localStorage), the real zod form schemas, and the real multi-step wizard.
 *
 * STUBBED: only what crosses the network to Supabase — PostgREST, GoTrue, and the
 * edge functions. Requests are asserted, not merely absorbed: `calls` records every
 * intercepted request so a test can prove the app *did* call `partner-register`
 * with the right body. That is the check that would have caught the defect where
 * `/partner/join` reported success having invoked nothing at all.
 *
 * So this is NOT a full-stack end-to-end test. It cannot prove a migration, an RLS
 * policy, a database constraint, a GoTrue behaviour, or that an email is delivered.
 * A full-stack partner journey needs a live Postgres + GoTrue, i.e. `supabase start`,
 * i.e. Docker — unavailable in the environment this was written in. What it does
 * prove is every client-side leg of the journey, which is where all five defects
 * fixed this cycle actually lived (see `partnerJourney.spec.ts`).
 *
 * The Supabase origin is whatever `playwright.config.ts` builds the bundle against
 * (`VITE_SUPABASE_URL`), NOT the real project — no stub can reach production, and
 * an unstubbed call fails rather than escaping.
 */

export const SUPABASE_ORIGIN = "http://127.0.0.1:54321";

export type PartnerStatus = "invited" | "pending" | "active" | "suspended";

/** One intercepted request, for assertions after the fact. */
export interface RecordedCall {
  /** Path + query, origin stripped — e.g. `/functions/v1/partner-register`. */
  path: string;
  method: string;
  body: unknown;
}

/** A `staff` row, as the staff login and the call-centre header read it. */
export interface StaffRow {
  id: string;
  user_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_on_call: boolean;
}

export interface StubScenario {
  /**
   * The `staff` row the staff login and the call-centre header find, or absent for a
   * non-staff journey. The stub keeps it STATEFUL: a PATCH to `/rest/v1/staff` mutates it, so a
   * reload — or a fresh login — sees what the app actually wrote. That is what makes "on duty
   * survives a reload" a real assertion rather than a re-render of a value the test supplied.
   */
  staff?: StaffRow | null;
  /**
   * The `partners` row the login lookup finds, or `null` for "no row" — the
   * applicant case, where an application exists under the email but carries no
   * `user_id`, so the lookup by `user_id` legitimately misses.
   */
  partner?: { id: string; status: PartnerStatus; contact_name?: string } | null;
  /** What `get_user_role_info` returns. Defaults to a partner iff `partner.status === "active"`. */
  roleInfo?: Partial<RoleInfo>;
  /** Override the `partner-register` response — e.g. to force a server validation failure. */
  registerResponse?: { status: number; body: unknown };
  /** Override the `partner-verify` response. */
  verifyResponse?: { status: number; body: unknown };
  /**
   * Override the `member-self-service` response — e.g. to force the accuracy refusal the
   * function performs server-side. Named rather than folded into a generic
   * "any edge function succeeds" branch on purpose: an UNRECOGNISED function must keep failing
   * loudly (the 501 at the bottom of this router), because a journey that silently succeeds
   * against a function nobody stubbed is the defect this stub exists to catch.
   */
  memberSelfServiceResponse?: { status: number; body: unknown };
  /** Fail the password grant, as GoTrue does on bad credentials. */
  signInError?: { status: number; body: unknown };
  /**
   * Rows for any other PostgREST table, keyed by table name — `{ staff_shifts: [...] }`.
   *
   * Generic rather than a field per table: a journey that needs a rota, a holiday and a festivo
   * would otherwise add three more named options to this file, and the next journey three more.
   * Filters are NOT applied — the stub answers a `select` with the whole array — so a spec seeds
   * only rows it wants the page to show, and the FILTERS themselves are asserted in the vitest
   * suites (src/test/myShiftsPage.test.tsx records every `.eq`/`.gte`/`.lte`). What a browser
   * test can prove that they cannot is that the page renders and routes for real.
   */
  tables?: Record<string, unknown[]>;
}

interface RoleInfo {
  is_staff: boolean;
  staff_role: string | null;
  is_partner: boolean;
  partner_id: string | null;
  member_id: string | null;
}

const USER_ID = "f330e208-3648-4c99-8e04-79876d204e50";

/** A structurally valid JWT. supabase-js reads `exp`, so a random string will not do. */
function fakeJwt(): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  // Fixed, far-future expiry: a relative one would make the suite time-dependent.
  const exp = 4102444800; // 2100-01-01
  return [
    b64({ alg: "HS256", typ: "JWT" }),
    b64({ sub: USER_ID, role: "authenticated", aud: "authenticated", exp, iat: 1700000000 }),
    "stub-signature-not-verified-by-the-client",
  ].join(".");
}

function fakeUser(email: string) {
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: "2026-08-01T00:00:00Z",
    phone: "",
    confirmed_at: "2026-08-01T00:00:00Z",
    last_sign_in_at: "2026-08-11T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-11T00:00:00Z",
    is_anonymous: false,
  };
}

function session(email: string) {
  return {
    access_token: fakeJwt(),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 4102444800,
    refresh_token: "stub-refresh-token",
    user: fakeUser(email),
  };
}

/**
 * Install the stub. Returns the mutable list of recorded calls, plus a `patch`
 * so a test can change the backend's answers mid-journey — which is exactly what
 * verification is: the same partner row, `pending` before and `active` after.
 */
export async function installSupabaseStub(page: Page, initial: StubScenario = {}) {
  const calls: RecordedCall[] = [];
  let scenario: StubScenario = { ...initial };

  // Two pieces of first-visit UI stand between a cold browser and the journey, and
  // both must be settled BEFORE the app mounts:
  //
  //  - The GDPR banner renders a Radix overlay (`fixed inset-0 z-50`) that swallows
  //    every click on the page beneath it. `e2e/public.spec.ts` can exempt those
  //    buttons from its heuristic; a journey has to actually get past them.
  //  - The language picker: assertions below match English copy, so the locale is
  //    pinned rather than left to the browser's Accept-Language.
  //
  // Consent is seeded as essential-only — the narrowest choice, so nothing here
  // depends on analytics or marketing being switched on.
  await page.addInitScript(() => {
    localStorage.setItem(
      "ice_cookie_consent",
      JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        consentedAt: "2026-08-01T00:00:00.000Z",
      })
    );
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("iceAlarmLanguageSelected", "true");
  });

  const roleInfoFor = (): RoleInfo => {
    const isActivePartner = scenario.partner?.status === "active";
    const staff = scenario.staff;
    return {
      is_staff: !!staff?.is_active,
      staff_role: staff?.is_active ? staff.role : null,
      is_partner: isActivePartner,
      partner_id: isActivePartner ? (scenario.partner?.id ?? null) : null,
      member_id: null,
      ...scenario.roleInfo,
    };
  };

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      // PostgREST and GoTrue both send permissive CORS; without these the browser
      // rejects the stubbed response and the failure looks like a network error.
      headers: {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-range",
      },
      body: JSON.stringify(body),
    });

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname + url.search;
    const method = request.method();

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        },
        body: "",
      });
    }

    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    calls.push({ path, method, body });

    // ── edge functions ────────────────────────────────────────────────────
    if (url.pathname === "/functions/v1/partner-register") {
      const r = scenario.registerResponse;
      if (r) return json(route, r.body, r.status);
      return json(route, {
        success: true,
        message: "Registration received. Check your email to verify your account.",
      });
    }

    if (url.pathname === "/functions/v1/partner-verify") {
      const r = scenario.verifyResponse;
      if (r) return json(route, r.body, r.status);
      return json(route, {
        success: true,
        partner: { contact_name: scenario.partner?.contact_name ?? "Partner" },
      });
    }

    if (url.pathname === "/functions/v1/member-self-service") {
      const r = scenario.memberSelfServiceResponse;
      if (r) return json(route, r.body, r.status);
      return json(route, { success: true });
    }

    // ── GoTrue ────────────────────────────────────────────────────────────
    if (url.pathname === "/auth/v1/token") {
      if (scenario.signInError) {
        return json(route, scenario.signInError.body, scenario.signInError.status);
      }
      const email =
        (body as { email?: string } | null)?.email ?? "partner@example.com";
      return json(route, session(email));
    }

    if (url.pathname === "/auth/v1/user") {
      return json(route, fakeUser("partner@example.com"));
    }

    if (url.pathname === "/auth/v1/logout") {
      return json(route, {}, 204);
    }

    // ── PostgREST ─────────────────────────────────────────────────────────
    if (url.pathname === "/rest/v1/rpc/get_user_role_info") {
      return json(route, roleInfoFor());
    }

    // ── staff (stateful, and optionally a whole team) ─────────────────────
    //
    // A PATCH always mutates the SIGNED-IN row, which is what makes "on duty survives a reload"
    // a real assertion. A read returns the whole team when `tables.staff` names one — a rota
    // screen has a row per person and would otherwise show only the person looking at it, which
    // is how the first version of e2e/supervisorRota.spec.ts failed. The signed-in row is
    // substituted into that list by id, so statefulness survives the team.
    if (url.pathname === "/rest/v1/staff") {
      if (method === "PATCH") {
        const patch = (body ?? {}) as Partial<StaffRow>;
        if (scenario.staff) scenario.staff = { ...scenario.staff, ...patch };
        return json(route, scenario.staff ? [scenario.staff] : []);
      }
      const team = scenario.tables?.staff as Array<Record<string, unknown>> | undefined;
      if (team) {
        const live = scenario.staff;
        const rows = live
          ? team.map((row) => (row.id === live.id ? { ...row, ...live } : row))
          : team;
        // IDENTITY FILTERS ARE HONOURED, and they have to be: the login and the header look
        // themselves up with `.eq("user_id", …).maybeSingle()`, and handing four rows to
        // `maybeSingle` is an error — which is exactly how this failed first, with every test
        // stuck on the login screen. Only the three identity columns are filtered; everything
        // else is still answered in full, because a rota screen wants the team.
        const identity = ["id", "user_id", "email"] as const;
        const wanted = identity
          .map((column) => [column, url.searchParams.get(column)] as const)
          .filter((pair): pair is readonly [(typeof identity)[number], string] => !!pair[1])
          .map(([column, value]) => [column, value.replace(/^eq\./, "")] as const);
        const filtered = wanted.length
          ? rows.filter((row) => wanted.every(([column, value]) => String(row[column]) === value))
          : rows;
        return json(route, filtered);
      }
      return json(route, scenario.staff ? [scenario.staff] : []);
    }

    // Presence is an OBSERVATION and the app only ever writes it; the rows are recorded in
    // `calls` so a test can prove the heartbeat fired, and nothing reads them back.
    if (url.pathname === "/rest/v1/staff_presence") {
      return json(route, []);
    }

    if (url.pathname === "/rest/v1/partners") {
      // `.maybeSingle()` on no row: PostgREST returns an empty array, and
      // supabase-js resolves `data: null` WITHOUT an error. That distinction is
      // the whole reason the login's not-found branch exists.
      return json(route, scenario.partner ? [scenario.partner] : []);
    }

    // Any other table: the rows this scenario seeded, or an empty result so pages that fan out
    // queries render their empty state instead of hanging. Still recorded in `calls`.
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = scenario.tables?.[table] ?? [];

      /*
        `.single()` / `.maybeSingle()` GET A SINGLE OBJECT, because that is what PostgREST sends.
        Both set `Accept: application/vnd.pgrst.object+json`, and PostgREST then answers with a
        BARE OBJECT (or 406 / PGRST116 when there is no row) rather than an array.

        This stub answered every read with an array, and supabase-js does not check: it hands the
        array straight back as `data`. So a page doing `.select("*").eq("id", …).single()` got
        `[{…}]`, every field read off it was `undefined`, and the page rendered its "we have no
        value for that" state while looking completely healthy. Measured: the member profile page
        showed the Home location row correctly and then could not geocode the member's address,
        because `profile.address_line_1` was undefined — two Playwright failures with no visible
        cause, in a spec whose fixtures were right all along.

        DELIBERATELY NOT APPLIED to the `staff` and `partners` branches above. Those have their
        own hand-written shaping that the four existing specs are calibrated against, and
        changing what a staff lookup returns is a change to how every one of them logs in. Worth
        doing separately, with those specs in front of you; not worth smuggling into a fix for
        an unrelated table.
      */
      const wantsObject = (request.headers()["accept"] ?? "").includes("application/vnd.pgrst.object+json");
      if (wantsObject) {
        if (rows.length === 0) {
          // Exactly what PostgREST says, and what supabase-js turns into `data: null` for
          // maybeSingle and into an error for single.
          return json(
            route,
            {
              code: "PGRST116",
              details: "The result contains 0 rows",
              hint: null,
              message: "JSON object requested, multiple (or no) rows returned",
            },
            406,
          );
        }
        return json(route, rows[0]);
      }
      return json(route, rows);
    }

    // Deliberately not a silent pass-through: an unrecognised Supabase call is a
    // gap in this stub, and a test asserting on it should fail loudly.
    return json(route, { error: `unstubbed Supabase path: ${path}` }, 501);
  });

  return {
    calls,
    /** Change the backend's answers mid-journey (verification, suspension, …). */
    patch(next: StubScenario) {
      scenario = { ...scenario, ...next };
    },
    /** The staff row as it stands after whatever the app has written to it. */
    staffRow() {
      return scenario.staff ?? null;
    },
    /** Every recorded call to a given edge function. */
    functionCalls(name: string) {
      return calls.filter((c) => c.path.startsWith(`/functions/v1/${name}`));
    },
  };
}

/** A complete, valid set of answers for the `/partner/join` wizard. */
export const VALID_PARTNER_FORM = {
  contact_name: "Ana",
  last_name: "Moreno",
  email: "partner@example.com",
  phone: "+34600111222",
  payout_beneficiary_name: "Ana Moreno",
  payout_iban: "ES9121000418450200051332",
  // Satisfies both schemas: 8+ chars, upper, lower, digit. A password that met only
  // the client's old `min(8)` was the production failure this pins.
  password: "Partner123",
};
