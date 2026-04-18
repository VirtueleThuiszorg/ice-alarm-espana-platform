import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

const ITEMS_PER_PAGE = 20;

export default function PaymentsPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments", searchQuery, statusFilter, typeFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("payments")
        .select(`
          *,
          member:member_id (id, first_name, last_name, email)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "completed" | "failed" | "refunded");
      }

      if (typeFilter !== "all") {
        query = query.eq("payment_type", typeFilter as "registration" | "subscription" | "device" | "shipping" | "order");
      }

      const { data: payments, count, error } = await query;
      if (error) throw error;

      return { payments: payments || [], totalCount: count || 0 };
    },
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">{t("adminPayments.completed", "Completed")}</Badge>;
      case "pending":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">{t("adminPayments.pending", "Pending")}</Badge>;
      case "failed":
        return <Badge variant="destructive">{t("adminPayments.failed", "Failed")}</Badge>;
      case "refunded":
        return <Badge variant="secondary">{t("adminPayments.refunded", "Refunded")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      registration: t("adminPayments.types.registration", "Registration"),
      subscription: t("adminPayments.types.subscription", "Subscription"),
      device: t("adminPayments.types.device", "Device"),
      shipping: t("adminPayments.types.shipping", "Shipping"),
      order: t("adminPayments.types.order", "Order"),
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("adminPayments.title", "Payments")}</h1>
          <p className="text-muted-foreground">
            {t("adminPayments.subtitle", "View and manage all payment transactions.")}
          </p>
        </div>
        <Button variant="outline" onClick={() => {
          if (!data?.payments?.length) {
            toast.info("No payments to export");
            return;
          }
          const headers = ["Member", "Email", "Amount", "Type", "Method", "Status", "Date", "Invoice"];
          const rows = data.payments.map((p: any) => [
            p.member ? `${p.member.first_name} ${p.member.last_name}` : "Unknown",
            p.member?.email || "",
            `€${Number(p.amount).toFixed(2)}`,
            p.payment_type,
            p.payment_method,
            p.status,
            p.paid_at ? format(new Date(p.paid_at), "yyyy-MM-dd") : format(new Date(p.created_at), "yyyy-MM-dd"),
            p.invoice_number || "",
          ]);
          const csv = [headers, ...rows].map(r => r.map((c: string) => `"${c}"`).join(",")).join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `payments-${format(new Date(), "yyyy-MM-dd")}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Payments exported");
        }}>
          <Download className="mr-2 h-4 w-4" />
          {t("adminPayments.export", "Export")}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("adminPayments.searchInvoice", "Search by invoice number...")}
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
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminPayments.allStatus", "All Status")}</SelectItem>
                <SelectItem value="completed">{t("adminPayments.completed", "Completed")}</SelectItem>
                <SelectItem value="pending">{t("adminPayments.pending", "Pending")}</SelectItem>
                <SelectItem value="failed">{t("adminPayments.failed", "Failed")}</SelectItem>
                <SelectItem value="refunded">{t("adminPayments.refunded", "Refunded")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminPayments.allTypes", "All Types")}</SelectItem>
                <SelectItem value="registration">{t("adminPayments.types.registration", "Registration")}</SelectItem>
                <SelectItem value="subscription">{t("adminPayments.types.subscription", "Subscription")}</SelectItem>
                <SelectItem value="device">{t("adminPayments.types.device", "Device")}</SelectItem>
                <SelectItem value="shipping">{t("adminPayments.types.shipping", "Shipping")}</SelectItem>
                <SelectItem value="order">{t("adminPayments.types.order", "Order")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminPayments.member", "Member")}</TableHead>
                <TableHead>{t("adminPayments.amount", "Amount")}</TableHead>
                <TableHead>{t("adminPayments.type", "Type")}</TableHead>
                <TableHead>{t("adminPayments.method", "Method")}</TableHead>
                <TableHead>{t("adminPayments.status", "Status")}</TableHead>
                <TableHead>{t("adminPayments.date", "Date")}</TableHead>
                <TableHead>{t("adminPayments.invoice", "Invoice")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t("adminPayments.loading", "Loading payments...")}
                  </TableCell>
                </TableRow>
              ) : data?.payments && data.payments.length > 0 ? (
                data.payments.map((payment: any) => (
                  <TableRow 
                    key={payment.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/members/${payment.member_id}`)}
                  >
                    <TableCell>
                      {payment.member ? (
                        <div>
                          <p className="font-medium">{payment.member.first_name} {payment.member.last_name}</p>
                          <p className="text-sm text-muted-foreground">{payment.member.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t("adminPayments.unknown", "Unknown")}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">€{Number(payment.amount).toFixed(2)}</TableCell>
                    <TableCell>{getTypeBadge(payment.payment_type)}</TableCell>
                    <TableCell className="capitalize">{payment.payment_method.replace("_", " ")}</TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell>
                      {payment.paid_at 
                        ? format(new Date(payment.paid_at), "dd MMM yyyy")
                        : format(new Date(payment.created_at), "dd MMM yyyy")
                      }
                    </TableCell>
                    <TableCell>
                      {payment.invoice_number ? (
                        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                          <FileText className="mr-1 h-4 w-4" />
                          {payment.invoice_number}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t("adminPayments.noPayments", "No payments found")}
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
            {t("adminPayments.showing", "Showing")} {((page - 1) * ITEMS_PER_PAGE) + 1} {t("adminPayments.to", "to")} {Math.min(page * ITEMS_PER_PAGE, data?.totalCount || 0)} {t("adminPayments.of", "of")} {data?.totalCount || 0} {t("adminPayments.paymentsLabel", "payments")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("adminPayments.previous", "Previous")}
            </Button>
            <span className="text-sm">
              {t("adminPayments.page", "Page")} {page} {t("adminPayments.of", "of")} {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              {t("adminPayments.next", "Next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
