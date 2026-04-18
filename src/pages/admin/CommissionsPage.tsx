import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DollarSign, Filter, Search, CheckCircle, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { logCommissionActivity } from "@/lib/auditLog";
import { useTranslation } from "react-i18next";
import { logCrmEvent } from "@/lib/crmEvents";
import { Database } from "@/integrations/supabase/types";

type CommissionStatus = Database["public"]["Enums"]["commission_status"];

const ITEMS_PER_PAGE = 20;

const statusColors: Record<CommissionStatus, string> = {
  pending_release: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

interface Commission {
  id: string;
  partner_id: string;
  member_id: string;
  order_id: string | null;
  amount_eur: number;
  status: CommissionStatus;
  trigger_event: string;
  trigger_at: string | null;
  release_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  partner?: {
    contact_name: string;
    company_name: string | null;
    referral_code: string;
  };
  member?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function CommissionsPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-commissions", statusFilter, searchQuery, page],
    queryFn: async () => {
      let query = supabase
        .from("partner_commissions")
        .select(`
          *,
          partner:partner_id (contact_name, company_name, referral_code),
          member:member_id (first_name, last_name, email)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: commissions, count, error } = await query;
      if (error) throw error;

      // Filter by search if provided
      let filtered = commissions || [];
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((c: Commission) => 
          c.partner?.contact_name?.toLowerCase().includes(q) ||
          c.partner?.company_name?.toLowerCase().includes(q) ||
          c.member?.first_name?.toLowerCase().includes(q) ||
          c.member?.last_name?.toLowerCase().includes(q) ||
          c.member?.email?.toLowerCase().includes(q)
        );
      }

      return { commissions: filtered as Commission[], totalCount: count || 0 };
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-commission-stats"],
    queryFn: async () => {
      const { data: commissions, error } = await supabase
        .from("partner_commissions")
        .select("status, amount_eur");
      
      if (error) throw error;

      const totals = {
        pending: 0,
        approved: 0,
        paid: 0,
        cancelled: 0,
      };

      commissions?.forEach((c) => {
        const amount = Number(c.amount_eur);
        switch (c.status) {
          case "pending_release":
            totals.pending += amount;
            break;
          case "approved":
            totals.approved += amount;
            break;
          case "paid":
            totals.paid += amount;
            break;
          case "cancelled":
            totals.cancelled += amount;
            break;
        }
      });

      return totals;
    },
  });

  const markAsPaid = useMutation({
    mutationFn: async (commissionId: string) => {
      const now = new Date().toISOString();
      
      // Get commission details first for CRM event
      const { data: commission, error: fetchError } = await supabase
        .from("partner_commissions")
        .select("partner_id, member_id, amount_eur")
        .eq("id", commissionId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const { error } = await supabase
        .from("partner_commissions")
        .update({ status: "paid", paid_at: now })
        .eq("id", commissionId);

      if (error) throw error;

      await logCommissionActivity("commission_paid", commissionId, undefined, { paid_at: now });
      
      // Log CRM event
      await logCrmEvent("commission_paid", {
        commission_id: commissionId,
        partner_id: commission.partner_id,
        member_id: commission.member_id,
        amount_eur: commission.amount_eur,
        paid_at: now,
      });
      
      return commissionId;
    },
    onSuccess: () => {
      toast.success("Commission marked as paid");
      queryClient.invalidateQueries({ queryKey: ["admin-commissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-commission-stats"] });
      queryClient.invalidateQueries({ queryKey: ["partner-commissions"] });
    },
    onError: (error) => {
      console.error("Failed to mark as paid:", error);
      toast.error("Failed to mark commission as paid");
    },
  });

  const triggerProcessing = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("process-commissions");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Processed ${data.processed} commissions (${data.approved} approved, ${data.cancelled} cancelled)`);
      queryClient.invalidateQueries({ queryKey: ["admin-commissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-commission-stats"] });
    },
    onError: (error) => {
      console.error("Failed to process commissions:", error);
      toast.error("Failed to process commissions");
    },
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold tracking-tight">{t("adminCommissions.title", "Partner Commissions")}</h1>
           <p className="text-muted-foreground">
             {t("adminCommissions.subtitle", "Manage and track partner referral commissions")}
           </p>
         </div>
        <Button 
          onClick={() => triggerProcessing.mutate()}
          disabled={triggerProcessing.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${triggerProcessing.isPending ? "animate-spin" : ""}`} />
          Process Pending
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Release</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              €{stats?.pending.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">7-day hold period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved (Due)</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              €{stats?.approved.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">Ready for payout</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              €{stats?.paid.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
            <DollarSign className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              €{stats?.cancelled.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">Refunds/cancellations</p>
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
                placeholder="Search by partner or member..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as CommissionStatus | "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending_release">Pending Release</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Commission Records</CardTitle>
          <CardDescription>All partner commissions with actions</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Triggered</TableHead>
                <TableHead>Release Date</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    Loading commissions...
                  </TableCell>
                </TableRow>
              ) : data?.commissions && data.commissions.length > 0 ? (
                data.commissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{commission.partner?.contact_name || "Unknown"}</p>
                        <p className="text-sm text-muted-foreground">
                          {commission.partner?.company_name || commission.partner?.referral_code}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {commission.member?.first_name} {commission.member?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">{commission.member?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-bold">
                      €{Number(commission.amount_eur).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[commission.status]}>
                        {commission.status.replace("_", " ")}
                      </Badge>
                      {commission.cancel_reason && (
                        <p className="text-xs text-muted-foreground mt-1">{commission.cancel_reason}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {commission.trigger_at
                        ? format(new Date(commission.trigger_at), "dd MMM yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {commission.release_at
                        ? format(new Date(commission.release_at), "dd MMM yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {commission.approved_at
                        ? format(new Date(commission.approved_at), "dd MMM yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {commission.paid_at
                        ? format(new Date(commission.paid_at), "dd MMM yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {commission.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => markAsPaid.mutate(commission.id)}
                          disabled={markAsPaid.isPending}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No commissions found
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
    </div>
  );
}
