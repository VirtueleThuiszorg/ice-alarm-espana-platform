import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Users, DollarSign, Send, TrendingUp, ChevronLeft, ChevronRight, Eye, MoreHorizontal, Pencil, Ban, Trash2, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, subDays, isAfter } from "date-fns";
import { Database } from "@/integrations/supabase/types";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/use-toast";
import { PARTNER_TYPES, getPartnerTypeLabel } from "@/config/partnerTypes";
import { InvitePartnerDialog } from "@/components/admin/InvitePartnerDialog";

type PartnerStatus = Database["public"]["Enums"]["partner_status"];

interface Partner {
  id: string;
  created_at: string;
  status: PartnerStatus;
  referral_code: string;
  company_name: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  preferred_language: string;
  partner_type: string;
  organization_type: string | null;
  facility_resident_count: number | null;
}

interface PartnerStats {
  partnerId: string;
  invitesSent: number;
  registrations: number;
  delivered: number;
  pendingCommission: number;
  approvedCommission: number;
  paidCommission: number;
}

const ITEMS_PER_PAGE = 20;

const statusColors: Record<PartnerStatus, string> = {
  invited: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  suspended: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

export default function PartnersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PartnerStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [partnerToDelete, setPartnerToDelete] = useState<Partner | null>(null);
  const [partnerToSuspend, setPartnerToSuspend] = useState<Partner | null>(null);
  const [partnerToActivate, setPartnerToActivate] = useState<Partner | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // Mutation to update partner status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ partnerId, status }: { partnerId: string; status: PartnerStatus }) => {
      const { error } = await supabase
        .from("partners")
        .update({ status })
        .eq("id", partnerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["partner-global-stats"] });
      toast({ title: "Partner status updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating partner", description: error.message, variant: "destructive" });
    },
  });

  // Mutation to delete partner (uses edge function to also delete auth user)
  const deletePartnerMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      const response = await supabase.functions.invoke("partner-admin-delete", {
        body: { partner_id: partnerId },
      });

      if (response.error) {
        const errorData = response.data;
        const errorMessage = errorData?.error || response.error.message || "Failed to delete partner";
        throw new Error(errorMessage);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Failed to delete partner");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["partner-global-stats"] });
      toast({ title: "Partner deleted successfully" });
      setPartnerToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting partner", description: error.message, variant: "destructive" });
    },
  });

  // Fetch partners with pagination
  const { data, isLoading } = useQuery({
    queryKey: ["admin-partners", statusFilter, typeFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("partners")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      
      if (typeFilter !== "all") {
        query = query.eq("partner_type", typeFilter);
      }

      const { data: partners, count, error } = await query;
      if (error) throw error;

      return { partners: partners as Partner[], totalCount: count || 0 };
    },
  });

  // Fetch per-partner stats
  const { data: partnerStatsMap } = useQuery({
    queryKey: ["partner-individual-stats", data?.partners?.map(p => p.id)],
    queryFn: async () => {
      if (!data?.partners?.length) return {};

      const partnerIds = data.partners.map(p => p.id);
      
      // Fetch all invites for these partners
      const { data: invites } = await supabase
        .from("partner_invites")
        .select("partner_id, status")
        .in("partner_id", partnerIds)
        .neq("status", "draft");

      // Fetch all commissions for these partners
      const { data: commissions } = await supabase
        .from("partner_commissions")
        .select("partner_id, status, amount_eur, trigger_event");

      // Build stats map
      const statsMap: Record<string, PartnerStats> = {};
      
      partnerIds.forEach(partnerId => {
        const partnerInvites = invites?.filter(i => i.partner_id === partnerId) || [];
        const partnerCommissions = commissions?.filter(c => c.partner_id === partnerId) || [];
        
        statsMap[partnerId] = {
          partnerId,
          invitesSent: partnerInvites.length,
          registrations: partnerInvites.filter(i => i.status === "registered" || i.status === "converted").length,
          delivered: partnerCommissions.filter(c => c.trigger_event === "device_delivered").length,
          pendingCommission: partnerCommissions
            .filter(c => c.status === "pending_release")
            .reduce((sum, c) => sum + Number(c.amount_eur), 0),
          approvedCommission: partnerCommissions
            .filter(c => c.status === "approved")
            .reduce((sum, c) => sum + Number(c.amount_eur), 0),
          paidCommission: partnerCommissions
            .filter(c => c.status === "paid")
            .reduce((sum, c) => sum + Number(c.amount_eur), 0),
        };
      });
      
      return statsMap;
    },
    enabled: !!data?.partners?.length,
  });

  // Global stats
  const { data: globalStats } = useQuery({
    queryKey: ["partner-global-stats"],
    queryFn: async () => {
      const [partnersResult, activeResult, invitesResult, commissionsResult] = await Promise.all([
        supabase.from("partners").select("id", { count: "exact", head: true }),
        supabase.from("partners").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("partner_invites").select("id", { count: "exact", head: true }).neq("status", "draft"),
        supabase.from("partner_commissions").select("status, amount_eur"),
      ]);

      const paidTotal = commissionsResult.data
        ?.filter(c => c.status === "paid")
        .reduce((sum, c) => sum + Number(c.amount_eur), 0) || 0;

      return {
        totalPartners: partnersResult.count || 0,
        activePartners: activeResult.count || 0,
        totalInvites: invitesResult.count || 0,
        totalPaid: paidTotal,
      };
    },
  });

  // Filter by search and date
  const filteredPartners = data?.partners?.filter((partner) => {
    // Search filter
    const matchesSearch =
      partner.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      partner.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      partner.referral_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      partner.company_name?.toLowerCase().includes(searchQuery.toLowerCase());

    // Date filter
    let matchesDate = true;
    if (dateFilter !== "all") {
      const createdDate = new Date(partner.created_at);
      const daysAgo = parseInt(dateFilter);
      matchesDate = isAfter(createdDate, subDays(new Date(), daysAgo));
    }

    return matchesSearch && matchesDate;
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold tracking-tight">{t("adminPartners.title", "Partners / Affiliates")}</h1>
           <p className="text-muted-foreground">
             {t("adminPartners.subtitle", "Manage your partner network and track referral commissions")}
           </p>
         </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowInviteDialog(true)}>
            <Send className="mr-2 h-4 w-4" />
            {t("adminPartners.invitePartner", "Invite Partner")}
          </Button>
          <Button onClick={() => navigate("/admin/partners/new")}>
            <Plus className="mr-2 h-4 w-4" />
            {t("common.add", "Add")} {t("adminPartners.partner", "Partner")}
          </Button>
        </div>
      </div>

       {/* Stats Cards */}
       <div className="grid gap-4 md:grid-cols-4">
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">{t("adminPartners.totalPartners", "Total Partners")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalStats?.totalPartners || 0}</div>
          </CardContent>
        </Card>
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">{t("adminPartners.activePartners", "Active Partners")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalStats?.activePartners || 0}</div>
          </CardContent>
        </Card>
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">{t("adminPartners.totalInvites", "Total Invites Sent")}</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalStats?.totalInvites || 0}</div>
          </CardContent>
        </Card>
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">{t("adminPartners.totalPaid", "Total Paid (EUR)")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{globalStats?.totalPaid?.toFixed(2) || "0.00"}</div>
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
                 placeholder={t("adminPartners.searchPlaceholder", "Search by name, email, or referral code...")}
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="pl-10"
               />
            </div>
             <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as PartnerStatus | "all"); setPage(1); }}>
               <SelectTrigger className="w-[150px]">
                 <SelectValue placeholder={t("common.status", "Status")} />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">{t("adminPartners.allStatus", "All Status")}</SelectItem>
                 <SelectItem value="invited">{t("adminPartners.invited", "Invited")}</SelectItem>
                 <SelectItem value="pending">{t("common.pending", "Pending")}</SelectItem>
                 <SelectItem value="active">{t("common.active", "Active")}</SelectItem>
                 <SelectItem value="suspended">{t("adminPartners.suspended", "Suspended")}</SelectItem>
               </SelectContent>
             </Select>
             <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
               <SelectTrigger className="w-[180px]">
                 <SelectValue placeholder={t("common.type", "Type")} />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">{t("adminPartners.allTypes", "All Types")}</SelectItem>
                 {PARTNER_TYPES.map((pt) => (
                   <SelectItem key={pt.value} value={pt.value}>
                     {getPartnerTypeLabel(pt.value)}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
             <Select value={dateFilter} onValueChange={setDateFilter}>
               <SelectTrigger className="w-[150px]">
                 <SelectValue placeholder={t("common.dateRange", "Date Range")} />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">{t("common.allTime", "All Time")}</SelectItem>
                 <SelectItem value="7">{t("adminPartners.last7Days", "Last 7 Days")}</SelectItem>
                 <SelectItem value="30">{t("adminPartners.last30Days", "Last 30 Days")}</SelectItem>
                 <SelectItem value="90">{t("adminPartners.last90Days", "Last 90 Days")}</SelectItem>
               </SelectContent>
             </Select>
          </div>
        </CardContent>
      </Card>

       {/* Partners Table */}
       <Card>
         <CardHeader>
           <CardTitle>{t("adminPartners.allPartners", "All Partners")}</CardTitle>
           <CardDescription>
             {t("adminPartners.viewAndManage", "View and manage all partner accounts")}
           </CardDescription>
         </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
           ) : filteredPartners?.length === 0 ? (
             <div className="text-center py-8 text-muted-foreground">
               {t("adminPartners.noPartnersFound", "No partners found")}
             </div>
           ) : (
            <Table>
               <TableHeader>
                 <TableRow>
                    <TableHead>{t("common.partner", "Partner")}</TableHead>
                    <TableHead>{t("common.type", "Type")}</TableHead>
                    <TableHead>{t("adminPartners.organization", "Organization")}</TableHead>
                    <TableHead>{t("adminPartners.code", "Code")}</TableHead>
                    <TableHead>{t("common.status", "Status")}</TableHead>
                    <TableHead className="text-center">{t("adminPartners.invites", "Invites")}</TableHead>
                    <TableHead className="text-center">{t("adminPartners.registered", "Registered")}</TableHead>
                    <TableHead className="text-center">{t("adminPartners.delivered", "Delivered")}</TableHead>
                    <TableHead className="text-right">{t("adminPartners.pending", "Pending")}</TableHead>
                    <TableHead className="text-right">{t("adminPartners.approved", "Approved")}</TableHead>
                    <TableHead className="text-right">{t("adminPartners.paid", "Paid")}</TableHead>
                    <TableHead>{t("common.joined", "Joined")}</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
               </TableHeader>
              <TableBody>
                {filteredPartners?.map((partner) => {
                  const stats = partnerStatsMap?.[partner.id];
                  return (
                    <TableRow
                      key={partner.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/partners/${partner.id}`)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{partner.contact_name}</div>
                          <div className="text-sm text-muted-foreground">{partner.email}</div>
                          {partner.company_name && (
                            <div className="text-xs text-muted-foreground">{partner.company_name}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            partner.partner_type === "care" ? "border-blue-500 text-blue-600" :
                            partner.partner_type === "residential" ? "border-purple-500 text-purple-600" :
                            partner.partner_type === "pharmacy" ? "border-green-500 text-green-600" :
                            partner.partner_type === "insurance" ? "border-amber-500 text-amber-600" :
                            partner.partner_type === "healthcare_provider" ? "border-teal-500 text-teal-600" :
                            partner.partner_type === "real_estate" ? "border-orange-500 text-orange-600" :
                            partner.partner_type === "expat_community" ? "border-cyan-500 text-cyan-600" :
                            partner.partner_type === "corporate_other" ? "border-slate-500 text-slate-600" :
                            "border-muted-foreground"
                          }
                        >
                          {getPartnerTypeLabel(partner.partner_type || "referral")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(partner.partner_type === "care" || partner.partner_type === "residential") ? (
                          <div>
                            <div className="text-sm">
                              {partner.organization_type?.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "—"}
                            </div>
                            {partner.partner_type === "residential" && partner.facility_resident_count !== null && (
                              <div className="text-xs text-muted-foreground">
                                {partner.facility_resident_count} residents
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-1 text-xs">
                          {partner.referral_code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[partner.status]}>
                          {partner.status.charAt(0).toUpperCase() + partner.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{stats?.invitesSent || 0}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{stats?.registrations || 0}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{stats?.delivered || 0}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-yellow-600 font-medium">
                          €{stats?.pendingCommission?.toFixed(0) || 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-blue-600 font-medium">
                          €{stats?.approvedCommission?.toFixed(0) || 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-green-600 font-medium">
                          €{stats?.paidCommission?.toFixed(0) || 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(partner.created_at), "dd MMM yy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover z-50">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/partners/${partner.id}`);
                            }}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/partners/${partner.id}?edit=true`);
                            }}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit Partner
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/partner-dashboard?partnerId=${partner.id}`);
                            }}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Dashboard
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {partner.status === "active" ? (
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPartnerToSuspend(partner);
                                }}
                                className="text-yellow-600"
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Suspend Partner
                              </DropdownMenuItem>
                            ) : partner.status === "suspended" ? (
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPartnerToActivate(partner);
                                }}
                                className="text-green-600"
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Reactivate Partner
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPartnerToDelete(partner);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Partner
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(page * ITEMS_PER_PAGE, data?.totalCount || 0)} of {data?.totalCount || 0}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={!!partnerToSuspend} onOpenChange={() => setPartnerToSuspend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend Partner</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to suspend <strong>{partnerToSuspend?.contact_name}</strong>? 
              They will no longer be able to access their partner dashboard or earn commissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (partnerToSuspend) {
                  updateStatusMutation.mutate({ partnerId: partnerToSuspend.id, status: "suspended" });
                  setPartnerToSuspend(null);
                }
              }}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              Suspend Partner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate Confirmation Dialog */}
      <AlertDialog open={!!partnerToActivate} onOpenChange={() => setPartnerToActivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate Partner</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reactivate <strong>{partnerToActivate?.contact_name}</strong>? 
              They will regain access to their partner dashboard and can earn commissions again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (partnerToActivate) {
                  updateStatusMutation.mutate({ partnerId: partnerToActivate.id, status: "active" });
                  setPartnerToActivate(null);
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Reactivate Partner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!partnerToDelete} onOpenChange={() => setPartnerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Partner</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{partnerToDelete?.contact_name}</strong>? 
              This will also delete all their invites, commissions, and attribution data. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (partnerToDelete) {
                  deletePartnerMutation.mutate(partnerToDelete.id);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Partner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Partner Dialog */}
      <InvitePartnerDialog open={showInviteDialog} onOpenChange={setShowInviteDialog} />
    </div>
  );
}
