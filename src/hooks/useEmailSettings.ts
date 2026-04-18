import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

export interface EmailSettings {
  id: string;
  provider: 'resend' | 'gmail';
  from_name: string | null;
  from_email: string | null;
  reply_to_email: string | null;
  signature_html: string | null;
  daily_send_limit: number;
  hourly_send_limit: number;
  enable_member_emails: boolean;
  enable_outreach_emails: boolean;
  enable_system_emails: boolean;
  gmail_connected: boolean;
  gmail_connected_email: string | null;
  gmail_last_sync_at: string | null;
  gmail_mode: 'smtp' | 'oauth';
  gmail_smtp_host: string | null;
  gmail_smtp_port: number;
  gmail_smtp_user: string | null;
  gmail_smtp_password_secret_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailSettingsUpdate {
  provider?: 'resend' | 'gmail';
  from_name?: string | null;
  from_email?: string | null;
  reply_to_email?: string | null;
  signature_html?: string | null;
  daily_send_limit?: number;
  hourly_send_limit?: number;
  enable_member_emails?: boolean;
  enable_outreach_emails?: boolean;
  enable_system_emails?: boolean;
  gmail_mode?: 'smtp' | 'oauth';
  gmail_smtp_host?: string;
  gmail_smtp_port?: number;
  gmail_smtp_user?: string;
}

export function useEmailSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async (): Promise<EmailSettings | null> => {
      const { data, error } = await supabase
        .from("email_settings")
        .select("*")
        .eq("id", SINGLETON_ID)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No row found - shouldn't happen with singleton
          return null;
        }
        throw error;
      }

      return data as EmailSettings;
    },
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: EmailSettingsUpdate) => {
      const { data, error } = await supabase
        .from("email_settings")
        .update(updates)
        .eq("id", SINGLETON_ID)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
      toast({
        title: "Email settings saved",
        description: "Your email configuration has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: async (toEmail: string) => {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { to: toEmail },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Test email sent",
        description: "Check your inbox for the test email.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send test email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    settings,
    isLoading,
    error,
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    sendTestEmail: sendTestEmailMutation.mutate,
    isSendingTest: sendTestEmailMutation.isPending,
  };
}
