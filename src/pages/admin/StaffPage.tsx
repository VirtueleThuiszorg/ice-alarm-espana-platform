import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Shield,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  Clock,
  UserX,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { useStaffMembers, useStaffStats, useToggleStaffStatus } from "@/hooks/useStaffMembers";
import { StaffFormPanel } from "@/components/admin/staff/StaffFormPanel";
import type { StaffMember, StaffFilters, StaffStatus } from "@/types/staff";

const ITEMS_PER_PAGE = 20;

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
    case "pending":
      return <Badge className="bg-blue-500 text-white">Pending</Badge>;
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

export default function StaffPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<StaffFilters>({
    search: "",
    status: "all",
    role: "all",
    department: "all",
  });
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  const { data, isLoading } = useStaffMembers(filters, page, ITEMS_PER_PAGE);
  const { data: stats } = useStaffStats();
  const toggleStatus = useToggleStaffStatus();

  const totalPages = Math.ceil((data?.count || 0) / ITEMS_PER_PAGE);

  const handleStatusChange = (id: string, status: StaffStatus) => {
    toggleStatus.mutate({ id, status });
  };

  const handleEdit = (staff: StaffMember) => {
    setEditingStaff(staff);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingStaff(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("adminStaff.title", "Staff Management")}
          </h1>
          <p className="text-muted-foreground">
            {t("adminStaff.subtitle", "Manage staff accounts and permissions.")}
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("adminStaff.addStaff", "Add Staff Member")}
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("adminStaff.totalStaff", "Total Staff")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              {t("common.active", "Active")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-alert-resolved">
              {stats?.active || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              On Leave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {stats?.on_leave || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Send className="h-4 w-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {stats?.pending || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserX className="h-4 w-4" />
              Suspended
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats?.suspended || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("adminStaff.searchPlaceholder", "Search by name, email, phone...")}
                value={filters.search}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, search: e.target.value }));
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={filters.status}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, status: v }));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("common.status", "Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.role}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, role: v }));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="call_centre_supervisor">Supervisor</SelectItem>
                <SelectItem value="call_centre">Call Centre</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.department}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, department: v }));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="operations">Operations</SelectItem>
                <SelectItem value="call_centre">Call Centre</SelectItem>
                <SelectItem value="administration">Administration</SelectItem>
                <SelectItem value="management">Management</SelectItem>
                <SelectItem value="it">IT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Staff Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name", "Name")}</TableHead>
                <TableHead>{t("common.email", "Email")}</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>{t("adminStaff.role", "Role")}</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>{t("common.status", "Status")}</TableHead>
                <TableHead>{t("holidays.days", "Holiday Days")}</TableHead>
                <TableHead>Hire Date</TableHead>
                <TableHead className="w-[70px]">{t("common.actions", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    {t("adminStaff.loading", "Loading staff...")}
                  </TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((member) => (
                  <TableRow
                    key={member.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/staff/${member.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {member.avatar_url ? (
                            <img
                              src={member.avatar_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <Shield className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        {member.first_name} {member.last_name}
                      </div>
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.phone || "—"}</TableCell>
                    <TableCell>{getRoleBadge(member.role)}</TableCell>
                    <TableCell>
                      {member.department ? (
                        <span className="capitalize text-sm">
                          {member.department.replace("_", " ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(member.status)}</TableCell>
                    <TableCell>
                      {(member as any).annual_holiday_days ?? 22}
                    </TableCell>
                    <TableCell>
                      {member.hire_date
                        ? format(new Date(member.hire_date), "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/staff/${member.id}`);
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(member);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            {t("common.edit", "Edit")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {member.status === "active" ? (
                            <>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(member.id, "on_leave");
                                }}
                              >
                                <Clock className="mr-2 h-4 w-4" />
                                Set On Leave
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(member.id, "suspended");
                                }}
                              >
                                <UserX className="mr-2 h-4 w-4" />
                                Suspend
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(member.id, "active");
                              }}
                            >
                              <UserCheck className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {t("adminStaff.noStaff", "No staff members found")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1} to{" "}
            {Math.min(page * ITEMS_PER_PAGE, data?.count || 0)} of {data?.count || 0}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Form Panel */}
      <StaffFormPanel
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={editingStaff ? "edit" : "create"}
        staffMember={editingStaff}
      />
    </div>
  );
}
