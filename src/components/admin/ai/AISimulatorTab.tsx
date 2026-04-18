import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useRunAgent } from "@/hooks/useAIAgents";
import type { AIAgent } from "@/hooks/useAIAgents";

interface AISimulatorTabProps { agent: AIAgent; }

export function AISimulatorTab({ agent }: AISimulatorTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [context, setContext] = useState('{\n  "test": true\n}');
  const [result, setResult] = useState<any>(null);
  const runAgent = useRunAgent();

  const handleRun = async () => {
    try {
      const parsed = JSON.parse(context);
      const res = await runAgent.mutateAsync({ agentKey: agent.agent_key, context: parsed, simulationMode: true });
      setResult(res);
      toast({ title: t("ai.simulationComplete", "Simulation completed") });
    } catch (e) {
      toast({ title: t("common.error", "Error"), description: e instanceof Error ? e.message : "Invalid JSON", variant: "destructive" });
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("ai.inputContext", "Input Context")}</CardTitle>
          <CardDescription>{t("ai.inputContextDesc", "Provide JSON context to simulate an agent run.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={context} onChange={e => setContext(e.target.value)} rows={12} className="font-mono text-sm" />
          <Button onClick={handleRun} disabled={runAgent.isPending}>
            {runAgent.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {t("ai.runSimulation", "Run Simulation")}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("ai.output", "Output")}</CardTitle></CardHeader>
        <CardContent>
          {result ? (
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">{JSON.stringify(result, null, 2)}</pre>
          ) : (
            <p className="text-muted-foreground text-sm">{t("ai.noOutputYet", "Run a simulation to see the output here.")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
