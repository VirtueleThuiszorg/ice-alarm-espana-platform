import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AIAgent {
  id: string;
  agent_key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  mode: "advise_only" | "draft_only" | "auto_act";
  instance_count: number;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIAgentConfig {
  id: string;
  agent_id: string;
  system_instruction: string;
  business_context: string | null;
  tool_policy: Record<string, boolean>;
  language_policy: Record<string, any>;
  read_permissions: string[];
  write_permissions: string[];
  triggers: string[];
  version: number;
  is_active: boolean;
  created_at: string;
}

export interface AIMemory {
  id: string;
  scope: "global" | "agent" | "conversation";
  scope_id: string | null;
  agent_id: string | null;
  title: string;
  content: string;
  importance: number;
  tags: string[];
  created_at: string;
}

export interface AIRun {
  id: string;
  agent_id: string;
  trigger_event_id: string | null;
  input_context: Record<string, any>;
  output: Record<string, any>;
  model_used: string | null;
  tokens_used: number | null;
  duration_ms: number | null;
  status: "pending" | "running" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
}

export interface AIAction {
  id: string;
  run_id: string;
  action_type: string;
  payload: Record<string, any>;
  status: "proposed" | "approved" | "executed" | "rejected";
  executed_at: string | null;
  executed_by: string | null;
  result: Record<string, any> | null;
  error_message: string | null;
  created_at: string;
}

export interface AIEvent {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, any>;
  processed: boolean;
  processed_at: string | null;
  created_at: string;
}

export interface AgentStats {
  runsLast24h: number;
  actionsLast24h: number;
  escalationsReceived: number;
  activeConversations: number;
  lastRunAt: string | null;
}

export function useAIAgents() {
  return useQuery({
    queryKey: ["ai-agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as AIAgent[];
    },
  });
}

export function useAIAgent(agentKey: string) {
  return useQuery({
    queryKey: ["ai-agent", agentKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("agent_key", agentKey)
        .single();

      if (error) throw error;
      return data as AIAgent;
    },
    enabled: !!agentKey,
    staleTime: 1000 * 60 * 30, // 30 minutes - agent data rarely changes
    gcTime: 1000 * 60 * 60, // 1 hour garbage collection
  });
}

export function useAIAgentConfig(agentId: string | undefined) {
  return useQuery({
    queryKey: ["ai-agent-config", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_configs")
        .select("*")
        .eq("agent_id", agentId!)
        .eq("is_active", true)
        .single();

      if (error) throw error;
      return data as AIAgentConfig;
    },
    enabled: !!agentId,
  });
}

export function useAIAgentStats(agentId: string | undefined) {
  return useQuery({
    queryKey: ["ai-agent-stats", agentId],
    queryFn: async () => {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Get runs count
      const { count: runsCount } = await supabase
        .from("ai_runs")
        .select("*", { count: "exact", head: true })
        .eq("agent_id", agentId!)
        .gte("created_at", last24h);

      // Get actions count
      const { data: runs } = await supabase
        .from("ai_runs")
        .select("id")
        .eq("agent_id", agentId!)
        .gte("created_at", last24h);

      const runIds = runs?.map(r => r.id) || [];
      let actionsCount = 0;
      if (runIds.length > 0) {
        const { count } = await supabase
          .from("ai_actions")
          .select("*", { count: "exact", head: true })
          .in("run_id", runIds);
        actionsCount = count || 0;
      }

      // Get last run
      const { data: lastRun } = await supabase
        .from("ai_runs")
        .select("created_at")
        .eq("agent_id", agentId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Get escalations (events with type conversation.escalated targeting this agent)
      const { count: escalationsCount } = await supabase
        .from("ai_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "conversation.escalated")
        .gte("created_at", last24h);

      return {
        runsLast24h: runsCount || 0,
        actionsLast24h: actionsCount,
        escalationsReceived: escalationsCount || 0,
        activeConversations: 0, // Would need conversation tracking
        lastRunAt: lastRun?.created_at || null,
      } as AgentStats;
    },
    enabled: !!agentId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useAIMemory(agentId: string | undefined, scope?: string) {
  return useQuery({
    queryKey: ["ai-memory", agentId, scope],
    queryFn: async () => {
      let query = supabase
        .from("ai_memory")
        .select("*")
        .order("importance", { ascending: false });

      if (scope === "global") {
        query = query.eq("scope", "global");
      } else if (agentId) {
        query = query.or(`scope.eq.global,and(scope.eq.agent,agent_id.eq.${agentId})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AIMemory[];
    },
    enabled: scope === "global" || !!agentId,
  });
}

export function useAIRuns(agentId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["ai-runs", agentId, limit],
    queryFn: async () => {
      let query = supabase
        .from("ai_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (agentId) {
        query = query.eq("agent_id", agentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AIRun[];
    },
  });
}

export function useAIActions(runId?: string, status?: string) {
  return useQuery({
    queryKey: ["ai-actions", runId, status],
    queryFn: async () => {
      let query = supabase
        .from("ai_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (runId) {
        query = query.eq("run_id", runId);
      }
      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AIAction[];
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, updates }: { agentId: string; updates: Partial<AIAgent> }) => {
      const { data, error } = await supabase
        .from("ai_agents")
        .update(updates)
        .eq("id", agentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agent"] });
    },
  });
}

export function useUpdateAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ configId, updates }: { configId: string; updates: Partial<AIAgentConfig> }) => {
      const { data, error } = await supabase
        .from("ai_agent_configs")
        .update(updates)
        .eq("id", configId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-config"] });
    },
  });
}

export function useCreateMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memory: Omit<AIMemory, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("ai_memory")
        .insert(memory)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-memory"] });
    },
  });
}

export function useUpdateMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memoryId, updates }: { memoryId: string; updates: Partial<AIMemory> }) => {
      const { data, error } = await supabase
        .from("ai_memory")
        .update(updates)
        .eq("id", memoryId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-memory"] });
    },
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memoryId: string) => {
      const { error } = await supabase
        .from("ai_memory")
        .delete()
        .eq("id", memoryId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-memory"] });
    },
  });
}

export function useRunAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentKey, context, simulationMode = false }: { 
      agentKey: string; 
      context?: Record<string, any>;
      simulationMode?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke("ai-run", {
        body: { agentKey, context, simulationMode },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-runs"] });
      queryClient.invalidateQueries({ queryKey: ["ai-actions"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agent-stats"] });
    },
  });
}

export function useApproveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (actionId: string) => {
      // First approve the action
      const { error: updateError } = await supabase
        .from("ai_actions")
        .update({ status: "approved" })
        .eq("id", actionId);

      if (updateError) throw updateError;

      // Then execute it
      const { data, error } = await supabase.functions.invoke("ai-execute-action", {
        body: { actionId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-actions"] });
    },
  });
}

export function useRejectAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (actionId: string) => {
      const { error } = await supabase
        .from("ai_actions")
        .update({ status: "rejected" })
        .eq("id", actionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-actions"] });
    },
  });
}
