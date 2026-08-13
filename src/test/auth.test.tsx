import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ---- Mock react-router-dom ----
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  Navigate: (props: { to: string; replace?: boolean; state?: unknown }) => {
    // Render a data attribute so tests can inspect where we navigate to
    return <div data-testid="navigate" data-to={props.to} />;
  },
  useLocation: () => ({ pathname: "/some-protected-page" }),
  useNavigate: () => mockNavigate,
}));

// ---- Mock AuthContext ----
// We define a mutable auth state that tests can override before each render.
const defaultAuth = {
  user: null as { id: string; email: string } | null,
  session: null,
  isLoading: false,
  isStaff: false,
  staffRole: null as string | null,
  memberId: null as string | null,
  partnerId: null as string | null,
  isPartner: false,
  roleLoadFailed: false,
  signOut: vi.fn(),
  refreshAuth: vi.fn(),
  retryRoleLoad: vi.fn(),
};

let mockAuth = { ...defaultAuth };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

// ---- Mock lucide-react icons to avoid SVG rendering issues ----
vi.mock("lucide-react", () => ({
  Loader2: (props: Record<string, unknown>) => <span data-testid="loader" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="refresh-icon" {...props} />,
}));

// ---- Import the component under test AFTER mocks are set up ----
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PARTNER_DASHBOARD_PATH, staffLandingPath, staffPostLoginPath } from "@/config/constants";
import { readFileSync } from "node:fs";
import path from "node:path";

const readSrc = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

// ============================================================
//  Helpers
// ============================================================

function renderProtected(props: {
  requireStaff?: boolean;
  requireAdmin?: boolean;
  requireMember?: boolean;
  requirePartner?: boolean;
}) {
  return render(
    <ProtectedRoute {...props}>
      <div data-testid="protected-content">Protected Content</div>
    </ProtectedRoute>
  );
}

function getNavigateTo(): string | null {
  const el = screen.queryByTestId("navigate");
  return el ? el.getAttribute("data-to") : null;
}

