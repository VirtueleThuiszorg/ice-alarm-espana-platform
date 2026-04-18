import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpdateAgent, useUpdateAgentConfig } from "@/hooks/useAIAgents";
import type { AIAgent, AIAgentConfig } from "@/hooks/useAIAgents";

interface AIToolsTabProps {
  agent: AIAgent;
  config: AIAgentConfig;
}

const ALL_READ_PERMISSIONS = ["orders", "members", "partners", "leads", "tickets", "conversations", "alerts", "tasks", "subscriptions", "payments", "products", "faqs", "knowledge_base"];
const ALL_WRITE_PERMISSIONS = ["task_create", "note_create", "whatsapp_notify", "escalate", "chat_reply", "lead_create", "ticket_create", "draft_response", "request_human"];

export function AIToolsTab({ agent, config }: AIToolsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mode, setMode] = useState(agent.mode);
  const [readPerms, setReadPerms] = useState<string[]>(config.read_permissions || []);
  const [writePerms, setWritePerms] = useState<string[]>(config.write_permissions || []);
  const [toolPolicy, setToolPolicy] = useState<Record<string, boolean>>(config.tool_policy || {});
  const updateAgent = useUpdateAgent();
  const updateConfig = useUpdateAgentConfig();

  const toggleReadPerm = (perm: string) => setReadPerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  const toggleWritePerm = (perm: string) => setWritePerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  const toggleToolPolicy = (tool: string) => setToolPolicy(prev => ({ ...prev, [tool]: !prev[tool] }));

  const handleSave = async () => {
    try {
      await updateAgent.mutateAsync({ agentId: agent.id, updates: { mode } });
      await updateConfig.mutateAsync({
        configId: config.id,
        updates: { read_permissions: readPerms, write_permissions: writePerms, tool_policy: toolPolicy }
      });
      toast({ title: t("common.saved", "Saved") });
    } catch {
      toast({ title: t("common.error", "Error"), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("ai.operatingMode", "Operating Mode")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={mode} onValueChange={(v: any) => setMode(v)}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="advise_only">{t("ai.modes.adviseOnly", "Advise Only")}</SelectItem>
              <SelectItem value="draft_only">{t("ai.modes.draftOnly", "Draft Only")}</SelectItem>
              <SelectItem value="auto_act">{t("ai.modes.autoAct", "Auto Act")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("ai.readPermissions", "Read Permissions")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ALL_READ_PERMISSIONS.map(perm => (
            <Badge key={perm} variant={readPerms.includes(perm) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleReadPerm(perm)}>{perm}</Badge>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("ai.writePermissions", "Write Permissions")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {ALL_WRITE_PERMISSIONS.map(perm => (
            <div key={perm} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={writePerms.includes(perm)} onCheckedChange={() => toggleWritePerm(perm)} />
                <Label>{perm}</Label>
              </div>
              {writePerms.includes(perm) && mode === "auto_act" && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">{t("ai.autoExecute", "Auto Execute")}</Label>
                  <Switch checked={!!toolPolicy[perm]} onCheckedChange={() => toggleToolPolicy(perm)} />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />{t("common.save", "Save")}</Button>
    </div>
  );
}
