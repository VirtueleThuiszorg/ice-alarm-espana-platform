import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface Conversation {
  id: string;
  subject: string | null;
  status: string | null;
  priority: string | null;
  last_message_at: string | null;
  member_id: string | null;
  member?: {
    first_name: string;
    last_name: string;
  } | null;
  unread_count?: number;
  last_message_preview?: string;
}

interface Message {
  id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  message_type: string | null;
  created_at: string | null;
  is_read: boolean | null;
  metadata: unknown;
  read_at: string | null;
  conversation_id: string;
  staff?: {
    first_name: string;
  } | null;
}

export function MessagesPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    fetchCurrentStaff();
    fetchConversations();

    const channel = supabase
      .channel("call-centre-messages")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          if (selectedConversation) {
            fetchMessages(selectedConversation.id);
          }
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const fetchCurrentStaff = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", userData.user.id)
          .single();
        setCurrentStaffId(data?.id || null);
      }
    } catch (error) {
      console.error("Error fetching current staff:", error);
    }
  };

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          *,
          member:members!conversations_member_id_fkey(first_name, last_name)
        `)
        .in("status", ["open", "pending"])
        .order("last_message_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      // Fetch unread counts
      const conversationsWithDetails = await Promise.all(
        (data || []).map(async (conv) => {
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .eq("is_read", false)
            .eq("sender_type", "member");

          const { data: lastMsg } = await supabase
            .from("messages")
            .select("content")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          return {
            ...conv,
            unread_count: count || 0,
            last_message_preview: lastMsg?.content?.substring(0, 40) + "..." || "",
          };
        })
      );

      setConversations(conversationsWithDetails);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Get staff names
      const staffIds = data?.filter(m => m.sender_type === "staff" && m.sender_id).map(m => m.sender_id).filter((x): x is string => x !== null) || [];
      const { data: staffData } = await supabase.from("staff").select("id, first_name").in("id", staffIds);
      const staffMap = new Map(staffData?.map(s => [s.id, { first_name: s.first_name }]) || []);

      setMessages(
        data?.map(m => ({
          ...m,
          staff: m.sender_type === "staff" && m.sender_id ? staffMap.get(m.sender_id) || null : null,
        })) || []
      );

      // Mark as read
      await supabase
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("sender_type", "member")
        .eq("is_read", false);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const sendReply = async () => {
    if (!replyMessage.trim() || !selectedConversation || !currentStaffId) return;

    setIsSending(true);
    try {
      const { error } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.id,
          sender_type: "staff",
          sender_id: currentStaffId,
          content: replyMessage,
          message_type: "text",
        });

      if (error) throw error;

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", selectedConversation.id);

      // Notify the member about the staff reply
      if (selectedConversation.member_id) {
        const { getMemberUserId, createNotification } = await import("@/utils/notifications");
        const memberUserId = await getMemberUserId(selectedConversation.member_id);
        if (memberUserId) {
          createNotification({
            adminUserId: memberUserId,
            eventType: "message",
            message: `New reply from support`,
            entityType: "conversation",
            entityId: selectedConversation.id,
          });
        }
      }

      setReplyMessage("");
      fetchMessages(selectedConversation.id);
      fetchConversations();
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(t("callCentre.messages.failedToSend", "Failed to send message"));
    } finally {
      setIsSending(false);
    }
  };

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.member?.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.member?.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnread = conversations.reduce((acc, conv) => acc + (conv.unread_count || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {t("callCentre.messages.title", "Messages")}
            {totalUnread > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5">
                {totalUnread}
              </Badge>
            )}
          </h3>
          <Link to="/call-centre/messages">
            <Button variant="ghost" size="sm">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <Input
          placeholder={t("callCentre.messages.searchPlaceholder", "Search...")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8"
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <ScrollArea className={cn(
          "border-r transition-all",
          selectedConversation ? "w-1/2" : "w-full"
        )}>
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {t("callCentre.messages.noConversations", "No open conversations")}
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                  selectedConversation?.id === conv.id && "bg-muted",
                  (conv.unread_count || 0) > 0 && "bg-primary/5"
                )}
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="flex items-start gap-2">
                  {(conv.unread_count || 0) > 0 && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm truncate",
                      (conv.unread_count || 0) > 0 && "font-semibold"
                    )}>
                      {conv.member?.first_name} {conv.member?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.subject || t("callCentre.messages.noSubject", "No subject")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true }) : t("callCentre.messages.noMessages", "No messages")}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </ScrollArea>

        {/* Message Detail */}
        {selectedConversation && (
          <div className="flex-1 flex flex-col">
            <div className="p-2 border-b bg-muted/50">
              <p className="text-sm font-medium truncate">
                {selectedConversation.member?.first_name} {selectedConversation.member?.last_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {selectedConversation.subject}
              </p>
            </div>

            <ScrollArea className="flex-1 p-2">
              <div className="space-y-2">
                {messages.filter(m => m.message_type !== "system").map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.sender_type === "staff" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg p-2 text-xs",
                        msg.sender_type === "staff"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-[10px] opacity-70 mt-1 text-right">
                        {msg.created_at ? format(new Date(msg.created_at), "h:mm a") : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-2 border-t">
              <div className="flex gap-2">
                <Textarea
                  placeholder={t("callCentre.messages.replyPlaceholder", "Reply...")}
                  className="min-h-[60px] text-xs resize-none"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                />
              </div>
              <Button
                onClick={sendReply}
                disabled={isSending || !replyMessage.trim()}
                size="sm"
                className="w-full mt-2"
              >
                {isSending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3 w-3" />
                )}
                {t("callCentre.messages.send", "Send")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
