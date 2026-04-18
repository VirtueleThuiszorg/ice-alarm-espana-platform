import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { 
  Search, 
  Plus, 
  Download, 
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Upload,
  Contact
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";

const ITEMS_PER_PAGE = 20;

export default function MembersPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { staffRole } = useAuth();
  const isSuperAdmin = staffRole === "super_admin";

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("members")
        .delete()
        .eq("id", memberToDelete.id);

      if (error) throw error;

      toast.success(t("admin.members.deleteSuccess", { name: memberToDelete.name }));
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    } catch (error: any) {
      console.error("Error deleting member:", error);
      toast.error(t("admin.members.deleteError"));
    } finally {
      setIsDeleting(false);
      setMemberToDelete(null);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-members", searchQuery, statusFilter, planFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("members")
        .select(`
          *,
          subscriptions (plan_type, status),
          devices (id, status)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (searchQuery) {
        query = query.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "active" | "inactive" | "suspended");
      }

      const { data: members, count, error } = await query;

      if (error) throw error;

      // Filter by plan type client-side since it's in a related table
      let filteredMembers = members || [];
      if (planFilter !== "all") {
        filteredMembers = filteredMembers.filter((m: any) => 
          m.subscriptions?.some((s: any) => s.plan_type === planFilter && s.status === "active")
        );
      }

      return { members: filteredMembers, totalCount: count || 0 };
    },
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">{t("common.active")}</Badge>;
      case "inactive":
        return <Badge variant="secondary">{t("common.inactive")}</Badge>;
      case "suspended":
        return <Badge variant="destructive">{t("membership.suspended")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanBadge = (subscriptions: any[]) => {
    const activeSub = subscriptions?.find((s: any) => s.status === "active");
    if (!activeSub) return <Badge variant="outline">{t("admin.members.noPlan")}</Badge>;
    return (
      <Badge variant="secondary" className="capitalize">
        {activeSub.plan_type === "single" ? t("membership.single") : t("membership.couple")}
      </Badge>
    );
  };

  const handleExportCSV = () => {
    const members = data?.members;
    if (!members || members.length === 0) {
      toast.error(t("admin.members.noResults"));
      return;
    }

    const headers = ["ID", "First Name", "Last Name", "Email", "Phone", "City", "Status", "Created At"];
    const rows = members.map((m: any) => [
      m.id,
      m.first_name,
      m.last_name,
      m.email,
      m.phone,
      m.city,
      m.status,
      m.created_at,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `members-export-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("admin.members.title")}</h1>
          <p className="text-muted-foreground">
            {t("admin.members.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <>
              <Button variant="outline" asChild>
                <Link to="/admin/crm-import">
                  <Upload className="mr-2 h-4 w-4" />
                  {t("admin.members.crmImport")}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/crm-contacts">
                  <Contact className="mr-2 h-4 w-4" />
                  {t("admin.members.crmContacts")}
                </Link>
              </Button>
            </>
          )}
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            {t("admin.members.exportCsv")}
          </Button>
          <Button asChild>
            <Link to="/admin/members/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("admin.members.addMember")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.members.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("common.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")} {t("common.status")}</SelectItem>
                <SelectItem value="active">{t("common.active")}</SelectItem>
                <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
                <SelectItem value="suspended">{t("membership.suspended")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t("common.plan")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")} {t("common.plan")}s</SelectItem>
                <SelectItem value="single">{t("membership.single")}</SelectItem>
                <SelectItem value="couple">{t("membership.couple")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Members Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.table.name")}</TableHead>
                <TableHead>{t("admin.table.email")}</TableHead>
                <TableHead>{t("admin.table.phone")}</TableHead>
                <TableHead>{t("admin.table.plan")}</TableHead>
                <TableHead>{t("admin.table.status")}</TableHead>
                <TableHead>{t("admin.table.device")}</TableHead>
                <TableHead className="w-[70px]">{t("admin.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t("admin.members.loading")}
                  </TableCell>
                </TableRow>
              ) : data?.members && data.members.length > 0 ? (
                data.members.map((member: any) => (
                  <TableRow 
                    key={member.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/members/${member.id}`)}
                  >
                    <TableCell className="font-medium">
                      {member.first_name} {member.last_name}
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.phone}</TableCell>
                    <TableCell>{getPlanBadge(member.subscriptions)}</TableCell>
                    <TableCell>{getStatusBadge(member.status)}</TableCell>
                    <TableCell>
                      {member.devices?.some((d: any) => d.status === "active") ? (
                        <Badge variant="outline" className="bg-alert-resolved/10 text-alert-resolved border-alert-resolved/20">
                          {t("admin.members.assigned")}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t("admin.members.none")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/dashboard?memberId=${member.id}`);
                          }}
                          title={t("admin.members.viewMemberDashboard")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/members/${member.id}`);
                            }}>
                              <Eye className="mr-2 h-4 w-4" />
                              {t("admin.members.viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/members/${member.id}`);
                            }}>
                              <Edit className="mr-2 h-4 w-4" />
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMemberToDelete({
                                  id: member.id,
                                  name: `${member.first_name} ${member.last_name}`
                                });
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t("admin.members.noResults")}
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
            {t("admin.members.showing", { from: ((page - 1) * ITEMS_PER_PAGE) + 1, to: Math.min(page * ITEMS_PER_PAGE, data?.totalCount || 0), total: data?.totalCount || 0 })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("admin.members.previous")}
            </Button>
            <span className="text-sm">
              {t("admin.members.pageOf", { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              {t("admin.members.next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.members.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.members.confirmDeleteDescription", { name: memberToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}