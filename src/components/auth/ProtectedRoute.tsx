import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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
    retryRoleLoad,
  } = useAuth();
  const location = useLocation();

  // Check if user is admin or super_admin
  const isAdminRole = isStaff && (staffRole === "admin" || staffRole === "super_admin");

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

  // Require member access
  if (requireMember && !memberId) {
    // User is logged in but not a member - redirect to complete registration
    return <Navigate to="/complete-registration" replace />;
  }

  // Require partner access
  if (requirePartner && !isPartner) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
