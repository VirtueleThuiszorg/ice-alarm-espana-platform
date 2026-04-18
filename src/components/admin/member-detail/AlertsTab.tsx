import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, Bell, MapPin, User, CheckCircle, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { LocationMap } from "@/components/maps/LocationMap";

interface Alert {
  id: string;
  alert_type: string;
  status: string;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  received_at: string;
  claimed_at: string | null;
  resolved_at: string | null;
  emergency_services_called: boolean | null;
  next_of_kin_notified: boolean | null;
  resolution_notes: string | null;
  claimed_by_staff: {
    first_name: string;
    last_name: string;
  } | null;
}

interface AlertsTabProps {
  memberId: string;
}

export function AlertsTab({ memberId }: AlertsTabProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, [memberId]);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select(`
          *,
          claimed_by_staff:staff!alerts_claimed_by_fkey (first_name, last_name)
        `)
        .eq("member_id", memberId)
        .order("received_at", { ascending: false });

      if (error) throw error;
      setAlerts((data || []) as unknown as Alert[]);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast.error("Failed to load alerts");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "incoming":
        return <Badge variant="destructive" className="animate-pulse">Incoming</Badge>;
      case "in_progress":
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">In Progress</Badge>;
      case "escalated":
        return <Badge variant="destructive">Escalated</Badge>;
      case "resolved":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAlertTypeBadge = (type: string) => {
    switch (type) {
      case "sos":
        return <Badge variant="destructive">SOS</Badge>;
      case "fall":
        return <Badge variant="secondary" className="bg-orange-500/20 text-orange-700">Fall Detection</Badge>;
      case "low_battery":
        return <Badge variant="outline">Low Battery</Badge>;
      case "no_movement":
        return <Badge variant="outline">No Movement</Badge>;
      case "geofence":
        return <Badge variant="secondary">Geofence</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const openAlertDetail = (alert: Alert) => {
    setSelectedAlert(alert);
    setIsDetailOpen(true);
  };

  const filteredAlerts = statusFilter === "all"
    ? alerts
    : alerts.filter((a) => a.status === statusFilter);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Alert History</CardTitle>
            <CardDescription>All emergency alerts for this member</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="incoming">Incoming</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No alerts recorded</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Handled By</TableHead>
                  <TableHead>Response Time</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.map((alert) => {
                  const responseTime = alert.resolved_at && alert.received_at
                    ? Math.round((new Date(alert.resolved_at).getTime() - new Date(alert.received_at).getTime()) / 60000)
                    : null;

                  return (
                    <TableRow 
                      key={alert.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openAlertDetail(alert)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{format(new Date(alert.received_at), "dd MMM yyyy")}</p>
                          <p className="text-sm text-muted-foreground">{format(new Date(alert.received_at), "HH:mm:ss")}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getAlertTypeBadge(alert.alert_type)}</TableCell>
                      <TableCell>{getStatusBadge(alert.status)}</TableCell>
                      <TableCell>
                        {alert.location_address ? (
                          <span className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3 w-3" />
                            {alert.location_address.substring(0, 30)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {alert.claimed_by_staff ? (
                          <span className="flex items-center gap-1 text-sm">
                            <User className="h-3 w-3" />
                            {alert.claimed_by_staff.first_name} {alert.claimed_by_staff.last_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {responseTime !== null ? (
                          <span className="text-sm">{responseTime} min</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={(e) => {
                          e.stopPropagation();
                          openAlertDetail(alert);
                        }}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alert Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alert Details
            </DialogTitle>
            <DialogDescription>
              {selectedAlert && format(new Date(selectedAlert.received_at), "PPpp")}
            </DialogDescription>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-6">
              {/* Status & Type */}
              <div className="flex flex-wrap gap-2">
                {getAlertTypeBadge(selectedAlert.alert_type)}
                {getStatusBadge(selectedAlert.status)}
                {selectedAlert.emergency_services_called && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700">
                    <Phone className="mr-1 h-3 w-3" />
                    112 Called
                  </Badge>
                )}
                {selectedAlert.next_of_kin_notified && (
                  <Badge variant="outline" className="bg-green-500/10 text-green-700">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Next of Kin Notified
                  </Badge>
                )}
              </div>

              {/* Timeline */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Received</p>
                  <p className="font-medium">{format(new Date(selectedAlert.received_at), "HH:mm:ss")}</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Claimed</p>
                  <p className="font-medium">
                    {selectedAlert.claimed_at 
                      ? format(new Date(selectedAlert.claimed_at), "HH:mm:ss")
                      : "-"
                    }
                  </p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Resolved</p>
                  <p className="font-medium">
                    {selectedAlert.resolved_at 
                      ? format(new Date(selectedAlert.resolved_at), "HH:mm:ss")
                      : "-"
                    }
                  </p>
                </div>
              </div>

              {/* Handler */}
              {selectedAlert.claimed_by_staff && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Handled by: <strong>{selectedAlert.claimed_by_staff.first_name} {selectedAlert.claimed_by_staff.last_name}</strong>
                  </span>
                </div>
              )}

              {/* Location Map */}
              {selectedAlert.location_lat && selectedAlert.location_lng && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedAlert.location_address || "Location recorded"}</span>
                  </div>
                  <div className="h-[200px] rounded-lg overflow-hidden">
                    <LocationMap 
                      lat={Number(selectedAlert.location_lat)} 
                      lng={Number(selectedAlert.location_lng)} 
                    />
                  </div>
                </div>
              )}

              {/* Resolution Notes */}
              {selectedAlert.resolution_notes && (
                <div className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm font-medium mb-1">Resolution Notes</p>
                  <p className="text-sm">{selectedAlert.resolution_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
