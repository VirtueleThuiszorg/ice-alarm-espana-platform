import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Search,
  MoreHorizontal,
  Eye,
  Pause,
  Play,
  XCircle,
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
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

const ITEMS_PER_PAGE = 20;

export default function SubscriptionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    type: "pause" | "resume" | "cancel";
    subscription: any;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscriptions", searchQuery, statusFilter, planFilter, frequencyFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("subscriptions")
        .select(`
          *,
          member:member_id (id, first_name, last_name, email)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "active" | "cancelled" | "expired" | "paused");
      }

      if (planFilter !== "all") {
        query = query.eq("plan_type", planFilter as "single" | "couple");
      }

      if (frequencyFilter !== "all") {
        query = query.eq("billing_frequency", frequencyFilter as "monthly" | "annual");
      }

      const { data: subscriptions, count, error } = await query;
      if (error) throw error;

      // Client-side search by member name
      let filtered = subscriptions || [];
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((s: any) =>
          s.member?.first_name?.toLowerCase().includes(q) ||
          s.member?.last_name?.toLowerCase().includes(q) ||
          s.member?.email?.toLowerCase().includes(q)
        );
      }

      return { subscriptions: filtered, totalCount: count || 0 };
    },
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from("subscriptions")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      const action = variables.updates.status;
      const messages: Record<string, string> = {
        paused: "Subscription paused successfully",
        active: "Subscription resumed successfully",
        cancelled: "Subscription cancelled successfully",
      };
      toast.success(messages[action] || "Subscription updated");
      setConfirmAction(null);
    },
    onError: () => {
      toast.error("Failed to update subscription");
      setConfirmAction(null);
    },
  });

  const handleAction = (type: "pause" | "resume" | "cancel", subscription: any) => {
    setConfirmAction({ type, subscription });
  };

  const confirmActionHandler = () => {
    if (!confirmAction) return;

    const { type, subscription } = confirmAction;
    const updates: Record<string, any> = {};

    switch (type) {
      case "pause":
        updates.status = "paused";
        break;
      case "resume":
        updates.status = "active";
        break;
      case "cancel":
        updates.status = "cancelled";
        updates.cancelled_at = new Date().toISOString();
        break;
    }

    updateSubscriptionMutation.mutate({ id: subscription.id, updates });
  };

  const getConfirmDialogContent = () => {
    if (!confirmAction) return { title: "", description: "" };

    const memberName = confirmAction.subscription.member
      ? `${confirmAction.subscription.member.first_name} ${confirmAction.subscription.member.last_name}`
      : "Unknown member";

    switch (confirmAction.type) {
      case "pause":
        return {
          title: "Pause Subscription?",
          description: `This will pause the subscription for ${memberName}. The member will not be billed until the subscription is resumed.`,
        };
      case "resume":
        return {
          title: "Resume Subscription?",
          description: `This will resume the subscription for ${memberName}. Billing will restart from the next billing cycle.`,
        };
      case "cancel":
        return {
          title: "Cancel Subscription?",
          description: `This will permanently cancel the subscription for ${memberName}. This action cannot be easily reversed.`,
        };
    }
  };

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">Active</Badge>;
      case "paused":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Paused</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold tracking-tight">{t("adminSubscriptions.title", "Subscriptions")}</h1>
           <p className="text-muted-foreground">
             {t("adminSubscriptions.subtitle", "Manage member subscriptions and billing.")}
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
                placeholder="Search by member name or email..."
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
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="couple">Couple</SelectItem>
              </SelectContent>
            </Select>
            <Select value={frequencyFilter} onValueChange={(v) => { setFrequencyFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Renewal Date</TableHead>
                <TableHead className="w-[70px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading subscriptions...
                  </TableCell>
                </TableRow>
              ) : data?.subscriptions && data.subscriptions.length > 0 ? (
                data.subscriptions.map((sub: any) => (
                  <TableRow
                    key={sub.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/members/${sub.member_id}`)}
                  >
                    <TableCell>
                      {sub.member ? (
                        <div>
                          <p className="font-medium">{sub.member.first_name} {sub.member.last_name}</p>
                          <p className="text-sm text-muted-foreground">{sub.member.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{sub.plan_type}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{sub.billing_frequency}</TableCell>
                    <TableCell className="font-medium">&euro;{Number(sub.amount).toFixed(2)}</TableCell>
                    <TableCell>{getStatusBadge(sub.status)}</TableCell>
                    <TableCell>
                      {format(new Date(sub.renewal_date), "dd MMM yyyy")}
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
                            navigate(`/admin/members/${sub.member_id}`);
                          }}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Member
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {sub.status === "active" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleAction("pause", sub);
                            }}>
                              <Pause className="mr-2 h-4 w-4" />
                              Pause Subscription
                            </DropdownMenuItem>
                          )}
                          {sub.status === "paused" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleAction("resume", sub);
                            }}>
                              <Play className="mr-2 h-4 w-4" />
                              Resume Subscription
                            </DropdownMenuItem>
                          )}
                          {sub.status === "active" && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAction("cancel", sub);
                              }}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Cancel Subscription
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
                    No subscriptions found
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
            Showing {((page - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(page * ITEMS_PER_PAGE, data?.totalCount || 0)} of {data?.totalCount || 0} subscriptions
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
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
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

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getConfirmDialogContent().title}</AlertDialogTitle>
            <AlertDialogDescription>
              {getConfirmDialogContent().description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.type === "cancel" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={confirmActionHandler}
            >
              {confirmAction?.type === "pause" && "Pause"}
              {confirmAction?.type === "resume" && "Resume"}
              {confirmAction?.type === "cancel" && "Cancel Subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
