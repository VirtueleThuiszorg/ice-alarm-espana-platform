import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { INTERVALS } from "@/config/constants";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Bell,
  Battery,
  MapPin,
  Phone,
  Activity,
  MoreHorizontal,
  Edit,
  Trash2,
  CheckCircle,
  ArrowUpCircle,
  Flag,
  FileText,
} from "lucide-react";
import { FalseAlarmMonitor } from "@/components/admin/FalseAlarmMonitor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const ITEMS_PER_PAGE = 20;

const alertTypeIcons: Record<string, React.ElementType> = {
  sos_button: AlertTriangle,
  fall_detected: Activity,
  low_battery: Battery,
  geo_fence: MapPin,
  check_in: Bell,
  manual: Phone,
};

export default function AlertsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"history" | "false_alarms">("history");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editIsFalseAlarm, setEditIsFalseAlarm] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [alertToDelete, setAlertToDelete] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-alerts", statusFilter, typeFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("alerts")
        .select(`
          *,
          member:member_id (id, first_name, last_name, email, phone),
          claimed_staff:claimed_by (first_name, last_name)
        `, { count: "exact" })
        .order("received_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "incoming" | "in_progress" | "resolved" | "escalated");
      }

      if (typeFilter !== "all") {
        query = query.eq("alert_type", typeFilter as "sos_button" | "fall_detected" | "low_battery" | "geo_fence" | "check_in" | "manual");
      }

      const { data: alerts, count, error } = await query;
      if (error) throw error;

      return { alerts: alerts || [], totalCount: count || 0 };
    },
    refetchInterval: INTERVALS.DASHBOARD_REFRESH,
  });

  const updateAlertMutation = useMutation({
    mutationFn: async ({ alertId, updates }: { alertId: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from("alerts")
        .update(updates)
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
      toast.success(t("adminAlerts.updateSuccess", "Alert updated successfully"));
      setEditDialogOpen(false);
    },
    onError: () => {
      toast.error(t("adminAlerts.updateError", "Failed to update alert"));
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("alerts")
        .delete()
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
      toast.success(t("adminAlerts.deleteSuccess", "Alert deleted successfully"));
      setDeleteDialogOpen(false);
    },
    onError: () => {
      toast.error(t("adminAlerts.deleteError", "Failed to delete alert"));
    },
  });

  const handleEditClick = (alert: any) => {
    setSelectedAlert(alert);
    setEditStatus(alert.status);
    setEditNotes(alert.resolution_notes || "");
    setEditIsFalseAlarm(alert.is_false_alarm || false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedAlert) return;

    const updates: Record<string, any> = {
      status: editStatus,
      resolution_notes: editNotes || null,
      is_false_alarm: editIsFalseAlarm,
    };

    if (editStatus === "resolved" && selectedAlert.status !== "resolved") {
      updates.resolved_at = new Date().toISOString();
    }

    updateAlertMutation.mutate({ alertId: selectedAlert.id, updates });
  };

  const handleQuickResolve = (alert: any) => {
    updateAlertMutation.mutate({
      alertId: alert.id,
      updates: {
        status: "resolved",
        resolved_at: new Date().toISOString(),
      },
    });
  };

  const handleQuickEscalate = (alert: any) => {
    updateAlertMutation.mutate({
      alertId: alert.id,
      updates: { status: "escalated" },
    });
  };

  const handleToggleFalseAlarm = (alert: any) => {
    updateAlertMutation.mutate({
      alertId: alert.id,
      updates: { is_false_alarm: !alert.is_false_alarm },
    });
  };

  const handleDeleteClick = (alert: any) => {
    setAlertToDelete(alert);
    setDeleteDialogOpen(true);
  };

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "incoming":
        return <Badge variant="destructive" className="animate-pulse">{t("adminAlerts.incoming", "Incoming")}</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">{t("adminAlerts.inProgress", "In Progress")}</Badge>;
      case "resolved":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">{t("adminAlerts.resolved", "Resolved")}</Badge>;
      case "escalated":
        return <Badge variant="destructive">{t("adminAlerts.escalated", "Escalated")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const Icon = alertTypeIcons[type] || Bell;
    const isCritical = type === "sos_button" || type === "fall_detected";

    return (
      <div className={`flex items-center gap-2 ${isCritical ? "text-alert-sos" : "text-muted-foreground"}`}>
        <Icon className="h-4 w-4" />
        <span className="capitalize">{type.replace("_", " ")}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("adminAlerts.title", "Alerts History")}</h1>
          <p className="text-muted-foreground">
            {t("adminAlerts.subtitle", "View and manage all alert records.")}
          </p>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("adminAlerts.history", "Alert History")}
        </button>
        <button
          onClick={() => setActiveTab("false_alarms")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === "false_alarms"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          {t("adminAlerts.falseAlarms", "False Alarm Monitor")}
        </button>
      </div>

      {activeTab === "false_alarms" ? (
        <FalseAlarmMonitor />
      ) : (
      <>
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminAlerts.allStatus", "All Status")}</SelectItem>
                <SelectItem value="incoming">{t("adminAlerts.incoming", "Incoming")}</SelectItem>
                <SelectItem value="in_progress">{t("adminAlerts.inProgress", "In Progress")}</SelectItem>
                <SelectItem value="resolved">{t("adminAlerts.resolved", "Resolved")}</SelectItem>
                <SelectItem value="escalated">{t("adminAlerts.escalated", "Escalated")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alert Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminAlerts.allTypes", "All Types")}</SelectItem>
                <SelectItem value="sos_button">{t("adminAlerts.sosButton", "SOS Button")}</SelectItem>
                <SelectItem value="fall_detected">{t("adminAlerts.fallDetected", "Fall Detected")}</SelectItem>
                <SelectItem value="low_battery">{t("adminAlerts.lowBattery", "Low Battery")}</SelectItem>
                <SelectItem value="geo_fence">{t("adminAlerts.geoFence", "Geo-fence")}</SelectItem>
                <SelectItem value="check_in">{t("adminAlerts.checkIn", "Check-in")}</SelectItem>
                <SelectItem value="manual">{t("adminAlerts.manual", "Manual")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminAlerts.member", "Member")}</TableHead>
                <TableHead>{t("adminAlerts.type", "Type")}</TableHead>
                <TableHead>{t("common.status", "Status")}</TableHead>
                <TableHead>{t("adminAlerts.received", "Received")}</TableHead>
                <TableHead>{t("adminAlerts.resolvedAt", "Resolved")}</TableHead>
                <TableHead>{t("adminAlerts.handledBy", "Handled By")}</TableHead>
                <TableHead className="w-[70px]">{t("common.actions", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t("adminAlerts.loading", "Loading alerts...")}
                  </TableCell>
                </TableRow>
              ) : data?.alerts && data.alerts.length > 0 ? (
                data.alerts.map((alert: any) => (
                  <TableRow
                    key={alert.id}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      alert.status === "incoming" ? "bg-alert-sos/5" : ""
                    }`}
                    onClick={() => navigate(`/admin/members/${alert.member_id}`)}
                  >
                    <TableCell>
                      {alert.member ? (
                        <div>
                          <p className="font-medium">{alert.member.first_name} {alert.member.last_name}</p>
                          <p className="text-sm text-muted-foreground">{alert.member.phone}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t("adminAlerts.unknown", "Unknown")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeBadge(alert.alert_type)}
                        {alert.is_false_alarm && (
                          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
                            {t("adminAlerts.falseAlarm", "False Alarm")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(alert.status)}</TableCell>
                    <TableCell>
                      {format(new Date(alert.received_at), "dd MMM yyyy, HH:mm")}
                    </TableCell>
                    <TableCell>
                      {alert.resolved_at
                        ? format(new Date(alert.resolved_at), "dd MMM yyyy, HH:mm")
                        : <span className="text-muted-foreground">&mdash;</span>
                      }
                    </TableCell>
                    <TableCell>
                      {alert.claimed_staff ? (
                        `${alert.claimed_staff.first_name} ${alert.claimed_staff.last_name}`
                      ) : (
                        <span className="text-muted-foreground">&mdash;</span>
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
                            handleEditClick(alert);
                          }}>
                            <Edit className="mr-2 h-4 w-4" />
                            {t("adminAlerts.editAlert", "Edit Alert")}
                          </DropdownMenuItem>
                          {alert.status !== "resolved" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleQuickResolve(alert);
                            }}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              {t("adminAlerts.resolve", "Resolve")}
                            </DropdownMenuItem>
                          )}
                          {alert.status !== "escalated" && alert.status !== "resolved" && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleQuickEscalate(alert);
                            }}>
                              <ArrowUpCircle className="mr-2 h-4 w-4" />
                              {t("adminAlerts.escalate", "Escalate")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFalseAlarm(alert);
                          }}>
                            <Flag className="mr-2 h-4 w-4" />
                            {alert.is_false_alarm
                              ? t("adminAlerts.unmarkFalseAlarm", "Unmark False Alarm")
                              : t("adminAlerts.markFalseAlarm", "Mark as False Alarm")
                            }
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/members/${alert.member_id}`);
                          }}>
                            <FileText className="mr-2 h-4 w-4" />
                            {t("adminAlerts.viewMember", "View Member")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(alert);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("adminAlerts.delete", "Delete Alert")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t("adminAlerts.noAlerts", "No alerts found")}
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
            {t("common.showingXofY", "Showing {{from}} to {{to}} of {{total}}", {
              from: ((page - 1) * ITEMS_PER_PAGE) + 1,
              to: Math.min(page * ITEMS_PER_PAGE, data?.totalCount || 0),
              total: data?.totalCount || 0,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("common.previous", "Previous")}
            </Button>
            <span className="text-sm">
              {t("common.pageXofY", "Page {{page}} of {{total}}", { page, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              {t("common.next", "Next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Edit Alert Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminAlerts.editAlert", "Edit Alert")}</DialogTitle>
            <DialogDescription>
              {selectedAlert?.member
                ? `${selectedAlert.member.first_name} ${selectedAlert.member.last_name} - ${selectedAlert.alert_type?.replace("_", " ")}`
                : t("adminAlerts.updateDetails", "Update alert details")
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("common.status", "Status")}</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming">{t("adminAlerts.incoming", "Incoming")}</SelectItem>
                  <SelectItem value="in_progress">{t("adminAlerts.inProgress", "In Progress")}</SelectItem>
                  <SelectItem value="resolved">{t("adminAlerts.resolved", "Resolved")}</SelectItem>
                  <SelectItem value="escalated">{t("adminAlerts.escalated", "Escalated")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("adminAlerts.resolutionNotes", "Resolution Notes")}</label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder={t("adminAlerts.notesPlaceholder", "Add notes about this alert...")}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="falseAlarm"
                checked={editIsFalseAlarm}
                onChange={(e) => setEditIsFalseAlarm(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="falseAlarm" className="text-sm font-medium">
                {t("adminAlerts.markFalseAlarm", "Mark as False Alarm")}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateAlertMutation.isPending}
            >
              {t("common.save", "Save Changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminAlerts.confirmDelete", "Delete Alert?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("adminAlerts.deleteWarning", "This will permanently delete this alert record. This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => alertToDelete && deleteAlertMutation.mutate(alertToDelete.id)}
            >
              {t("adminAlerts.delete", "Delete Alert")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
