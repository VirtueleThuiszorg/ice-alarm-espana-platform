import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Users, CheckCircle, Mail, MessageSquare, UserCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function OutreachAnalyticsTab() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    leadsDiscovered: 0,
    leadsQualified: 0,
    emailsSent: 0,
    repliesReceived: 0,
    conversions: 0,
  });
  const [runLogs, setRunLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        // Load metrics
        const [rawCount, crmCount, sentCount, repliesCount, convertedCount] = await Promise.all([
          supabase.from("outreach_raw_leads").select("id", { count: "exact", head: true }),
          supabase.from("outreach_crm_leads").select("id", { count: "exact", head: true }),
          supabase.from("outreach_email_drafts").select("id", { count: "exact", head: true }).eq("status", "sent"),
          supabase.from("outreach_email_threads").select("id", { count: "exact", head: true }).eq("direction", "inbound"),
          supabase.from("outreach_crm_leads").select("id", { count: "exact", head: true }).eq("status", "converted"),
        ]);

        setStats({
          leadsDiscovered: rawCount.count || 0,
          leadsQualified: crmCount.count || 0,
          emailsSent: sentCount.count || 0,
          repliesReceived: repliesCount.count || 0,
          conversions: convertedCount.count || 0,
        });

        // Load recent run logs
        const { data: logs } = await supabase
          .from("outreach_run_logs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(10);
        setRunLogs(logs || []);
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  const metrics = [
    { key: "leadsDiscovered", icon: Users, value: stats.leadsDiscovered, color: "text-blue-500" },
    { key: "leadsQualified", icon: CheckCircle, value: stats.leadsQualified, color: "text-green-500" },
    { key: "emailsSent", icon: Mail, value: stats.emailsSent, color: "text-yellow-500" },
    { key: "repliesReceived", icon: MessageSquare, value: stats.repliesReceived, color: "text-orange-500" },
    { key: "conversions", icon: UserCheck, value: stats.conversions, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>{t("outreach.analytics.title")}</CardTitle>
              <CardDescription>{t("outreach.analytics.subtitle")}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {metrics.map(({ key, icon: Icon, value, color }) => (
          <Card key={key}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`${color}`}>
                  <Icon className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{isLoading ? "—" : value}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(`outreach.analytics.metrics.${key}`)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Pipeline Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("outreach.analytics.recentRuns")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("outreach.analytics.runType")}</TableHead>
                <TableHead>{t("outreach.analytics.startedAt")}</TableHead>
                <TableHead>{t("outreach.analytics.totals")}</TableHead>
                <TableHead>{t("outreach.analytics.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                    {t("outreach.analytics.noRuns")}
                  </TableCell>
                </TableRow>
              ) : (
                runLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="capitalize text-sm font-medium">{log.run_type}</TableCell>
                    <TableCell className="text-sm">{new Date(log.started_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">
                      {log.totals && (
                        <span className="text-xs">
                          {`Enriched: ${log.totals.enriched || 0}, Rated: ${log.totals.rated || 0}, Sent: ${log.totals.sent || 0}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.dry_run ? (
                        <Badge variant="outline" className="text-xs">
                          {t("outreach.analytics.dryRun")}
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-xs">
                          {t("outreach.analytics.live")}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
