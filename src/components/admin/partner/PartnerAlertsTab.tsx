import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bell, BellOff, Check, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePartnerAlertNotifications, useAcknowledgeAlert } from "@/hooks/usePartnerAlertNotifications";

interface PartnerAlertsTabProps {
  partnerId: string;
  partnerType: string;
  alertVisibilityEnabled: boolean;
}

const alertTypeLabels: Record<string, string> = {
  sos: "SOS Button",
  fall: "Fall Detected",
  low_battery: "Low Battery",
  geofence: "Geofence Alert",
  offline: "Device Offline",
};

const alertTypeColors: Record<string, string> = {
  sos: "bg-red-100 text-red-800",
  fall: "bg-orange-100 text-orange-800",
  low_battery: "bg-yellow-100 text-yellow-800",
  geofence: "bg-blue-100 text-blue-800",
  offline: "bg-gray-100 text-gray-800",
};

export function PartnerAlertsTab({ partnerId, partnerType, alertVisibilityEnabled }: PartnerAlertsTabProps) {
  const { notifications, isLoading } = usePartnerAlertNotifications(partnerId);
  const acknowledgeMutation = useAcknowledgeAlert();

  const handleAcknowledge = async (notificationId: string) => {
    try {
      await acknowledgeMutation.mutateAsync({
        notificationId,
        partnerId,
        acknowledgedBy: "Admin",
      });
      toast.success("Alert acknowledged");
    } catch (error) {
      toast.error("Failed to acknowledge alert");
    }
  };

  if (partnerType !== "residential") {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Alert visibility is only available for Residential partners.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!alertVisibilityEnabled) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <BellOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Alert visibility is not enabled for this partner.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Enable it in the Organization tab to allow this partner to receive alert notifications.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notifications?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unacknowledged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {notifications?.filter((n) => !n.acknowledged_at).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Acknowledged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {notifications?.filter((n) => n.acknowledged_at).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alert Notification History
          </CardTitle>
          <CardDescription>
            All alert notifications sent to this partner
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : notifications?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No alert notifications have been sent to this partner yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Alert Type</TableHead>
                  <TableHead>Alert Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Acknowledged</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications?.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell>
                      <div className="font-medium">
                        {notification.member?.first_name} {notification.member?.last_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          alertTypeColors[notification.alert?.alert_type || ""] || "bg-gray-100 text-gray-800"
                        }
                      >
                        {alertTypeLabels[notification.alert?.alert_type || ""] ||
                          notification.alert?.alert_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{notification.alert?.status}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{notification.notification_method}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(notification.sent_at), "dd MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      {notification.acknowledged_at ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <Check className="h-4 w-4" />
                          <span className="text-sm">
                            {format(new Date(notification.acknowledged_at), "dd MMM HH:mm")}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-orange-600">
                          <Clock className="h-4 w-4" />
                          <span className="text-sm">Pending</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {!notification.acknowledged_at && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledge(notification.id)}
                          disabled={acknowledgeMutation.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Ack
                        </Button>
                      )}
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