// ============================================================
//  Tests
// ============================================================

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockAuth = { ...defaultAuth };
    vi.clearAllMocks();
  });

  // ------ Loading state ------

  describe("loading state", () => {
    it("shows a spinner while auth is loading", () => {
      mockAuth.isLoading = true;
      renderProtected({});
      expect(screen.getByTestId("loader")).toBeInTheDocument();
      expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    });
  });

  // ------ Not authenticated ------

  describe("unauthenticated user", () => {
    it("redirects to /login by default", () => {
      renderProtected({});
      expect(getNavigateTo()).toBe("/login");
    });

    it("redirects to /staff/login when requireStaff is set", () => {
      renderProtected({ requireStaff: true });
      expect(getNavigateTo()).toBe("/staff/login");
    });

    it("redirects to /staff/login when requireAdmin is set", () => {
      renderProtected({ requireAdmin: true });
      expect(getNavigateTo()).toBe("/staff/login");
    });

    it("redirects to /partner/login when requirePartner is set", () => {
      renderProtected({ requirePartner: true });
      expect(getNavigateTo()).toBe("/partner/login");
    });
  });

  // ------ Role load failed ------

  describe("role load failure", () => {
    it("shows retry UI when role loading has failed", () => {
      mockAuth.user = { id: "u1", email: "test@example.com" };
      mockAuth.roleLoadFailed = true;

      renderProtected({});

      expect(screen.getByText(/failed to load your account permissions/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("calls retryRoleLoad when retry button is clicked", async () => {
      mockAuth.user = { id: "u1", email: "test@example.com" };
      mockAuth.roleLoadFailed = true;

      renderProtected({});
      screen.getByRole("button", { name: /retry/i }).click();

      expect(mockAuth.retryRoleLoad).toHaveBeenCalledOnce();
    });
  });

  // ------ Admin bypass ------

  describe("admin bypass", () => {
    beforeEach(() => {
      mockAuth.user = { id: "admin1", email: "admin@ice.es" };
      mockAuth.isStaff = true;
      mockAuth.staffRole = "admin";
    });

    it("admin can access standard protected routes", () => {
      renderProtected({});
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("admin can access staff routes", () => {
      renderProtected({ requireStaff: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("admin can access admin routes", () => {
      renderProtected({ requireAdmin: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("admin can access member routes", () => {
      renderProtected({ requireMember: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("admin can access partner routes", () => {
      renderProtected({ requirePartner: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
  });

  describe("super_admin bypass", () => {
    beforeEach(() => {
      mockAuth.user = { id: "sa1", email: "superadmin@ice.es" };
      mockAuth.isStaff = true;
      mockAuth.staffRole = "super_admin";
    });

    it("super_admin can access all protected routes", () => {
      renderProtected({ requireAdmin: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("super_admin can access partner routes", () => {
      renderProtected({ requirePartner: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
  });

  // ------ Staff access ------

  describe("staff (non-admin) access", () => {
    beforeEach(() => {
      mockAuth.user = { id: "s1", email: "staff@ice.es" };
      mockAuth.isStaff = true;
      mockAuth.staffRole = "call_centre";
    });

    it("allows access to staff-required routes", () => {
      renderProtected({ requireStaff: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("denies access to admin-required routes", () => {
      renderProtected({ requireAdmin: true });
      expect(getNavigateTo()).toBe("/unauthorized");
    });

    it("redirects staff to /admin when accessing partner routes", () => {
      renderProtected({ requirePartner: true });
      expect(getNavigateTo()).toBe("/admin");
    });
  });

  // ------ Regression: call_centre_supervisor locked out of /call-centre ------
  //
  // Mary (call_centre_supervisor) could not reach /call-centre: the login redirect
  // tested `role === "call_centre"`, so she fell through to /admin, which
  // requireAdmin rejected to /unauthorized ("Access Denied"). Lee (super_admin) was
  // unaffected because the admin bypass returns before any of that.
  //
  // The route itself (`/call-centre` → ProtectedRoute requireStaff) was never the
  // bug — these tests pin that, so the guard cannot be "fixed" by loosening it.

  describe.each(["call_centre", "call_centre_supervisor"])(
    "%s reaches the call centre and is never signed out",
    (role) => {
      beforeEach(() => {
        mockAuth.user = { id: "s-mary", email: "supervisor@careconneqt.es" };
        mockAuth.isStaff = true;
        mockAuth.staffRole = role;
      });

      it("passes the requireStaff guard that /call-centre uses", () => {
        renderProtected({ requireStaff: true });
        expect(screen.getByTestId("protected-content")).toBeInTheDocument();
        expect(getNavigateTo()).toBeNull();
      });

      it("is NOT signed out when reaching the call centre", () => {
        renderProtected({ requireStaff: true });
        expect(mockAuth.signOut).not.toHaveBeenCalled();
      });

      it("is NOT signed out when rejected from an admin route", () => {
        renderProtected({ requireAdmin: true });
        // Rejection is a redirect, never a session teardown.
        expect(getNavigateTo()).toBe("/unauthorized");
        expect(mockAuth.signOut).not.toHaveBeenCalled();
      });

      it("keeps its session and user after an admin rejection", () => {
        renderProtected({ requireAdmin: true });
        expect(mockAuth.user).not.toBeNull();
        expect(mockAuth.isStaff).toBe(true);
        expect(mockAuth.staffRole).toBe(role);
      });

      it("is not bounced to a login page when rejected — only to /unauthorized", () => {
        renderProtected({ requireAdmin: true });
        const to = getNavigateTo();
        expect(to).toBe("/unauthorized");
        expect(to).not.toBe("/login");
        expect(to).not.toBe("/staff/login");
      });
    }
  );

  describe("no ProtectedRoute rejection ever clears the session", () => {
    // Every rejecting combination, across every role shape, must redirect without
    // signing the user out. A rejection that tears down the session is what makes
    // "Access Denied" look like "you have been logged out".
    const cases: Array<{ name: string; auth: Partial<typeof defaultAuth>; props: Record<string, boolean> }> = [
      {
        name: "call_centre at /admin",
        auth: { isStaff: true, staffRole: "call_centre" },
        props: { requireAdmin: true },
      },
      {
        name: "call_centre_supervisor at /admin",
        auth: { isStaff: true, staffRole: "call_centre_supervisor" },
        props: { requireAdmin: true },
      },
      {
        name: "member at a staff route",
        auth: { memberId: "m-1" },
        props: { requireStaff: true },
      },
      {
        name: "partner at a staff route",
        auth: { isPartner: true, partnerId: "p-1" },
        props: { requireStaff: true },
      },
      {
        name: "roleless user at a partner route",
        auth: {},
        props: { requirePartner: true },
      },
    ];

    it.each(cases)("$name redirects without signing out", ({ auth, props }) => {
      mockAuth = { ...defaultAuth, ...auth, user: { id: "u", email: "u@test.invalid" }, signOut: vi.fn() };

      renderProtected(props);

      // Something happened (a redirect), and it was not a sign-out.
      expect(getNavigateTo()).not.toBeNull();
      expect(mockAuth.signOut).not.toHaveBeenCalled();
      expect(mockAuth.user).not.toBeNull();
    });
  });

  // ------ Member access ------

  describe("member access", () => {
    beforeEach(() => {
      mockAuth.user = { id: "m1", email: "member@test.com" };
      mockAuth.memberId = "member-uuid-123";
    });

    it("allows access to member-required routes", () => {
      renderProtected({ requireMember: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("allows access to unprotected routes", () => {
      renderProtected({});
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("denies access to staff routes", () => {
      renderProtected({ requireStaff: true });
      expect(getNavigateTo()).toBe("/unauthorized");
    });

    it("denies access to admin routes", () => {
      renderProtected({ requireAdmin: true });
      expect(getNavigateTo()).toBe("/unauthorized");
    });

    it("redirects member to /dashboard when accessing partner routes", () => {
      renderProtected({ requirePartner: true });
      expect(getNavigateTo()).toBe("/dashboard");
    });
  });

  // ------ Partner access ------

  describe("partner access", () => {
    beforeEach(() => {
      mockAuth.user = { id: "p1", email: "partner@agency.com" };
      mockAuth.isPartner = true;
      mockAuth.partnerId = "partner-uuid-456";
    });

    it("allows access to partner-required routes", () => {
      renderProtected({ requirePartner: true });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("redirects partner to /partner-dashboard for staff routes", () => {
      renderProtected({ requireStaff: true });
      expect(getNavigateTo()).toBe("/partner-dashboard");
    });

    it("redirects partner to /partner-dashboard for admin routes", () => {
      renderProtected({ requireAdmin: true });
      expect(getNavigateTo()).toBe("/partner-dashboard");
    });

    it("redirects partner to /partner-dashboard for member routes", () => {
      renderProtected({ requireMember: true });
      expect(getNavigateTo()).toBe("/partner-dashboard");
    });
  });

  // ------ Logged-in user with no roles ------

  describe("user with no roles assigned", () => {
    beforeEach(() => {
      mockAuth.user = { id: "u1", email: "new@test.com" };
      // No staff, member, or partner flags set
    });

    it("allows access to unprotected routes", () => {
      renderProtected({});
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("denies access to staff routes", () => {
      renderProtected({ requireStaff: true });
      expect(getNavigateTo()).toBe("/unauthorized");
    });

    it("redirects to /complete-registration for member routes", () => {
      renderProtected({ requireMember: true });
      expect(getNavigateTo()).toBe("/complete-registration");
    });

    it("redirects to /unauthorized for partner routes", () => {
      renderProtected({ requirePartner: true });
      expect(getNavigateTo()).toBe("/unauthorized");
    });
  });
});

// ============================================================
//  Post-login destination — the actual bug
// ============================================================
//
// The lockout was here, not in ProtectedRoute: the login pages tested
// `role === "call_centre"` to decide whether to send a staff member to
// /call-centre, so `call_centre_supervisor` fell through to /admin and was
// rejected. These tests fail against that old allowlist.

describe("staffLandingPath", () => {
  it("sends call_centre_supervisor to /call-centre (the regression)", () => {
    expect(staffLandingPath("call_centre_supervisor")).toBe("/call-centre");
  });

  it("sends call_centre to /call-centre", () => {
    expect(staffLandingPath("call_centre")).toBe("/call-centre");
  });

  it("sends admin and super_admin to /admin", () => {
    expect(staffLandingPath("admin")).toBe("/admin");
    expect(staffLandingPath("super_admin")).toBe("/admin");
  });

  it("never sends a non-admin role to /admin, including roles that do not exist yet", () => {
    // The point of inverting the test: an unrecognised staff role lands somewhere
    // it can actually reach, instead of bouncing off requireAdmin.
    for (const role of ["call_centre", "call_centre_supervisor", "some_future_role", "", null, undefined]) {
      expect(staffLandingPath(role)).toBe("/call-centre");
    }
  });
});

describe("staffPostLoginPath", () => {
  it("defaults each role to its own portal when there is no deep link", () => {
    expect(staffPostLoginPath("call_centre_supervisor")).toBe("/call-centre");
    expect(staffPostLoginPath("call_centre")).toBe("/call-centre");
    expect(staffPostLoginPath("admin")).toBe("/admin");
  });

  it("returns a supervisor to the call-centre page they were bounced off", () => {
    expect(staffPostLoginPath("call_centre_supervisor", "/call-centre/alerts")).toBe(
      "/call-centre/alerts"
    );
  });

  it("ignores an /admin deep link for non-admin staff instead of looping them through Access Denied", () => {
    expect(staffPostLoginPath("call_centre_supervisor", "/admin")).toBe("/call-centre");
    expect(staffPostLoginPath("call_centre", "/admin/members")).toBe("/call-centre");
  });

  it("honours an /admin deep link for admins", () => {
    expect(staffPostLoginPath("admin", "/admin/members")).toBe("/admin/members");
    expect(staffPostLoginPath("super_admin", "/admin/settings")).toBe("/admin/settings");
  });

  it("ignores a call-centre deep link for admins, landing them on /admin", () => {
    expect(staffPostLoginPath("admin", "/call-centre/alerts")).toBe("/admin");
  });

  it("ignores unrelated deep links for every role", () => {
    expect(staffPostLoginPath("call_centre_supervisor", "/dashboard")).toBe("/call-centre");
    expect(staffPostLoginPath("admin", "/dashboard")).toBe("/admin");
  });
});

// ============================================================
//  Both login pages must use the shared helper
// ============================================================
//
// Source-level assertions (the pattern holidayWorkflow.test.ts already uses) so
// the two login pages cannot drift back into their own role allowlists — the
// duplicate logic is why the same bug existed in both files.

describe("login pages share one redirect rule", () => {
  it.each([
    ["src/pages/auth/StaffLogin.tsx", "staff login"],
    ["src/pages/auth/Login.tsx", "member login"],
  ])("%s calls staffPostLoginPath", (file) => {
    const src = readSrc(file);
    expect(src).toMatch(/staffPostLoginPath/);
    expect(src).toMatch(/from "@\/config\/constants"/);
  });

  it.each([
    ["src/pages/auth/StaffLogin.tsx"],
    ["src/pages/auth/Login.tsx"],
  ])("%s no longer hardcodes a call_centre role allowlist", (file) => {
    const src = readSrc(file);
    // The exact shape of the bug: branching the redirect on a single role literal.
    expect(src).not.toMatch(/===\s*["']call_centre["']/);
    expect(src).not.toMatch(/navigate\(\s*["']\/admin["']\s*\)/);
  });
});

// ============================================================
//  Unauthorized never signs anyone out
// ============================================================

describe("Unauthorized page", () => {
  it("contains no sign-out call — Access Denied is not a logout", () => {
    const src = readSrc("src/pages/auth/Unauthorized.tsx");
    expect(src).not.toMatch(/signOut/);
    expect(src).not.toMatch(/auth\.signOut/);
  });

  it("sends staff back to the staff login, not the member login", () => {
    const src = readSrc("src/pages/auth/Unauthorized.tsx");
    expect(src).toMatch(/isStaff \? "\/staff\/login" : "\/login"/);
    expect(src).toMatch(/to=\{loginPath\}/);
  });
});

// ============================================================
//  Partner registration → partner dashboard
// ============================================================
//
// Reported: after completing partner registration the user ended up back at the
// start of the join flow instead of the partner dashboard.
//
// The redirect TARGET was never wrong — PartnerLogin has always navigated to
// /partner-dashboard. The bug was that it navigated *before* the role context
// existed. /partner-dashboard is `requirePartner`, and ProtectedRoute reads
// isPartner/partnerId from AuthContext — not from the `partners` row the login page
// had just queried itself. PartnerLogin was the only login page that did not
// `await refreshAuth()` first, so the redirect raced the onAuthStateChange fetch.
//
// It also could not recover: that listener only refetches when
// `session.user.id !== lastFetchedUserId.current`, so a partner whose role was read
// earlier in the page load while still `pending` was never re-read after
// verification — get_user_role_info reports is_partner only for status='active'.
//
// ProtectedRoute is deliberately NOT loosened; the tests below pin that it still
// refuses anyone without a partner identity.

describe("newly-registered partner reaches the partner dashboard", () => {
  const PARTNER_USER = { id: "aaaaaaaa-0000-0000-0000-000000000001", email: "p@test.invalid" };
  const PARTNER_ROW_ID = "132d1871-5160-4113-a217-7003ac7a556a";

  beforeEach(() => {
    mockAuth = { ...defaultAuth, signOut: vi.fn() };
  });

  it("lands on the dashboard once the role context is populated (post-refreshAuth)", () => {
    // Exactly the state `await refreshAuth()` produces for a verified partner:
    // get_user_role_info returned is_partner=true with a partner_id.
    mockAuth.user = PARTNER_USER;
    mockAuth.isPartner = true;
    mockAuth.partnerId = PARTNER_ROW_ID;

    renderProtected({ requirePartner: true });

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(getNavigateTo()).toBeNull();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it("has a partner_id at that point, not just the boolean", () => {
    mockAuth.user = PARTNER_USER;
    mockAuth.isPartner = true;
    mockAuth.partnerId = PARTNER_ROW_ID;

    renderProtected({ requirePartner: true });

    expect(mockAuth.isPartner).toBe(true);
    expect(mockAuth.partnerId).not.toBeNull();
    expect(mockAuth.partnerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses to /unauthorized — never into the join funnel — while the role is unresolved", () => {
    // The racing state: signed in, but AuthContext has not resolved the partner role.
    mockAuth.user = PARTNER_USER;
    mockAuth.isPartner = false;
    mockAuth.partnerId = null;

    renderProtected({ requirePartner: true });

    const to = getNavigateTo();
    expect(to).toBe("/unauthorized");
    // The reported symptom was landing back at the start of the join flow.
    expect(to).not.toBe("/partner");
    expect(to).not.toBe("/partner/join");
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it("waits rather than refusing while auth is still loading", () => {
    mockAuth.user = PARTNER_USER;
    mockAuth.isLoading = true;

    renderProtected({ requirePartner: true });

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(getNavigateTo()).toBeNull();
  });

  it("is NOT loosened: a user with no partner identity is still refused", () => {
    mockAuth.user = { id: "u-nobody", email: "nobody@test.invalid" };

    renderProtected({ requirePartner: true });

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(getNavigateTo()).toBe("/unauthorized");
  });

  it("is NOT loosened: an unauthenticated visitor still goes to the partner login", () => {
    renderProtected({ requirePartner: true });
    expect(getNavigateTo()).toBe("/partner/login");
  });

  it("the dashboard path is the partner portal home", () => {
    expect(PARTNER_DASHBOARD_PATH).toBe("/partner-dashboard");
  });
});

describe("login pages await refreshAuth before navigating", () => {
  const LOGIN_PAGES = [
    "src/pages/auth/StaffLogin.tsx",
    "src/pages/auth/Login.tsx",
    "src/pages/partner/PartnerLogin.tsx",
  ];

  it.each(LOGIN_PAGES)("%s calls refreshAuth", (file) => {
    expect(readSrc(file)).toMatch(/await refreshAuth\(\)/);
  });

  it("PartnerLogin awaits refreshAuth BEFORE it navigates — the ordering is the fix", () => {
    const src = readSrc("src/pages/partner/PartnerLogin.tsx");
    const refresh = src.indexOf("await refreshAuth()");
    const nav = src.indexOf("navigate(PARTNER_DASHBOARD_PATH)");

    expect(refresh).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(-1);
    expect(refresh).toBeLessThan(nav);
  });

  it("PartnerLogin redirects to the shared partner-dashboard constant", () => {
    const src = readSrc("src/pages/partner/PartnerLogin.tsx");
    expect(src).toMatch(/PARTNER_DASHBOARD_PATH/);
    expect(src).toMatch(/from "@\/config\/constants"/);
  });
});

// Why the await is required, verified against real PostgreSQL 16 using the
// migration's own function body:
//   status='pending' → {"is_partner": false, "partner_id": null}
//   status='active'  → {"is_partner": true,  "partner_id": "<the row's id>"}
// A partner read while pending stays non-partner in AuthContext until something
// forces a re-read. This pins the gate that makes that true.

describe("get_user_role_info partner contract", () => {
  const RPC_MIGRATION =
    "supabase/migrations/20260122124126_30d5eccf-0a25-4890-a500-e702ff9f46c0.sql";

  it("reports is_partner only for an active partners row", () => {
    const sql = readSrc(RPC_MIGRATION);
    expect(sql).toMatch(/FROM public\.partners\s*\n?\s*WHERE user_id = _user_id AND status = 'active'/);
  });

  it("returns partner_id alongside the flag, derived from the same row", () => {
    const sql = readSrc(RPC_MIGRATION);
    expect(sql).toMatch(/_is_partner := _partner_id IS NOT NULL/);
    expect(sql).toMatch(/'is_partner', _is_partner/);
    expect(sql).toMatch(/'partner_id', _partner_id/);
  });
});

// ============================================================
//  Admin post-login destination — the reported "lands on settings" bug
// ============================================================
//
// Report: admin@careconneqt.es (super_admin, staff row correct, user_id linked)
// landed on a settings page after login instead of the admin dashboard.
//
// Three candidate causes were named. Two are ruled out by the assertions below,
// and the third is not a defect but a deliberate feature:
//
//  1. `/admin`'s index route resolving to something other than AdminDashboard —
//     it does not; `<Route index element={<AdminDashboard />} />`.
//  2. A first-login / incomplete-profile check — there is no *profile* check, but
//     there IS a mandatory-2FA-enrolment gate, and that is the actual cause.
//  3. `staffPostLoginPath` honouring an intended deep link — it would need `from`
//     to already be `/admin/settings`, and a fresh login carries no `from`.
//
// THE ACTUAL CAUSE (StaffLogin.onSubmit): an admin or super_admin with no
// *verified* TOTP factor is sent to `/admin/settings?setup2fa=true` and the
// handler RETURNS — so `completeLogin`, and therefore `staffPostLoginPath`, never
// run. This fires on EVERY login until 2FA is enrolled, which is why it reads as
// a broken redirect rather than a one-off setup step.
//
// That gate is deliberate (mandatory 2FA for admins on a life-safety product with
// PHI), so these tests assert the real contract: the destination depends on 2FA
// state. An admin WITH 2FA reaches the dashboard; an admin WITHOUT it is enrolled
// first, by design.

describe("an admin's login destination", () => {
  it.each(["admin", "super_admin"])(
    "%s with no intended path goes to /admin, never a sub-page",
    (role) => {
      const target = staffPostLoginPath(role);
      expect(target).toBe("/admin");
      // The specific symptom reported. `/admin` renders AdminDashboard via the
      // index route; any deeper path would be a different page.
      expect(target).not.toMatch(/settings/);
    }
  );

  it.each(["admin", "super_admin"])(
    "%s logging in again with no intended path still goes to /admin",
    (role) => {
      // "Subsequent login" differs from the first only in what the caller passes
      // as `from`. Nothing in the app persists a route across logins — no
      // localStorage/sessionStorage of the last path — so a plain re-login is
      // indistinguishable from a first one, and must land in the same place.
      expect(staffPostLoginPath(role, null)).toBe("/admin");
      expect(staffPostLoginPath(role, undefined)).toBe("/admin");
    }
  );

  it("resolves /admin's index to the dashboard, not a settings page", () => {
    const src = readSrc("src/App.tsx");
    expect(src).toMatch(/<Route index element=\{<AdminDashboard \/>\} \/>/);
    // The failure mode being pinned: an index route pointing at settings, or a
    // redirect standing in front of the dashboard.
    expect(src).not.toMatch(/<Route index element=\{<SettingsPage \/>\} \/>/);
    expect(src).not.toMatch(/index element=\{<Navigate to="\/admin\/settings"/);
  });

  it("has no incomplete-PROFILE diversion — the only settings redirect is the 2FA gate", () => {
    // Distinguishes the two. A profile-completeness check would strand an admin
    // whose staff row is already correct, which is what was suspected here; the
    // account's row was fine, and no such check exists.
    for (const file of [
      "src/pages/auth/Login.tsx",
      "src/components/auth/ProtectedRoute.tsx",
    ]) {
      expect(readSrc(file), `${file} must not route anyone to /admin/settings`).not.toMatch(
        /\/admin\/settings/
      );
    }

    // StaffLogin has exactly ONE such redirect, and it is the 2FA enrolment gate.
    const staffLogin = readSrc("src/pages/auth/StaffLogin.tsx");
    const settingsRedirects = staffLogin.match(/\/admin\/settings[^"']*/g) ?? [];
    expect(settingsRedirects).toEqual(["/admin/settings?setup2fa=true"]);
  });

  it("only diverts an admin to settings when 2FA is NOT yet enrolled", () => {
    // The gate's condition, pinned: it is reached only after the verified-factor
    // check has found nothing. An admin WITH 2FA falls through to completeLogin,
    // which is what makes the dashboard reachable at all.
    const src = readSrc("src/pages/auth/StaffLogin.tsx");
    const gateIndex = src.indexOf('"/admin/settings?setup2fa=true"');
    expect(gateIndex).toBeGreaterThan(-1);

    // The verified-factor early return must come BEFORE the enrolment redirect,
    // or an admin who already has 2FA would be sent to enrol again every login.
    const verifiedReturn = src.indexOf("setNeeds2FA(true)");
    expect(verifiedReturn).toBeGreaterThan(-1);
    expect(verifiedReturn).toBeLessThan(gateIndex);

    // And completeLogin must still be reachable after the gate.
    expect(src.indexOf("completeLogin(staffData.role)")).toBeGreaterThan(gateIndex);
  });

  it("gates mandatory 2FA on isAdminRole, not a duplicated role list", () => {
    // A hardcoded ["admin","super_admin"] is the same anti-pattern #102 removed
    // from the redirect (see "no longer hardcodes a call_centre role allowlist").
    // Here it is worse than a redirect bug: a future admin-tier role added to
    // isAdminRole would silently be EXEMPT from mandatory 2FA while still holding
    // admin access.
    const src = readSrc("src/pages/auth/StaffLogin.tsx");
    expect(src).not.toMatch(/\[\s*"admin",\s*"super_admin"\s*\]\s*\.includes/);
    expect(src).toMatch(/isAdminRole\(staffData\.role\)/);
  });

  it("does not send an admin to the call centre — the #102 regression class", () => {
    // isAdminRole covers both admin roles; if it ever stopped, admins would land
    // on /call-centre and be bounced, which is the bug #102 fixed for supervisors.
    expect(staffPostLoginPath("admin")).not.toBe("/call-centre");
    expect(staffPostLoginPath("super_admin")).not.toBe("/call-centre");
  });
});
