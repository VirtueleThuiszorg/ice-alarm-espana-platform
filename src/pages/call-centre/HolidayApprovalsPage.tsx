import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AdminHolidaysPage from "@/pages/admin/HolidaysPage";
import { HOLIDAY_APPROVER_ROLES } from "@/lib/staffNotify";

/**
 * Holiday approvals on the CALL-CENTRE surface.
 *
 * The supervisor (call_centre_supervisor) is the PRIMARY owner of holiday
 * approvals (Lee, 2026-07-24), but the only approval screen lived under
 * /admin/* whose route guard is admin/super_admin-only — so supervisors
 * could never reach it even though RLS already allowed them everything.
 *
 * This mounts the SAME shared approvals page (single implementation, no
 * fork) behind a role gate: supervisor + admin + super_admin.
 */
export default function HolidayApprovalsPage() {
  const { staffRole } = useAuth();

  if (!staffRole || !(HOLIDAY_APPROVER_ROLES as readonly string[]).includes(staffRole)) {
    return <Navigate to="/call-centre/holidays" replace />;
  }

  return <AdminHolidaysPage />;
}
