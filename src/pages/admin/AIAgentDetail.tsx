import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  ArrowLeft, 
  FileText, 
  Settings2, 
  Brain, 
  GraduationCap, 
  Play, 
  History,
  Power,
  PowerOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  useAIAgent, 
  useAIAgentConfig, 
  useUpdateAgent
} from "@/hooks/useAIAgents";
import { AIInstructionsTab } from "@/components/admin/ai/AIInstructionsTab";
import { AIToolsTab } from "@/components/admin/ai/AIToolsTab";
import { AIMemoryTab } from "@/components/admin/ai/AIMemoryTab";
import { AITrainingTab } from "@/components/admin/ai/AITrainingTab";
import { AISimulatorTab } from "@/components/admin/ai/AISimulatorTab";
import { AIAuditTab } from "@/components/admin/ai/AIAuditTab";
import { AIAvatarUpload } from "@/components/admin/ai/AIAvatarUpload";

export default function AIAgentDetail() {
  const { agentKey } = useParams<{ agentKey: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("instructions");

  const { data: agent, isLoading: agentLoading } = useAIAgent(agentKey || "");
  const { data: config, isLoading: configLoading } = useAIAgentConfig(agent?.id);
  const updateAgent = useUpdateAgent();

  const isLoading = agentLoading || configLoading;

  const handleToggleEnabled = async () => {
    if (!agent) return;
    
    try {
      await updateAgent.mutateAsync({
        agentId: agent.id,
        updates: { enabled: !agent.enabled }
      });
      toast({
        title: agent.enabled ? t("ai.agentPaused", "Agent Paused") : t("ai.agentEnabled", "Agent Enabled"),
        description: agent.enabled 
          ? t("ai.agentPausedDescription", "This agent will no longer process events.") 
          : t("ai.agentEnabledDescription", "This agent is now active and processing events."),
      });
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t("ai.toggleError", "Failed to toggle agent status"),
        variant: "destructive",
      });
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case "auto_act": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "draft_only": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "advise_only": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!agent || !config) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("ai.agentNotFound", "Agent not found")}</p>
        <Button variant="link" onClick={() => navigate("/admin/ai")}>
          {t("common.goBack", "Go Back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate("/admin/ai")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <Badge 
                variant="outline" 
                className={agent.enabled ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}
              >
                {agent.enabled ? t("ai.enabled", "Enabled") : t("ai.paused", "Paused")}
              </Badge>
              <Badge variant="outline" className={getModeColor(agent.mode)}>
                {agent.mode.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              {agent.description}
            </p>
          </div>
          <Button
            variant={agent.enabled ? "destructive" : "default"}
            onClick={handleToggleEnabled}
            disabled={updateAgent.isPending}
          >
          {agent.enabled ? (
              <>
                <PowerOff className="h-4 w-4 mr-2" />
                {t("ai.pauseAgent", "Pause Agent")}
              </>
            ) : (
              <>
                <Power className="h-4 w-4 mr-2" />
                {t("ai.enableAgent", "Enable Agent")}
              </>
            )}
          </Button>
        </div>
        
        {/* Avatar Upload Section */}
        <div className="ml-12 p-4 rounded-lg border bg-card">
          <AIAvatarUpload agent={agent} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="instructions" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">{t("ai.tabs.instructions", "Instructions")}</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t("ai.tabs.tools", "Tools & Permissions")}</span>
          </TabsTrigger>
          <TabsTrigger value="memory" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">{t("ai.tabs.memory", "Memory")}</span>
          </TabsTrigger>
          <TabsTrigger value="training" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            <span className="hidden sm:inline">{t("ai.tabs.training", "Training")}</span>
          </TabsTrigger>
          <TabsTrigger value="simulator" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">{t("ai.tabs.simulator", "Run / Simulator")}</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">{t("ai.tabs.audit", "Audit Log")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instructions">
          <AIInstructionsTab agent={agent} config={config} />
        </TabsContent>

        <TabsContent value="tools">
          <AIToolsTab agent={agent} config={config} />
        </TabsContent>

        <TabsContent value="memory">
          <AIMemoryTab agent={agent} />
        </TabsContent>

        <TabsContent value="training">
          <AITrainingTab agent={agent} />
        </TabsContent>

        <TabsContent value="simulator">
          <AISimulatorTab agent={agent} />
        </TabsContent>

        <TabsContent value="audit">
          <AIAuditTab agent={agent} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
