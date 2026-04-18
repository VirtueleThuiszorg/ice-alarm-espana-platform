import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerData } from "@/hooks/usePartnerData";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminRole as checkAdminRole } from "@/config/constants";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Filter, Info } from "lucide-react";
import { format } from "date-fns";
import { Database } from "@/integrations/supabase/types";

type CommissionStatus = Database["public"]["Enums"]["commission_status"];

const statusColors: Record<CommissionStatus, string> = {
  pending_release: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

export default function PartnerCommissionsPage() {
  const { t } = useTranslation();
  const { isStaff, staffRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | "all">("all");

  // Admin view mode detection
  const isAdminRole = isStaff && checkAdminRole(staffRole);
  const partnerIdParam = searchParams.get("partnerId");
  const isAdminViewMode = isAdminRole && !!partnerIdParam;

  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminViewMode ? partnerIdParam : undefined
  );

  const { data: commissions, isLoading: commissionsLoading } = useQuery({
    queryKey: ["partner-commissions", partner?.id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("partner_commissions")
        .select("*")
        .eq("partner_id", partner!.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!partner?.id,
  });

  const totals = {
    pending: commissions
      ?.filter((c) => c.status === "pending_release")
      .reduce((sum, c) => sum + Number(c.amount_eur), 0) || 0,
    approved: commissions
      ?.filter((c) => c.status === "approved")
      .reduce((sum, c) => sum + Number(c.amount_eur), 0) || 0,
    paid: commissions
      ?.filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + Number(c.amount_eur), 0) || 0,
  };

  if (partnerLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-56" />
        </div>
        
        {/* Summary cards skeleton */}
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        
        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("partner.commissions")}</h1>
        <p className="text-muted-foreground">
          {isAdminViewMode 
            ? t("partner.viewingCommissions", { name: partner?.contact_name })
            : t("partner.commissionsDesc")
          }
        </p>
      </div>

      {/* Commission Structure Banner */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-200 mb-2">
                {t("partner.commissionStructure", "Commission Structure")}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-blue-800 dark:text-blue-300">
                <span>{t("partner.commissionBase", "Base: €50/device")}</span>
                <span className="text-blue-400">|</span>
                <span>{t("partner.commissionTier10", "10+ /month: €55/device")}</span>
                <span className="text-blue-400">|</span>
                <span>{t("partner.commissionTier20", "20+ /month: €60/device")}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("partner.pendingRelease")}</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              €{totals.pending.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("partner.pendingReleaseDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("partner.approved")}</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              €{totals.approved.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("partner.approvedDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("partner.totalPaid")}</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              €{totals.paid.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("partner.lifetimeEarnings")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Commissions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("partner.commissionHistory")}</CardTitle>
              <CardDescription>{t("partner.allCommissions")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as CommissionStatus | "all")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("partner.filterByStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("partner.allStatus")}</SelectItem>
                  <SelectItem value="pending_release">{t("partner.pendingRelease")}</SelectItem>
                  <SelectItem value="approved">{t("partner.approved")}</SelectItem>
                  <SelectItem value="paid">{t("partner.paid")}</SelectItem>
                  <SelectItem value="cancelled">{t("common.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {commissionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : commissions?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("partner.noCommissions")}</p>
              <p className="text-sm">
                {t("partner.noCommissionsDesc")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.amount")}</TableHead>
                  <TableHead>{t("partner.triggerEvent")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("partner.triggered")}</TableHead>
                  <TableHead>{t("partner.releaseDate")}</TableHead>
                  <TableHead>{t("partner.paid")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions?.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell className="font-bold">
                      €{Number(commission.amount_eur).toFixed(2)}
                    </TableCell>
                    <TableCell className="capitalize">
                      {commission.trigger_event.replace("_", " ")}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[commission.status]}>
                        {commission.status.replace("_", " ")}
                      </Badge>
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
                      {commission.paid_at
                        ? format(new Date(commission.paid_at), "dd MMM yyyy")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
