import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InboundEmail {
  id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body_snippet: string | null;
  body_html: string | null;
  provider_message_id: string | null;
  provider_thread_id: string | null;
  received_at: string;
  module_matched: string | null;
  linked_entity_id: string | null;
  linked_entity_type: string | null;
  is_reply: boolean | null;
  original_email_log_id: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface UseInboundEmailsOptions {
  module?: string;
  linkedEntityId?: string;
  limit?: number;
}

export function useInboundEmails(options: UseInboundEmailsOptions = {}) {
  const { module, linkedEntityId, limit = 50 } = options;

  return useQuery({
    queryKey: ["inbound-emails", module, linkedEntityId, limit],
    queryFn: async (): Promise<InboundEmail[]> => {
      let query = supabase
        .from("inbound_email_log")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(limit);

      if (module) {
        query = query.eq("module_matched", module);
      }

      if (linkedEntityId) {
        query = query.eq("linked_entity_id", linkedEntityId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    },
    refetchOnWindowFocus: false,
  });
}

export function useOutreachInbox() {
  return useInboundEmails({ module: "outreach" });
}
