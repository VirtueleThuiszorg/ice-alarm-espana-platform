import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, ListTodo, Check, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AIAction {
  id: string;
  action_type: string;
  payload: {
    title?: string;
    reason?: string;
    confidence?: number;
    entity_id?: string;
    entity_type?: string;
  };
  status: string;
  created_at: string;
}

export function AISalesDesk() {
  const queryClient = useQueryClient();

  const { data: aiActions, isLoading } = useQuery({
    queryKey: ["ai-sales-recommendations"],
    queryFn: async () => {
      // Get pending AI actions related to sales
      const { data, error } = await supabase
        .from("ai_actions")
        .select("*")
        .in("status", ["proposed", "pending_approval"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      // Transform data to ensure payload is properly typed
      return (data || []).map(action => ({
        ...action,
        payload: (typeof action.payload === 'object' && action.payload !== null) 
          ? action.payload as AIAction["payload"]
          : {}
      })) as AIAction[];
    },
    refetchInterval: 30000,
  });

  const updateActionMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("ai_actions")
        .update({ status, executed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-sales-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["sales-command-stats"] });
    },
  });

  const handleCreateTask = async (action: AIAction) => {
    // Create an internal ticket from the AI recommendation
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    
    if (!userId) {
      toast.error("User not authenticated");
      return;
    }

    // Get staff ID from user ID
    const { data: staffData } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!staffData) {
      toast.error("Staff record not found");
      return;
    }

    const { error } = await supabase
      .from("internal_tickets")
      .insert({
        title: action.payload.title || "AI Recommended Task",
        description: action.payload.reason || "Follow up on AI recommendation",
        category: "general",
        priority: "normal",
        created_by: staffData.id,
        ticket_number: `TKT-${Date.now()}`,
      });

    if (error) {
      toast.error("Failed to create task");
      return;
    }

    await updateActionMutation.mutateAsync({ id: action.id, status: "executed" });
    toast.success("Task created from AI recommendation");
  };

  const handleMarkDone = async (action: AIAction) => {
    await updateActionMutation.mutateAsync({ id: action.id, status: "completed" });
    toast.success("Marked as done");
  };

  const handleEscalate = async (action: AIAction) => {
    // Create an AI event for main brain escalation
    const eventPayload = {
      source: "sales_desk",
      original_action_id: action.id,
      original_action_type: action.action_type,
    };
    
    const { error } = await supabase.from("ai_events").insert([{
      event_type: "conversation.escalated",
      entity_type: "ai_action",
      entity_id: action.id,
      payload: eventPayload,
    }]);

    if (error) {
      console.error("Failed to escalate:", error);
    }

    await updateActionMutation.mutateAsync({ id: action.id, status: "escalated" });
    toast.success("Escalated to Main Brain");
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return "bg-muted text-muted-foreground";
    if (confidence >= 80) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    if (confidence >= 50) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Sales Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          AI Sales Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {aiActions?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Brain className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No pending recommendations</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI will suggest actions based on sales activity
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {aiActions?.map((action) => (
                <div 
                  key={action.id} 
                  className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {action.payload.title || action.action_type}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {action.payload.reason || "AI-generated recommendation"}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge 
                          variant="outline" 
                          className={getConfidenceColor(action.payload.confidence)}
                        >
                          {action.payload.confidence 
                            ? `${action.payload.confidence}% confidence` 
                            : "No confidence"}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {action.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleCreateTask(action)}
                        disabled={updateActionMutation.isPending}
                      >
                        <ListTodo className="h-3 w-3 mr-1" />
                        Task
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => handleMarkDone(action)}
                        disabled={updateActionMutation.isPending}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Done
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => handleEscalate(action)}
                        disabled={updateActionMutation.isPending}
                      >
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                        Escalate
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
