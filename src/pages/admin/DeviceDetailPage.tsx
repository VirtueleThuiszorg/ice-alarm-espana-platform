import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDeviceRealtime } from "@/hooks/useDeviceRealtime";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Battery,
  MapPin,
  Wifi,
  WifiOff,
  Clock,
  User,
  Settings,
  AlertTriangle,
  CheckCircle,
  Package,
  Truck,
  Terminal,
  ClipboardList,
  Volume2,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { DeviceManagementModeToggle } from "@/components/admin/devices/DeviceManagementModeToggle";
import { ProvisioningChecklist } from "@/components/admin/devices/ProvisioningChecklist";
import { SmsCommandPanel } from "@/components/admin/devices/SmsCommandPanel";

type DeviceStatus = "in_stock" | "reserved" | "allocated" | "with_staff" | "live" | "faulty" | "returned" | "active" | "inactive";

interface Device {
  id: string;
  imei: string;
  sim_phone_number: string | null;
  model: string | null;
  serial_number: string | null;
  status: DeviceStatus;
  battery_level: number | null;
  is_online: boolean | null;
  offline_since: string | null;
  last_checkin_at: string | null;
  last_location_lat: number | null;
  last_location_lng: number | null;
  last_location_address: string | null;
  configuration_status: string | null;
  notes: string | null;
  created_at: string | null;
  assigned_at: string | null;
  collected_at: string | null;
  live_at: string | null;
  member_id: string | null;
  // New EV-07B fields
  charging_base_mac: string | null;
  sos_number: string | null;
  apn_name: string | null;
  apn_ip_port: string | null;
  reporting_mode: string | null;
  speaker_volume: number | null;
  mic_volume: number | null;
  management_mode: string | null;
  provisioning_checklist: Record<string, any> | null;
  sms_command_log: Record<string, any>[] | null;
  member: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

export default function DeviceDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");

  // Subscribe to realtime updates
  useDeviceRealtime();

  const { data: device, isLoading, error } = useQuery({
    queryKey: ["admin-device-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select(`
          *,
          member:member_id (id, first_name, last_name, email)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as unknown as Device;
    },
    enabled: !!id,
  });

  const updateDeviceMutation = useMutation({
    mutationFn: async (updates: { status?: DeviceStatus; collected_at?: string; live_at?: string }) => {
      const { error } = await supabase
        .from("devices")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-device-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-devices"] });
      toast({ title: t("adminDeviceDetail.updated", "Device updated successfully") });
    },
    onError: (error: Error) => {
      toast({ title: t("adminDeviceDetail.failedUpdate", "Failed to update device"), description: error.message, variant: "destructive" });
    },
  });

  const handleMarkCollected = () => {
    updateDeviceMutation.mutate({
      status: "with_staff" as DeviceStatus,
      collected_at: new Date().toISOString(),
    });
  };

  const handleMarkLive = () => {
    updateDeviceMutation.mutate({
      status: "live" as DeviceStatus,
      live_at: new Date().toISOString(),
    });
  };

