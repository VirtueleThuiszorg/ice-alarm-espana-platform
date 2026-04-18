import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  WifiOff, 
  Wrench,
  Clock,
  ArrowRight,
  User,
  CheckCircle
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";

interface DeviceIssue {
  id: string;
  imei: string;
  status: string;
  is_online: boolean;
  offline_since: string | null;
  last_checkin_at: string | null;
  member_id: string | null;
  member?: {
    first_name: string;
    last_name: string;
  } | null;
}

export function DeviceIssuesQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Subscribe to realtime device updates
  useEffect(() => {
    const channel = supabase
      .channel("staff-device-issues")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["staff-device-issues"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: issues, isLoading } = useQuery({
    queryKey: ["staff-device-issues"],
    queryFn: async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      // Get faulty devices or devices offline for more than 30 minutes
      const { data, error } = await supabase
        .from("devices")
        .select(`
          id,
          imei,
          status,
          is_online,
          offline_since,
          last_checkin_at,
          member_id,
          member:members(first_name, last_name)
        `)
        .eq("model", "EV-07B")
        .or(`status.eq.faulty,and(is_online.eq.false,offline_since.lt.${thirtyMinutesAgo})`)
        .limit(5);

      if (error) throw error;
      return data as DeviceIssue[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card className="shadow-sm bg-background/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {t("callCentre.deviceIssues.title", "Device Issues")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const issueCount = issues?.length || 0;
  const hasIssues = issueCount > 0;

  const getIssueType = (device: DeviceIssue) => {
    if (device.status === "faulty") return "faulty";
    if (!device.is_online && device.offline_since) {
      const offlineMinutes = differenceInMinutes(new Date(), new Date(device.offline_since));
      if (offlineMinutes > 30) return "offline_extended";
    }
    return "unknown";
  };

  const getIssueBadge = (issueType: string) => {
    switch (issueType) {
      case "faulty":
        return <Badge variant="destructive">{t("callCentre.deviceIssues.faulty", "Faulty")}</Badge>;
      case "offline_extended":
        return <Badge className="bg-orange-500">{t("callCentre.deviceIssues.offlineExtended", "Offline >30m")}</Badge>;
      default:
        return <Badge variant="secondary">{t("callCentre.deviceIssues.issue", "Issue")}</Badge>;
    }
  };

  return (
    <Card className={cn(
      "shadow-sm bg-background/80",
      hasIssues && "border-orange-500/50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wrench className={cn(
                "h-5 w-5",
                hasIssues ? "text-orange-500" : "text-muted-foreground"
              )} />
              {t("callCentre.deviceIssues.title", "Device Issues")}
              {hasIssues && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 ml-1">
                  {issueCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="truncate">{t("callCentre.deviceIssues.subtitle", "Faulty or extended offline devices")}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/ev07b">
              {t("callCentre.deviceIssues.viewAll", "View All")} <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasIssues ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>{t("callCentre.deviceIssues.noIssues", "No device issues")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {issues?.map((device) => {
              const issueType = getIssueType(device);
              const member = device.member as DeviceIssue["member"];
              
              return (
                <div 
                  key={device.id} 
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/admin/devices/${device.id}`)}
                >
                  <div className="flex items-center gap-3">
                    {issueType === "faulty" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-orange-500" />
                    )}
                    <div>
                      <p className="font-mono text-sm">{device.imei}</p>
                      {member ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {member.first_name} {member.last_name}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t("callCentre.deviceIssues.unassigned", "Unassigned")}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {device.offline_since && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(device.offline_since), { addSuffix: true })}
                      </span>
                    )}
                    {getIssueBadge(issueType)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
