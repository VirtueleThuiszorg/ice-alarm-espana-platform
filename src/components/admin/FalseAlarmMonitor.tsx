import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";

interface FalseAlarmSummary {
  member_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  count_7d: number;
  count_30d: number;
}

export function FalseAlarmMonitor() {
  const { t } = useTranslation();

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["false-alarm-monitor"],
    queryFn: async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

      // Fetch all false alarms in the last 30 days
      const { data: alerts } = await supabase
        .from("alerts")
        .select("member_id, resolved_at")
        .eq("is_false_alarm", true)
        .eq("status", "resolved")
        .gte("resolved_at", thirtyDaysAgo)
        .order("resolved_at", { ascending: false });

      if (!alerts || alerts.length === 0) return [];

      // Group by member
      const memberCounts: Record<string, { count_7d: number; count_30d: number }> = {};
      for (const a of alerts) {
        if (!memberCounts[a.member_id]) {
          memberCounts[a.member_id] = { count_7d: 0, count_30d: 0 };
        }
        memberCounts[a.member_id].count_30d++;
        if (a.resolved_at && a.resolved_at >= sevenDaysAgo) {
          memberCounts[a.member_id].count_7d++;
        }
      }

      // Fetch member details
      const memberIds = Object.keys(memberCounts);
      const { data: members } = await supabase
        .from("members")
        .select("id, first_name, last_name, phone")
        .in("id", memberIds);

      const result: FalseAlarmSummary[] = (members || []).map((m) => ({
        member_id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        phone: m.phone,
        count_7d: memberCounts[m.id]?.count_7d || 0,
        count_30d: memberCounts[m.id]?.count_30d || 0,
      }));

      // Sort by 7-day count descending
      result.sort((a, b) => b.count_7d - a.count_7d || b.count_30d - a.count_30d);

      return result;
    },
    staleTime: STALE_TIMES.MEDIUM,
  });

  const handleScheduleFollowUp = async (memberId: string, memberName: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    await supabase.from("tasks").insert({
      title: `False alarm follow-up: ${memberName}`,
      description: `Follow-up call to ${memberName} regarding frequent false alarms. Check device fit, button sensitivity, and provide additional training if needed.`,
      task_type: "courtesy_call",
      due_date: tomorrow.toISOString(),
      member_id: memberId,
      status: "pending",
    });
  };

  const totalAlerts7d = summary.reduce((s, m) => s + m.count_7d, 0);
  const totalAlerts30d = summary.reduce((s, m) => s + m.count_30d, 0);
  const highFrequencyMembers = summary.filter((m) => m.count_7d >= 5);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {t("falseAlarm.last7Days", "Last 7 Days")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalAlerts7d}</p>
            <p className="text-xs text-muted-foreground">
              {t("falseAlarm.falseAlarms", "false alarms")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {t("falseAlarm.last30Days", "Last 30 Days")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalAlerts30d}</p>
            <p className="text-xs text-muted-foreground">
              {t("falseAlarm.falseAlarms", "false alarms")}
            </p>
          </CardContent>
        </Card>
        <Card className={highFrequencyMembers.length > 0 ? "border-red-500/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              {highFrequencyMembers.length > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
              {t("falseAlarm.highFrequency", "High Frequency")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{highFrequencyMembers.length}</p>
            <p className="text-xs text-muted-foreground">
              {t("falseAlarm.membersNeedAttention", "members need attention (5+ in 7 days)")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Members table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t("falseAlarm.perMember", "False Alarms per Member")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Loading...</p>
          ) : summary.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              {t("falseAlarm.noAlarms", "No false alarms in the last 30 days")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("falseAlarm.member", "Member")}</TableHead>
                  <TableHead>{t("falseAlarm.phone", "Phone")}</TableHead>
                  <TableHead className="text-center">{t("falseAlarm.7d", "7 Days")}</TableHead>
                  <TableHead className="text-center">{t("falseAlarm.30d", "30 Days")}</TableHead>
                  <TableHead className="text-right">{t("falseAlarm.actions", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((m) => (
                  <TableRow key={m.member_id} className={m.count_7d >= 5 ? "bg-red-500/5" : ""}>
                    <TableCell className="font-medium">
                      {m.first_name} {m.last_name}
                      {m.count_7d >= 5 && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          {t("falseAlarm.needsReview", "Needs Review")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {m.phone || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={m.count_7d >= 5 ? "text-red-500 font-bold" : ""}>
                        {m.count_7d}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{m.count_30d}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleScheduleFollowUp(m.member_id, `${m.first_name} ${m.last_name}`)
                        }
                      >
                        <Calendar className="h-3 w-3 mr-1" />
                        {t("falseAlarm.scheduleFollowUp", "Schedule Follow-up")}
                      </Button>
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