  const handleMarkFaulty = () => {
    updateDeviceMutation.mutate({
      status: "faulty" as DeviceStatus,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      in_stock: { variant: "outline", label: "In Stock" },
      reserved: { variant: "secondary", label: "Reserved" },
      allocated: { variant: "default", label: "Allocated" },
      with_staff: { variant: "default", label: "With Staff" },
      live: { variant: "default", label: "Live" },
      faulty: { variant: "destructive", label: "Faulty" },
      returned: { variant: "secondary", label: "Returned" },
    };
    const config = statusConfig[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getBatteryIndicator = (level: number | null) => {
    if (level === null) return <span className="text-muted-foreground">N/A</span>;

    let colorClass = "text-alert-resolved";
    if (level < 20) colorClass = "text-alert-sos";
    else if (level < 50) colorClass = "text-amber-500";

    return (
      <div className="flex items-center gap-2">
        <Battery className={`h-5 w-5 ${colorClass}`} />
        <span className={`font-medium ${colorClass}`}>{level}%</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t("adminDeviceDetail.loading", "Loading device details...")}</div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("common.back", "Back")}
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              {t("adminDeviceDetail.notFound", "Device not found or an error occurred.")}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOnline = device.is_online === true;
  const showWorkflowActions = ["allocated", "with_staff"].includes(device.status);
  const isManualMode = device.management_mode !== "api";

  // Calculate provisioning progress
  const provisioningChecklist = device.provisioning_checklist || {};
  const provisioningSteps = Object.values(provisioningChecklist);
  const completedSteps = provisioningSteps.filter((s: any) => s?.completed).length;
  const totalSteps = 14;
  const provisioningPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{device.model || "EV-07B"} {t("adminDeviceDetail.device", "Device")}</h1>
            <p className="text-muted-foreground font-mono">{device.imei}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isManualMode ? "secondary" : "default"}>
            {isManualMode ? "Manual" : "API"}
          </Badge>
          {getStatusBadge(device.status)}
          {isOnline ? (
            <Badge className="bg-alert-resolved text-alert-resolved-foreground">
              <Wifi className="mr-1 h-3 w-3" />
              Online {device.last_checkin_at && `(${formatDistanceToNow(new Date(device.last_checkin_at))} ago)`}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <WifiOff className="mr-1 h-3 w-3" />
              Offline {device.last_checkin_at && `(last: ${formatDistanceToNow(new Date(device.last_checkin_at))} ago)`}
            </Badge>
          )}
        </div>
      </div>

      {/* Management Mode Toggle */}
      <DeviceManagementModeToggle deviceId={device.id} currentMode={device.management_mode} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Settings className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="provisioning" className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Provisioning
            {provisioningPercent > 0 && provisioningPercent < 100 && (
              <Badge variant="secondary" className="text-[10px] h-4 ml-1">
                {provisioningPercent}%
              </Badge>
            )}
            {provisioningPercent === 100 && (
              <CheckCircle className="h-3 w-3 text-green-600 ml-1" />
            )}
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-1.5">
            <Terminal className="h-4 w-4" />
            SMS Commands
          </TabsTrigger>
          <TabsTrigger value="lifecycle" className="flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            Lifecycle
          </TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW TAB ===== */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Device Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  {t("adminDeviceDetail.deviceInfo", "Device Information")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("adminDeviceDetail.model", "Model")}</p>
                    <p className="font-medium">{device.model || "EV-07B"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("adminDeviceDetail.serialNumber", "Serial Number")}</p>
                    <p className="font-medium font-mono">{device.serial_number || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("adminDeviceDetail.simNumber", "SIM Number")}</p>
                    <p className="font-medium">{device.sim_phone_number || <span className="text-muted-foreground italic">Not assigned</span>}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("adminDeviceDetail.configuration", "Configuration")}</p>
                    <p className="font-medium capitalize">{device.configuration_status || "pending"}</p>
                  </div>
                </div>

                <Separator />

                {/* New EV-07B fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Charging Base MAC</p>
                    <p className="font-medium font-mono text-sm">{device.charging_base_mac || <span className="text-muted-foreground italic">Not paired</span>}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> SOS Number (A1)
                    </p>
                    <p className="font-medium">{device.sos_number || <span className="text-muted-foreground italic">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">APN</p>
                    <p className="font-medium font-mono text-sm">{device.apn_name || <span className="text-muted-foreground italic">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Server IP:Port</p>
                    <p className="font-medium font-mono text-sm">{device.apn_ip_port || <span className="text-muted-foreground italic">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reporting Mode</p>
                    <p className="font-medium capitalize">{device.reporting_mode || "time"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Volume2 className="h-3 w-3" /> Volume (Speaker/Mic)
                    </p>
                    <p className="font-medium">{device.speaker_volume ?? 5} / {device.mic_volume ?? 5}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground mb-2">{t("adminDeviceDetail.batteryLevel", "Battery Level")}</p>
                  {getBatteryIndicator(device.battery_level)}
                </div>

                {device.notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{t("common.notes", "Notes")}</p>
                      <p className="text-sm">{device.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Connectivity Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isOnline ? <Wifi className="h-5 w-5 text-alert-resolved" /> : <WifiOff className="h-5 w-5 text-alert-sos" />}
                  {t("adminDeviceDetail.connectivity", "Connectivity Status")}
                </CardTitle>
                <CardDescription>
                  {t("adminDeviceDetail.realtimeMonitoring", "Real-time connection monitoring")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${isOnline ? "bg-alert-resolved animate-pulse" : "bg-alert-sos"}`} />
                  <span className="font-medium">{isOnline ? t("adminDeviceDetail.connected", "Connected") : t("adminDeviceDetail.disconnected", "Disconnected")}</span>
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{t("adminDeviceDetail.lastCheckin", "Last Check-in")}:</span>
                    <span className="text-sm font-medium">
                      {device.last_checkin_at
                        ? formatDistanceToNow(new Date(device.last_checkin_at), { addSuffix: true })
                        : t("adminDeviceDetail.never", "Never")}
                    </span>
                  </div>

                  {!isOnline && device.offline_since && (
                    <div className="flex items-center gap-2 text-alert-sos">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">
                        {t("adminDeviceDetail.offlineSince", "Offline since")} {format(new Date(device.offline_since), "dd MMM yyyy, HH:mm")}
                      </span>
                    </div>
                  )}
                </div>

                {device.last_checkin_at && (
                  <p className="text-xs text-muted-foreground">
                    Exact time: {format(new Date(device.last_checkin_at), "dd MMM yyyy, HH:mm:ss")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Location */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {t("adminDeviceDetail.lastLocation", "Last Known Location")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {device.last_location_lat && device.last_location_lng ? (
                  <div className="space-y-2">
                    <p className="font-medium">{device.last_location_address || t("adminDeviceDetail.addressNotAvailable", "Address not available")}</p>
                    <p className="text-sm text-muted-foreground">
                      Coordinates: {device.last_location_lat.toFixed(6)}, {device.last_location_lng.toFixed(6)}
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`https://www.google.com/maps?q=${device.last_location_lat},${device.last_location_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        {t("adminDeviceDetail.openInMaps", "Open in Google Maps")}
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t("adminDeviceDetail.noLocation", "No location data available")}</p>
                )}
              </CardContent>
            </Card>

            {/* Member Assignment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t("adminDeviceDetail.memberAssignment", "Member Assignment")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {device.member ? (
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium">
                        {device.member.first_name} {device.member.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">{device.member.email}</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/admin/members/${device.member.id}`}>
                        {t("adminDeviceDetail.viewMemberProfile", "View Member Profile")}
                      </Link>
                    </Button>
                    {device.assigned_at && (
                      <p className="text-xs text-muted-foreground">
                        Assigned on {format(new Date(device.assigned_at), "dd MMM yyyy")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t("adminDeviceDetail.notAssigned", "Not assigned to any member")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== PROVISIONING TAB ===== */}
        <TabsContent value="provisioning">
          <ProvisioningChecklist
            deviceId={device.id}
            onSmsCommandNeeded={() => setActiveTab("sms")}
          />
        </TabsContent>

        {/* ===== SMS COMMANDS TAB ===== */}
        <TabsContent value="sms">
          <SmsCommandPanel
            deviceId={device.id}
            simPhoneNumber={device.sim_phone_number}
          />
        </TabsContent>

        {/* ===== LIFECYCLE TAB ===== */}
        <TabsContent value="lifecycle">
          {device.member ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("adminDeviceDetail.lifecycle", "Device Lifecycle")}</CardTitle>
                <CardDescription>{t("adminDeviceDetail.lifecycleDesc", "Track the device through the allocation workflow")}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Timeline */}
                <div className="flex items-center gap-2 mb-6">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                    ["allocated", "with_staff", "live"].includes(device.status)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <Package className="h-4 w-4" />
                    {t("adminDeviceDetail.allocated", "Allocated")}
                  </div>
                  <div className="h-0.5 w-8 bg-border" />
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                    ["with_staff", "live"].includes(device.status)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <Truck className="h-4 w-4" />
                    {t("adminDeviceDetail.withStaff", "With Staff")}
                  </div>
                  <div className="h-0.5 w-8 bg-border" />
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                    device.status === "live"
                      ? "bg-alert-resolved text-alert-resolved-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <CheckCircle className="h-4 w-4" />
                    {t("adminDeviceDetail.live", "Live")}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t("adminDeviceDetail.allocated", "Allocated")}</p>
                    <p className="font-medium">
                      {device.assigned_at ? format(new Date(device.assigned_at), "dd MMM, HH:mm") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("adminDeviceDetail.collected", "Collected")}</p>
                    <p className="font-medium">
                      {device.collected_at ? format(new Date(device.collected_at), "dd MMM, HH:mm") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("adminDeviceDetail.live", "Live")}</p>
                    <p className="font-medium">
                      {device.live_at ? format(new Date(device.live_at), "dd MMM, HH:mm") : "—"}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                {showWorkflowActions && (
                  <div className="flex gap-2">
                    {device.status === "allocated" && (
                      <Button onClick={handleMarkCollected} disabled={updateDeviceMutation.isPending}>
                        <Truck className="mr-2 h-4 w-4" />
                        {t("adminDeviceDetail.markCollected", "Mark Collected")}
                      </Button>
                    )}
                    {device.status === "with_staff" && (
                      <Button onClick={handleMarkLive} disabled={updateDeviceMutation.isPending}>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {t("adminDeviceDetail.markLive", "Mark Live")}
                      </Button>
                    )}
                    <Button variant="destructive" onClick={handleMarkFaulty} disabled={updateDeviceMutation.isPending}>
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      {t("adminDeviceDetail.markFaulty", "Mark Faulty")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Device lifecycle tracking is available once the device is assigned to a member.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
