import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAIRuns, useAIActions } from "@/hooks/useAIAgents";
import type { AIAgent } from "@/hooks/useAIAgents";

interface AIAuditTabProps { agent: AIAgent; }

export function AIAuditTab({ agent }: AIAuditTabProps) {
  const { t } = useTranslation();
  const { data: runs, isLoading } = useAIRuns(agent.id, 20);
  const { data: actions } = useAIActions();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": case "executed": return "bg-green-500/10 text-green-500";
      case "failed": case "rejected": return "bg-red-500/10 text-red-500";
      case "running": case "approved": return "bg-blue-500/10 text-blue-500";
      default: return "bg-yellow-500/10 text-yellow-500";
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{t("ai.recentRuns", "Recent Runs")}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p>{t("common.loading", "Loading...")}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ai.time", "Time")}</TableHead>
                  <TableHead>{t("ai.status", "Status")}</TableHead>
                  <TableHead>{t("ai.tokens", "Tokens")}</TableHead>
                  <TableHead>{t("ai.duration", "Duration")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs?.map(run => (
                  <TableRow key={run.id}>
                    <TableCell className="text-sm">{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</TableCell>
                    <TableCell><Badge className={getStatusColor(run.status)}>{run.status}</Badge></TableCell>
                    <TableCell>{run.tokens_used || "-"}</TableCell>
                    <TableCell>{run.duration_ms ? `${run.duration_ms}ms` : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("ai.recentActions", "Recent Actions")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ai.time", "Time")}</TableHead>
                <TableHead>{t("ai.actionType", "Action Type")}</TableHead>
                <TableHead>{t("ai.status", "Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions?.slice(0, 10).map(action => (
                <TableRow key={action.id}>
                  <TableCell className="text-sm">{formatDistanceToNow(new Date(action.created_at), { addSuffix: true })}</TableCell>
                  <TableCell><Badge variant="outline">{action.action_type}</Badge></TableCell>
                  <TableCell><Badge className={getStatusColor(action.status)}>{action.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
