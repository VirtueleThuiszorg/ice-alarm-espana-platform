import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AdminRotaPage from "@/pages/admin/RotaPage";
import { ROTA_MANAGER_ROLES } from "@/lib/staffNotify";

/**
 * The rota on the CALL-CENTRE surface.
 *
 * THE GAP THIS CLOSES. The database has said for some time that a supervisor runs the rota: the
 * RLS policies on `staff_shifts`, `staff_holidays` and `staff_shift_swaps` grant
 * `call_centre_supervisor` manage-all, and `generate_rota()` refuses anyone who is not an admin
 * or a supervisor. The only rota screen lived under `/admin/*`, whose route guard is
 * admin/super_admin — so Mary could not reach the thing she is responsible for, while the
 * permission to use it was already hers. Exactly the shape of the holiday-approvals gap
 * (`HolidayApprovalsPage`), and fixed the same way.
 *
 * MOUNTS THE SAME COMPONENT, not a copy. A second rota grid would be two implementations of the
 * week view, the copy-week logic and the generator — and the one nobody was looking at would be
 * the one that drifted. Everything a supervisor can do here is what an admin can do on
 * `/admin/rota`, because it IS that page.
 *
 * WITH ONE EXCEPTION, and it is not cosmetic: the SOS escalation chain. `shift_escalation_chain`
 * is the ladder `sos-escalation-runner` reads to decide who gets called when an alert goes
 * unanswered, and it is a separate hand-populated table from the rota. Editing it is
 * admin-only — see the guard inside `admin/RotaPage`. A supervisor gains the rota, not the
 * SOS path.
 */
export default function CallCentreRotaPage() {
  const { staffRole } = useAuth();

  if (!staffRole || !(ROTA_MANAGER_ROLES as readonly string[]).includes(staffRole)) {
    // An operator who lands here by typing the URL goes to their OWN shifts rather than to an
    // error: the rota is not theirs to manage, but the part of it that is theirs is one page over.
    return <Navigate to="/call-centre/my-shifts" replace />;
  }

  return <AdminRotaPage />;
}
