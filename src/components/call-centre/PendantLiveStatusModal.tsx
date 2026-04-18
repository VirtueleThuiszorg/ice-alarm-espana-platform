import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es, enGB } from "date-fns/locale";
import i18n from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Smartphone,
  Wifi,
  WifiOff,
  Phone,
  User,
  Battery,
  AlertTriangle,
} from "lucide-react";

interface DeviceWithMember {
  id: string;
  imei: string;
  is_online: boolean | null;
  last_checkin_at: string | null;
  battery_level: number | null;
  offline_since: string | null;
  member: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  } | null;
}

export function PendantLiveStatusModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const dateLocale = i18n.language === "es" ? es : enGB;

  // Fetch devices with member data
  const { data: devices, isLoading } = useQuery({
    queryKey: ["pendant-live-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select(
          `
          id,
          imei,
          is_online,
          last_checkin_at,
          battery_level,
          offline_since,
          member:members(id, first_name, last_name, phone, email)
        `
        )
        .eq("model", "EV-07B")
        .in("status", ["allocated", "with_staff", "live"])
        .order("is_online", { ascending: true })
        .order("last_checkin_at", { ascending: false });

      if (error) throw error;
      return data as DeviceWithMember[];
    },
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });

  // Subscribe to realtime updates when modal is open
  useEffect(() => {
    if (!open) return;

    const channel = supabase
      .channel("pendant-live-status-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pendant-live-status"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, queryClient]);

  // Calculate stats
  const onlineDevices = devices?.filter((d) => d.is_online === true) || [];
  const offlineDevices = devices?.filter((d) => d.is_online === false) || [];
  const totalDevices = devices?.length || 0;

  // Format last seen time
  const formatLastSeen = (timestamp: string | null) => {
    if (!timestamp) return t("pendantStatus.unknown");
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Less than 2 minutes = "Just now"
    if (diffMs < 120000) {
      return t("pendantStatus.justNow");
    }

    return formatDistanceToNow(date, { addSuffix: true, locale: dateLocale });
  };

  const handleViewMember = (memberId: string) => {
    setOpen(false);
    navigate(`/call-centre/members/${memberId}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Smartphone className="h-4 w-4" />
          {t("pendantStatus.title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            {t("pendantStatus.title")}
          </DialogTitle>
          <DialogDescription>
            {t("pendantStatus.realtimeFleetStatus")}
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="flex gap-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-bold">
              {totalDevices}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {t("pendantStatus.totalDevices")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500 hover:bg-green-500 font-bold">
              {onlineDevices.length}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {t("pendantStatus.devicesOnline")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="font-bold">
              {offlineDevices.length}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {t("pendantStatus.devicesOffline")}
            </span>
          </div>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !devices || devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Smartphone className="h-12 w-12 mb-4 opacity-50" />
              <p>{t("pendantStatus.noDevicesAssigned")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Offline Devices Section */}
              {offlineDevices.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <h3 className="font-semibold text-sm uppercase">
                      {t("pendantStatus.offlineDevices")} ({offlineDevices.length})
                    </h3>
                    <span className="text-xs text-destructive/80">
                      - {t("pendantStatus.requireFollowUp")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {offlineDevices.map((device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        isOffline
                        formatLastSeen={formatLastSeen}
                        onViewMember={handleViewMember}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Online Devices Section */}
              {onlineDevices.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-600">
                    <Wifi className="h-4 w-4" />
                    <h3 className="font-semibold text-sm uppercase">
                      {t("pendantStatus.onlineDevices")} ({onlineDevices.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {onlineDevices.map((device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        isOffline={false}
                        formatLastSeen={formatLastSeen}
                        onViewMember={handleViewMember}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface DeviceRowProps {
  device: DeviceWithMember;
  isOffline: boolean;
  formatLastSeen: (timestamp: string | null) => string;
  onViewMember: (memberId: string) => void;
  t: (key: string) => string;
}

function DeviceRow({
  device,
  isOffline,
  formatLastSeen,
  onViewMember,
  t,
}: DeviceRowProps) {
  const member = device.member;
  const memberName = member
    ? `${member.first_name} ${member.last_name}`
    : t("pendantStatus.unassigned");

  const lastSeenTime = formatLastSeen(
    isOffline ? device.offline_since || device.last_checkin_at : device.last_checkin_at
  );

  return (
    <div
      className={`p-3 rounded-lg border ${
        isOffline
          ? "bg-destructive/5 border-destructive/20"
          : "bg-green-500/5 border-green-500/20"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{memberName}</span>
            <Badge
              variant={isOffline ? "destructive" : "default"}
              className={`text-xs ${
                !isOffline ? "bg-green-500 hover:bg-green-500" : ""
              }`}
            >
              {isOffline ? (
                <>
                  <WifiOff className="h-3 w-3 mr-1" />
                  {t("common.offline")}
                </>
              ) : (
                <>
                  <Wifi className="h-3 w-3 mr-1" />
                  {t("common.online")}
                </>
              )}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {member?.phone && (
              <a
                href={`tel:${member.phone}`}
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <Phone className="h-3 w-3" />
                {member.phone}
              </a>
            )}
            <span className="text-xs">
              {t("pendantStatus.lastSeen")}: {lastSeenTime}
            </span>
            {device.battery_level !== null && (
              <span
                className={`flex items-center gap-1 text-xs ${
                  device.battery_level <= 20 ? "text-destructive" : ""
                }`}
              >
                <Battery className="h-3 w-3" />
                {device.battery_level}%
              </span>
            )}
          </div>

          <div className="text-xs text-muted-foreground mt-1">
            IMEI: {device.imei}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          {member?.phone && (
            <Button
              size="sm"
              variant={isOffline ? "default" : "outline"}
              asChild
              className="h-8"
            >
              <a href={`tel:${member.phone}`}>
                <Phone className="h-3 w-3 mr-1" />
                {t("pendantStatus.callMember")}
              </a>
            </Button>
          )}
          {member && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewMember(member.id)}
              className="h-8"
            >
              <User className="h-3 w-3 mr-1" />
              {t("pendantStatus.viewMember")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
