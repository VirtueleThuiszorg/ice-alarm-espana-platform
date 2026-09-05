import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  ORDER_STATUSES,
  ORDER_STATUS_BADGE,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_NEXT,
  type OrderStatus,
} from "@/lib/orderStatus";
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
import { formatDate } from "@/lib/formatDate";
import { useOrderActions } from "@/hooks/useOrderActions";

const ITEMS_PER_PAGE = 20;

type OrderRow = Tables<"orders"> & {
  member: Pick<Tables<"members">, "id" | "first_name" | "last_name" | "email"> | null;
};

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
        query = query.eq("status", statusFilter as OrderStatus);
      }

      const { data: orders, count, error } = await query;
      if (error) throw error;

      return { orders: (orders || []) as unknown as OrderRow[], totalCount: count || 0 };
    },
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  /** Icon for the button that MOVES an order into each state. Only the three states
   *  ORDER_STATUS_NEXT can return are reachable from this menu; anything else falls back to the
   *  generic one rather than rendering nothing. */
  const NEXT_ACTION_ICON: Partial<Record<OrderStatus, typeof Package>> = {
    processing: Package,
    shipped: Truck,
    delivered: CheckCircle,
  };

  // Every status column in this schema is nullable; a row with no status should render as
  // unknown rather than crash. Known values come from ORDER_STATUS_BADGE, which the compiler
  // forces to cover the whole enum — so a value added by a future migration cannot fall through
  // to the grey `default` chip the way `awaiting_stock` did.
  const getStatusBadge = (status: string | null) => {
    const known = ORDER_STATUSES.find((s) => s === status);
    if (!known) return <Badge variant="outline">{status ?? "—"}</Badge>;
    const { key, fallback } = ORDER_STATUS_LABEL[known];
    return (
      <Badge variant="outline" className={ORDER_STATUS_BADGE[known]}>
        {t(key, fallback)}
      </Badge>
    );
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
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(ORDER_STATUS_LABEL[s].key, ORDER_STATUS_LABEL[s].fallback)}
                  </SelectItem>
                ))}
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
                data.orders.map((order) => (
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
                      {formatDate(order.created_at, "dd MMM yyyy")}
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
                          {(() => {
                            /*
                              One affordance, driven by ORDER_STATUS_NEXT, instead of three
                              hardcoded `order.status === "..."` blocks. Those blocks were why an
                              order in `confirmed` or `awaiting_stock` offered NO action at all —
                              a paid member whose pendant could not be allocated had a row an
                              admin could look at and nothing they could do to it.

                              This is a UI affordance, not the state machine. The real ordering
                              and the D9 role rules belong in a database trigger; see
                              FULFILMENT_MODEL.md §1-E.
                            */
                            const known = ORDER_STATUSES.find((v) => v === order.status);
                            const next = known ? ORDER_STATUS_NEXT[known] : null;
                            if (!next) return null;
                            const Icon = NEXT_ACTION_ICON[next] ?? Package;
                            const label = ORDER_STATUS_LABEL[next];
                            return (
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                updateOrderStatus.mutate({
                                  orderId: order.id,
                                  status: next,
                                  memberId: order.member_id,
                                });
                              }}>
                                <Icon className="mr-2 h-4 w-4" />
                                {t("admin.orders.markAs", "Mark as {{status}}", {
                                  status: t(label.key, label.fallback).toLowerCase(),
                                })}
                              </DropdownMenuItem>
                            );
                          })()}
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