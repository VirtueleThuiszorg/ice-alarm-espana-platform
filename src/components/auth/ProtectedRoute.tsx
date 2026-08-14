import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminRole as checkAdminRole, ADMIN_2FA_SETUP_PATH, ADMIN_2FA_SETUP_ROUTE } from "@/config/constants";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireStaff?: boolean;
  requireAdmin?: boolean;
  requireMember?: boolean;
  requirePartner?: boolean;
}

export function ProtectedRoute({
  children,
  requireStaff = false,
  requireAdmin = false,
  requireMember = false,
  requirePartner = false,
}: ProtectedRouteProps) {
  const { 
    user, 
    isLoading, 
    isStaff, 
    staffRole, 
    memberId, 
    isPartner,
    roleLoadFailed,
    hasVerifiedFactor,
    retryRoleLoad,
  } = useAuth();
  const location = useLocation();

  // Check if user is admin or super_admin
  const isAdminRole = isStaff && checkAdminRole(staffRole);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    // Redirect to appropriate login page
    if (requireStaff || requireAdmin) {
      return <Navigate to="/staff/login" state={{ from: location }} replace />;
    }
    if (requirePartner) {
      return <Navigate to="/partner/login" state={{ from: location }} replace />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role loading failed - show retry option instead of immediate denial
  if (roleLoadFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Failed to load your account permissions.</p>
          <Button onClick={retryRoleLoad} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // MANDATORY 2FA FOR ADMINS — enforced here, not merely suggested at login.
  //
  // StaffLogin redirects an admin with no verified TOTP factor to the Security
  // tab, but that is only a redirect: an admin who typed a URL, used a bookmark,
  // or clicked a sidebar link kept full access to medical records and emergency
  // contacts with no second factor. The redirect was advice; this is the control.
  //
  // Ordering matters. This sits ABOVE the admin override below, because that
  // override grants admins every route unconditionally — enforcing after it would
  // never run.
  //
  // Two things it must not do:
  //  - lock an admin out of enrolment. ADMIN_2FA_SETUP_PATH stays reachable so
  //    they can always obtain the factor the gate demands. Everything else under
  //    /admin is refused until they do.
  //  - act on an unknown. `hasVerifiedFactor === null` means the lookup has not
  //    resolved or failed, so we hold rather than bounce a properly-enrolled
  //    admin on a slow network.
  //
  // Non-admin staff are untouched: call_centre and call_centre_supervisor keep
  // reaching /call-centre exactly as before.
  if (isAdminRole && hasVerifiedFactor === false) {
    const onSetupPage = location.pathname.startsWith(ADMIN_2FA_SETUP_PATH);
    if (!onSetupPage) {
      return <Navigate to={ADMIN_2FA_SETUP_ROUTE} replace />;
    }
    return <>{children}</>;
  }

  // ADMIN OVERRIDE: Admins have access to ALL pages
  if (isAdminRole) {
    return <>{children}</>;
  }

  // Partner trying to access admin or member routes
  if (isPartner && (requireStaff || requireAdmin || requireMember)) {
    return <Navigate to="/partner-dashboard" replace />;
  }

  // Staff or member trying to access partner routes
  if (requirePartner && !isPartner) {
    if (isStaff) {
      return <Navigate to="/admin" replace />;
    }
    if (memberId) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/unauthorized" replace />;
  }

  // Require staff access
  if (requireStaff && !isStaff) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Require admin access (admin or super_admin)
  if (requireAdmin && (!isStaff || (staffRole !== "admin" && staffRole !== "super_admin"))) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Require member access — staff with an admin role may also view member
  // routes (admin-view mode, e.g. /dashboard?memberId=...)
  if (requireMember && !memberId && !isAdminRole) {
    // User is logged in but not a member - redirect to complete registration
    return <Navigate to="/complete-registration" replace />;
  }

  // Require partner access
  if (requirePartner && !isPartner) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
