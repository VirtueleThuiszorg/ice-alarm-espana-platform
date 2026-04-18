import { ArrowLeft, Edit, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToggleStaffStatus } from "@/hooks/useStaffMembers";
import type { StaffMember, StaffStatus } from "@/types/staff";

interface StaffDetailHeaderProps {
  staff: StaffMember;
  onEdit: () => void;
}

const getRoleBadge = (role: string) => {
  switch (role) {
    case "super_admin":
      return <Badge className="bg-purple-500 text-white">Super Admin</Badge>;
    case "admin":
      return <Badge className="bg-primary text-primary-foreground">Admin</Badge>;
    case "call_centre_supervisor":
      return <Badge className="bg-amber-500 text-white">Supervisor</Badge>;
    case "call_centre":
      return <Badge variant="secondary">Call Centre</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return <Badge className="bg-alert-resolved text-alert-resolved-foreground">Active</Badge>;
    case "on_leave":
      return <Badge className="bg-amber-500 text-white">On Leave</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    case "terminated":
      return <Badge variant="secondary">Terminated</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export function StaffDetailHeader({ staff, onEdit }: StaffDetailHeaderProps) {
  const navigate = useNavigate();
  const toggleStatus = useToggleStaffStatus();

  const handleStatusChange = (newStatus: string) => {
    if (newStatus !== staff.status) {
      toggleStatus.mutate({ id: staff.id, status: newStatus as StaffStatus });
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate("/admin/staff")} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Staff
      </Button>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            {staff.avatar_url ? (
              <img
                src={staff.avatar_url}
                alt={`${staff.first_name} ${staff.last_name}`}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <Shield className="h-8 w-8 text-primary" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {staff.first_name} {staff.last_name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {getRoleBadge(staff.role)}
              {getStatusBadge(staff.status)}
              {staff.department && (
                <Badge variant="outline" className="capitalize">
                  {staff.department.replace("_", " ")}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Select value={staff.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Change status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_leave">On Leave</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
