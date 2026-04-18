import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StaffMember } from "@/types/staff";

interface StaffOverviewTabProps {
  staff: StaffMember;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">
        {value || <span className="text-muted-foreground italic">Not set</span>}
      </span>
    </div>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

function formatContractType(type: string | null) {
  if (!type) return null;
  return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function StaffOverviewTab({ staff }: StaffOverviewTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Personal Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="Full Name" value={`${staff.first_name} ${staff.last_name}`} />
          <InfoRow label="Date of Birth" value={formatDate(staff.date_of_birth)} />
          <InfoRow label="Nationality" value={staff.nationality} />
          <InfoRow label="NIE Number" value={staff.nie_number} />
          <InfoRow label="Social Security" value={staff.social_security_number} />
          <InfoRow label="Language" value={staff.preferred_language === "es" ? "Español" : "English"} />
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="Email" value={staff.email} />
          <InfoRow label="Phone" value={staff.phone} />
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="Address Line 1" value={staff.address_line1} />
          <InfoRow label="Address Line 2" value={staff.address_line2} />
          <InfoRow label="City" value={staff.city} />
          <InfoRow label="Province" value={staff.province} />
          <InfoRow label="Postal Code" value={staff.postal_code} />
          <InfoRow label="Country" value={staff.country} />
        </CardContent>
      </Card>

      {/* Employment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="Role" value={staff.role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())} />
          <InfoRow label="Department" value={staff.department?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || null} />
          <InfoRow label="Position" value={staff.position} />
          <InfoRow label="Contract Type" value={formatContractType(staff.contract_type)} />
          <InfoRow label="Hire Date" value={formatDate(staff.hire_date)} />
          <InfoRow label="Termination Date" value={formatDate(staff.termination_date)} />
          <InfoRow label="Last Login" value={staff.last_login_at ? format(new Date(staff.last_login_at), "dd MMM yyyy, HH:mm") : null} />
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Emergency Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="Name" value={staff.emergency_contact_name} />
          <InfoRow label="Phone" value={staff.emergency_contact_phone} />
          <InfoRow label="Relationship" value={staff.emergency_contact_relationship} />
        </CardContent>
      </Card>

      {/* Notes */}
      {staff.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{staff.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
