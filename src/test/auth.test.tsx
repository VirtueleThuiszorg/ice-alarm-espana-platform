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
