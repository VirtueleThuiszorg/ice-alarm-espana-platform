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
import {
  FULFILMENT_ACTION_LABEL,
  FULFILMENT_BADGE,
  FULFILMENT_LABEL,
  FULFILMENT_STATES,
  FULFILMENT_TO_ORDER_STATUS,
  isStaffMovableTransition,
  mayCorrectFulfilment,
  nextFulfilmentState,
  type FulfilmentState,
} from "@/lib/fulfilmentState";
import { useFulfilmentState } from "@/hooks/useFulfilmentState";
import { useAuth } from "@/contexts/AuthContext";
import { FulfilmentCorrectionDialog } from "@/components/admin/orders/FulfilmentCorrectionDialog";
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
  ChevronRight,
  AlertTriangle,
  PhoneCall,
  Undo2,
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
  const [fulfilmentFilter, setFulfilmentFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { updateOrderStatus } = useOrderActions();
  const { moveFulfilment } = useFulfilmentState();
  const { staffRole } = useAuth();
  /* D9 is enforced by `may_reverse_fulfilment()`; this only decides whether to OFFER the
     correction, so an operator is not handed a dialog the database will refuse. */
  const canCorrect = mayCorrectFulfilment(staffRole);
  const [correcting, setCorrecting] = useState<OrderRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", searchQuery, statusFilter, fulfilmentFilter, page],
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

      if (fulfilmentFilter !== "all") {
        query = query.eq("fulfilment_state", fulfilmentFilter as FulfilmentState);
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

  /**
   * The fulfilment badge. `fulfilment_state` is NOT NULL with a default, so unlike
   * `orders.status` there is no "unknown" case to render — but a row read before the types were
   * regenerated could still arrive without it, and rendering nothing there would be a silently
   * empty column rather than a visible gap.
   */
  const getFulfilmentBadge = (state: FulfilmentState | null) => {
    const known = FULFILMENT_STATES.find((s) => s === state);
    if (!known) return <Badge variant="outline">—</Badge>;
    const { key, fallback } = FULFILMENT_LABEL[known];
    return (
      <Badge variant="outline" className={FULFILMENT_BADGE[known]}>
        {t(key, fallback)}
      </Badge>
    );
  };

  /**
   * THE TWO LADDERS, MADE VISIBLE.
   *
   * There are two columns because §3 keeps `orders.status` for the commission path, and the
   * price of two columns is that they can disagree: "Mark as shipped" moves `status` and leaves
   * `fulfilment_state` behind, while "Collected for delivery" moves both. Silent disagreement is
   * how an order ends up dispatched-but-pending and invisible to whichever filter somebody used.
   *
   * So it is shown. `null` in the map means the fulfilment state is finer-grained than
   * `orders.status` can express (`programmed`, `tested`) — those are not drift and must not be
   * flagged as it.
   */
  const fulfilmentDrift = (order: OrderRow): OrderStatus | null => {
    const state = FULFILMENT_STATES.find((s) => s === order.fulfilment_state);
    if (!state) return null;
    const expected = FULFILMENT_TO_ORDER_STATUS[state];
    if (!expected || expected === order.status) return null;
    return expected;
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
            {/*
              A second filter, not a replacement for the first. `orders.status` and
              `fulfilment_state` answer different questions — "has the money and the commission
              moved" and "where is the pendant" — and the reason there are two of them is
              FULFILMENT_MODEL.md §3. The one an operator reaches for most is this one: "which
              paid pendants have never been tested" is the readiness question.
            */}
            <Select value={fulfilmentFilter} onValueChange={(v) => { setFulfilmentFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[200px]" aria-label={t("admin.fulfilment.filter", "Fulfilment")}>
                <SelectValue placeholder={t("admin.fulfilment.filter", "Fulfilment")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("admin.fulfilment.filterAll", "All fulfilment states")}
                </SelectItem>
                {FULFILMENT_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(FULFILMENT_LABEL[s].key, FULFILMENT_LABEL[s].fallback)}
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
                <TableHead>{t("admin.fulfilment.column", "Fulfilment")}</TableHead>
                <TableHead>{t("admin.table.tracking")}</TableHead>
                <TableHead className="w-[70px]">{t("admin.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
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
                      <div className="flex items-center gap-1.5">
                        {getFulfilmentBadge(order.fulfilment_state)}
                        {(() => {
                          const expected = fulfilmentDrift(order);
                          if (!expected) return null;
                          return (
                            <span
                              data-testid="fulfilment-drift"
                              title={t(
                                "admin.fulfilment.driftTitle",
                                "Fulfilment says this, but the order status says {{status}}. The two are out of step.",
                                {
                                  status: t(
                                    ORDER_STATUS_LABEL[expected].key,
                                    ORDER_STATUS_LABEL[expected].fallback,
                                  ),
                                },
                              )}
                              className="flex items-center gap-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                              {t("admin.fulfilment.driftShort", "out of step")}
                            </span>
                          );
                        })()}
                      </div>
                    </TableCell>
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
                          {(() => {
                            /*
                              THE FULFILMENT LADDER. Separate from the status action above, and
                              deliberately so — see fulfilmentDrift() for why there are two.

                              Only the moves a human actually makes appear here. `allocated` is
                              the act of assigning a device and `programmed` is the act of
                              finishing the provisioning checklist; a button for either would let
                              staff assert a thing they had not done, which is the whole point of
                              STAFF_MOVABLE_STATES excluding them.
                            */
                            const state = FULFILMENT_STATES.find(
                              (v) => v === order.fulfilment_state,
                            );
                            if (!state) return null;
                            const next = nextFulfilmentState(state);
                            const movable = next && isStaffMovableTransition(state, next);
                            if (!movable && !canCorrect) return null;
                            return (
                              <>
                                <DropdownMenuSeparator />
                                {movable && next && (
                                  <DropdownMenuItem
                                    data-testid={`fulfilment-advance-${next}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveFulfilment.mutate({
                                        orderId: order.id,
                                        memberId: order.member_id,
                                        from: state,
                                        to: next,
                                        currentStatus: order.status,
                                      });
                                    }}
                                  >
                                    {next === "tested" ? (
                                      <PhoneCall className="mr-2 h-4 w-4" />
                                    ) : next === "dispatched" ? (
                                      <Truck className="mr-2 h-4 w-4" />
                                    ) : (
                                      <CheckCircle className="mr-2 h-4 w-4" />
                                    )}
                                    {t(
                                      FULFILMENT_ACTION_LABEL[next].key,
                                      FULFILMENT_ACTION_LABEL[next].fallback,
                                    )}
                                  </DropdownMenuItem>
                                )}
                                {canCorrect && (
                                  <DropdownMenuItem
                                    data-testid="fulfilment-correct"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCorrecting(order);
                                    }}
                                  >
                                    <Undo2 className="mr-2 h-4 w-4" />
                                    {t(
                                      "admin.fulfilment.correctAction",
                                      "Correct fulfilment state…",
                                    )}
                                  </DropdownMenuItem>
                                )}
                              </>
                            );
                          })()}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {t("admin.orders.noResults")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/*
        One dialog for the page, not one per row: mounting a Dialog inside every TableRow means
        twenty of them on screen, each with its own state, and the reason field of the wrong one
        is easy to submit. `correcting` holds the row it is about.
      */}
      {correcting && (
        <FulfilmentCorrectionDialog
          open={!!correcting}
          onOpenChange={(open) => !open && setCorrecting(null)}
          currentState={
            FULFILMENT_STATES.find((s) => s === correcting.fulfilment_state) ?? "paid"
          }
          previousReason={correcting.fulfilment_state_reason}
          orderNumber={correcting.order_number}
          isSaving={moveFulfilment.isPending}
          onConfirm={(to, reason) => {
            const from =
              FULFILMENT_STATES.find((s) => s === correcting.fulfilment_state) ?? "paid";
            moveFulfilment.mutate(
              {
                orderId: correcting.id,
                memberId: correcting.member_id,
                from,
                to,
                currentStatus: correcting.status,
                reason,
              },
              // Closed only on success. A refusal keeps the dialog open with the reason still
              // in it, so the operator can read the toast and adjust rather than retype.
              { onSuccess: () => setCorrecting(null) },
            );
          }}
        />
      )}

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