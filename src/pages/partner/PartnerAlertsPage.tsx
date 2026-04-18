import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminRole as checkAdminRole } from "@/config/constants";
import { usePartnerData } from "@/hooks/usePartnerData";
import { usePartnerAlertNotifications } from "@/hooks/usePartnerAlertNotifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
import { Bell, AlertTriangle, CheckCircle, Clock, Search, Shield } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

export default function PartnerAlertsPage() {
  const { isStaff, staffRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Admin view mode detection
  const isAdminRole = isStaff && checkAdminRole(staffRole);
  const partnerIdParam = searchParams.get("partnerId");
  const isAdminViewMode = isAdminRole && !!partnerIdParam;

  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminViewMode ? partnerIdParam : undefined
  );

  const partnerId = partner?.id;

  const { 
    notifications, 
    isLoading: notificationsLoading,
    acknowledgeNotification 
  } = usePartnerAlertNotifications(partnerId);

  // Check if partner can access this page
  const canAccess = partner?.partner_type === "residential" && partner?.alert_visibility_enabled;

  // Filter notifications
  const filteredNotifications = notifications?.filter(n => {
    const member = n.member;
    const searchLower = searchQuery.toLowerCase();
    const fullName = member ? `${member.first_name} ${member.last_name}`.toLowerCase() : "";
    const matchesSearch = !searchQuery || fullName.includes(searchLower);
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "acknowledged" && n.acknowledged_at) ||
      (statusFilter === "pending" && !n.acknowledged_at);

    return matchesSearch && matchesStatus;
  }) || [];

  // Stats
  const totalNotifications = notifications?.length || 0;
  const acknowledgedCount = notifications?.filter(n => n.acknowledged_at).length || 0;
  const pendingCount = totalNotifications - acknowledgedCount;

  // Handle acknowledge
  const handleAcknowledge = async (notificationId: string) => {
    try {
      await acknowledgeNotification.mutateAsync(notificationId);
      toast.success("Alert acknowledged");
    } catch (error) {
      toast.error("Failed to acknowledge alert");
    }
  };

  // Get alert type badge color
  const getAlertBadgeVariant = (alertType?: string) => {
    switch (alertType) {
      case "sos":
        return "destructive";
      case "fall":
        return "destructive";
      case "low_battery":
        return "secondary";
      case "geofence":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (partnerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Feature Not Available</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Alert visibility is only available for Residential partners with alert notifications enabled.
            Contact ICE Alarm to enable this feature for your facility.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Alert Notifications</h1>
        <p className="text-muted-foreground">
          View and acknowledge emergency alerts for your residents
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Notifications</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalNotifications}</div>
            <p className="text-xs text-muted-foreground">all time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">awaiting acknowledgment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acknowledged</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{acknowledgedCount}</div>
            <p className="text-xs text-muted-foreground">reviewed and confirmed</p>
          </CardContent>
        </Card>
      </div>

      {/* Notifications Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alert History</CardTitle>
          <CardDescription>
            All emergency alerts received for your subscribed residents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by resident name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Alerts</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {notificationsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== "all"
                  ? "No alerts found matching your filters"
                  : "No alert notifications yet"
                }
              </p>
              {!searchQuery && statusFilter === "all" && (
                <p className="text-sm text-muted-foreground mt-2">
                  You'll be notified when alerts are triggered for your subscribed residents.
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead>Alert Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.map((notification) => {
                  const member = notification.member;
                  const alert = notification.alert;
                  const isPending = !notification.acknowledged_at;

                  return (
                    <TableRow key={notification.id} className={isPending ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">
                            {notification.sent_at 
                              ? format(new Date(notification.sent_at), "MMM d, HH:mm")
                              : "-"
                            }
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {notification.sent_at 
                              ? formatDistanceToNow(new Date(notification.sent_at), { addSuffix: true })
                              : ""
                            }
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {member ? `${member.first_name} ${member.last_name}` : "Unknown Resident"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getAlertBadgeVariant(alert?.alert_type)}>
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {alert?.alert_type?.toUpperCase() || "ALERT"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {notification.notification_method}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {notification.acknowledged_at ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm">Acknowledged</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-600">
                            <Clock className="h-4 w-4" />
                            <span className="text-sm">Pending</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isPending && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAcknowledge(notification.id)}
                            disabled={acknowledgeNotification.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Acknowledge
                          </Button>
                        )}
                        {notification.acknowledged_at && notification.acknowledged_by && (
                          <span className="text-xs text-muted-foreground">
                            by {notification.acknowledged_by}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
