import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  Search, 
  MoreHorizontal,
  Eye,
  Truck,
  Package,
  CheckCircle,
  ChevronLeft,
  ChevronRight
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
import { format } from "date-fns";
import { useOrderActions } from "@/hooks/useOrderActions";

const ITEMS_PER_PAGE = 20;

export default function OrdersPage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { updateOrderStatus } = useOrderActions();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", searchQuery, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(`
          *,
          member:member_id (id, first_name, last_name, email)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (searchQuery) {
        query = query.or(`order_number.ilike.%${searchQuery}%`);
      }

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "processing" | "shipped" | "delivered" | "cancelled");
      }

      const { data: orders, count, error } = await query;
      if (error) throw error;

      return { orders: orders || [], totalCount: count || 0 };
    },
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">{t("common.pending")}</Badge>;
      case "processing":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">{t("common.processing")}</Badge>;
      case "shipped":
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/20">{t("common.shipped")}</Badge>;
      case "delivered":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">{t("common.delivered")}</Badge>;
      case "cancelled":
        return <Badge variant="destructive">{t("common.cancelled")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("admin.orders.title")}</h1>
          <p className="text-muted-foreground">
            {t("admin.orders.subtitle")}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.orders.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("common.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")} {t("common.status")}</SelectItem>
                <SelectItem value="pending">{t("common.pending")}</SelectItem>
                <SelectItem value="processing">{t("common.processing")}</SelectItem>
                <SelectItem value="shipped">{t("common.shipped")}</SelectItem>
                <SelectItem value="delivered">{t("common.delivered")}</SelectItem>
                <SelectItem value="cancelled">{t("common.cancelled")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.table.orderNumber")}</TableHead>
                <TableHead>{t("admin.table.member")}</TableHead>
                <TableHead>{t("admin.table.date")}</TableHead>
                <TableHead>{t("admin.table.total")}</TableHead>
                <TableHead>{t("admin.table.status")}</TableHead>
                <TableHead>{t("admin.table.tracking")}</TableHead>
                <TableHead className="w-[70px]">{t("admin.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t("admin.orders.loading")}
                  </TableCell>
                </TableRow>
              ) : data?.orders && data.orders.length > 0 ? (
                data.orders.map((order: any) => (
                  <TableRow 
                    key={order.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/orders/${order.id}`)}
                  >
                    <TableCell className="font-mono font-medium">
                      {order.order_number}
                    </TableCell>
                    <TableCell>
                      {order.member ? (
                        `${order.member.first_name} ${order.member.last_name}`
                      ) : (
                        <span className="text-muted-foreground">{t("admin.orders.unknown")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(order.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">
                      €{Number(order.total_amount).toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>
                      {order.tracking_number || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/orders/${order.id}`);
                          }}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t("admin.orders.viewDetails")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {order.status === "pending" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              updateOrderStatus.mutate({
                                orderId: order.id,
                                status: "processing",
                                memberId: order.member_id,
                              });
                            }}>
                              <Package className="mr-2 h-4 w-4" />
                              {t("admin.orders.markProcessing")}
                            </DropdownMenuItem>
                          )}
                          {order.status === "processing" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              updateOrderStatus.mutate({
                                orderId: order.id,
                                status: "shipped",
                                memberId: order.member_id,
                              });
                            }}>
                              <Truck className="mr-2 h-4 w-4" />
                              {t("admin.orders.markShipped")}
                            </DropdownMenuItem>
                          )}
                          {order.status === "shipped" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              updateOrderStatus.mutate({
                                orderId: order.id,
                                status: "delivered",
                                memberId: order.member_id,
                              });
                            }}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              {t("admin.orders.markDelivered")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t("admin.orders.noResults")}
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
            {t("admin.orders.showing", { from: ((page - 1) * ITEMS_PER_PAGE) + 1, to: Math.min(page * ITEMS_PER_PAGE, data?.totalCount || 0), total: data?.totalCount || 0 })}
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
    </div>
  );
}