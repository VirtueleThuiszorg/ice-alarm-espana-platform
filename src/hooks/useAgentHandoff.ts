import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface HandoffState {
  isEscalated: boolean;
  isLoading: boolean;
  escalationId: string | null;
}

export function useAgentHandoff() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [state, setState] = useState<HandoffState>({
    isEscalated: false,
    isLoading: false,
    escalationId: null,
  });

  /**
   * Escalate the current AI conversation to a human agent.
   * Updates conversation status and creates an internal ticket for staff.
   */
  const requestHandoff = useCallback(
    async (conversationId: string, reason: string) => {
      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        // 1. Update conversation status to escalated
        const { error: convError } = await supabase
          .from("conversations")
          .update({
            status: "escalated",
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversationId);

        if (convError) throw convError;

        // 2. Create an internal ticket for staff follow-up
        const { data: ticket, error: ticketError } = await supabase
          .from("internal_tickets")
          .insert({
            title: `AI Escalation: ${reason.substring(0, 100)}`,
            description: `A conversation has been escalated from the AI assistant.\n\nReason: ${reason}\nConversation ID: ${conversationId}`,
            category: "ai_escalation" as any,
            priority: "medium",
            status: "open" as any,
            created_by: user?.id ?? "",
            ticket_number: `ESC-${Date.now()}`,
          })
          .select("id")
          .single();

        if (ticketError) throw ticketError;

        // 3. Add a system message to the conversation for context
        await supabase.from("conversation_messages").insert({
          conversation_id: conversationId,
          channel: "chat",
          role: "assistant",
          content: t(
            "chat.escalationMessage",
            "Your conversation has been escalated to a human agent. Someone will be with you shortly."
          ),
        });

        setState({
          isEscalated: true,
          isLoading: false,
          escalationId: ticket?.id || null,
        });

        toast({
          title: t("chat.escalationTitle", "Escalated to agent"),
          description: t(
            "chat.escalationDescription",
            "A human agent will review your conversation shortly."
          ),
        });

        return ticket?.id || null;
      } catch (error: any) {
        console.error("Handoff request failed:", error);
        setState((prev) => ({ ...prev, isLoading: false }));

        toast({
          title: t("chat.escalationErrorTitle", "Escalation failed"),
          description:
            error.message ||
            t(
              "chat.escalationErrorDescription",
              "Could not escalate the conversation. Please try again."
            ),
          variant: "destructive",
        });

        return null;
      }
    },
    [user, toast, t]
  );

  /**
   * Check if a given conversation is currently in an escalated state.
   */
  const checkEscalated = useCallback(
    async (conversationId: string): Promise<boolean> => {
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select("status")
          .eq("id", conversationId)
          .single();

        if (error) throw error;

        const escalated = data?.status === "escalated";
        setState((prev) => ({ ...prev, isEscalated: escalated }));
        return escalated;
      } catch (error) {
        console.error("Failed to check escalation status:", error);
        return false;
      }
    },
    []
  );

  /**
   * Resolve an escalated conversation, marking it as handled by a human agent.
   */
  const resolveHandoff = useCallback(
    async (conversationId: string) => {
      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        // Update conversation status back to open
        const { error: convError } = await supabase
          .from("conversations")
          .update({
            status: "open",
            last_message_at: new Date().toISOString(),
          })
          .eq("id", conversationId);

        if (convError) throw convError;

        // Close the associated internal ticket if we have the ID
        if (state.escalationId) {
          await supabase
            .from("internal_tickets")
            .update({
              status: "closed",
              resolved_at: new Date().toISOString(),
            })
            .eq("id", state.escalationId);
        }

        setState({
          isEscalated: false,
          isLoading: false,
          escalationId: null,
        });

        toast({
          title: t("chat.resolvedTitle", "Escalation resolved"),
          description: t(
            "chat.resolvedDescription",
            "The conversation has been returned to AI handling."
          ),
        });
      } catch (error: any) {
        console.error("Resolve handoff failed:", error);
        setState((prev) => ({ ...prev, isLoading: false }));

        toast({
          title: t("chat.resolveErrorTitle", "Resolution failed"),
          description:
            error.message ||
            t(
              "chat.resolveErrorDescription",
              "Could not resolve the escalation. Please try again."
            ),
          variant: "destructive",
        });
      }
    },
    [state.escalationId, toast, t]
  );

  return {
    isEscalated: state.isEscalated,
    isLoading: state.isLoading,
    escalationId: state.escalationId,
    requestHandoff,
    checkEscalated,
    resolveHandoff,
  };
}
