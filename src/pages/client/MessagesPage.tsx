import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createNotification } from "@/utils/notifications";
import {
  Loader2, Plus, Send, MessageSquare, ArrowLeft,
  CheckCheck, Clock, Inbox, PenLine
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  subject: string | null;
  status: string;
  last_message_at: string | null;
  created_at: string;
  last_message_preview?: string;
  has_unread?: boolean;
}

interface Message {
  id: string;
  sender_type: string;
  content: string;
  message_type: string | null;
  is_read: boolean | null;
  created_at: string;
  staff_name?: string;
}

export default function MessagesPage() {
  const { t } = useTranslation();
  const { memberId, isLoading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const unreadCount = conversations.filter(c => c.has_unread).length;

  useEffect(() => {
    if (authLoading) return;
    
    if (memberId) {
      fetchConversations();

      const channel = supabase
        .channel("client-conversations")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `member_id=eq.${memberId}`,
          },
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setIsLoading(false);
    }
  }, [memberId, authLoading]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);

      const channel = supabase
        .channel(`client-messages-${selectedConversation.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${selectedConversation.id}`,
          },
          () => {
            fetchMessages(selectedConversation.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = async () => {
    if (!memberId) return;

    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("member_id", memberId)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      const conversationsWithDetails = await Promise.all(
        (data || []).map(async (conv) => {
          try {
            const { data: lastMsg } = await supabase
              .from("messages")
              .select("content, is_read, sender_type")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            const { count } = await supabase
              .from("messages")
              .select("*", { count: "exact", head: true })
              .eq("conversation_id", conv.id)
              .eq("is_read", false)
              .eq("sender_type", "staff");

            return {
              ...conv,
              last_message_preview: lastMsg?.content?.substring(0, 80) + (lastMsg?.content && lastMsg.content.length > 80 ? "..." : "") || "",
              has_unread: (count || 0) > 0,
            };
          } catch {
            return { ...conv, last_message_preview: "", has_unread: false };
          }
        })
      );

      setConversations(conversationsWithDetails as Conversation[]);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast.error(t("messages.failedToLoad"));
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

      await supabase
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("sender_type", "staff")
        .eq("is_read", false);

      const staffIds = data?.filter(m => m.sender_type === "staff" && m.sender_id).map(m => m.sender_id).filter((x): x is string => x !== null) || [];
      const { data: staffData } = await supabase.from("staff").select("id, first_name").in("id", staffIds);
      const staffMap = new Map(staffData?.map(s => [s.id, s.first_name]) || []);

      setMessages(
        (data?.map(m => ({
          ...m,
          staff_name: m.sender_type === "staff" && m.sender_id ? staffMap.get(m.sender_id) || t("support.support") : undefined,
        })) || []) as Message[]
      );

      fetchConversations();
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const createConversation = async () => {
    if (!newSubject.trim() || !newMessage.trim() || !memberId) {
      toast.error(t("messages.enterSubjectAndMessage"));
      return;
    }

    setIsSending(true);
    try {
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .insert({
          member_id: memberId,
          subject: newSubject,
          status: "open",
        })
        .select()
        .single();

      if (convError) throw convError;

      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: convData.id,
          sender_type: "member",
          sender_id: memberId,
          content: newMessage,
          message_type: "text",
        });

      if (msgError) throw msgError;

      // Notify all staff about new member message
      createNotification({
        adminUserId: null,
        eventType: "message",
        message: `New message from member: ${newSubject}`,
        entityType: "conversation",
        entityId: convData.id,
      });

      toast.success(t("messages.messageSent"));
      setIsDialogOpen(false);
      setNewSubject("");
      setNewMessage("");
      fetchConversations();
      setSelectedConversation(convData as Conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast.error(t("messages.failedToSend"));
    } finally {
      setIsSending(false);
    }
  };

  const sendReply = async () => {
    if (!replyMessage.trim() || !selectedConversation || !memberId) return;

    setIsSending(true);
    try {
      const { error } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.id,
          sender_type: "member",
          sender_id: memberId,
          content: replyMessage,
          message_type: "text",
        });

      if (error) throw error;

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", selectedConversation.id);

      // Notify all staff about member reply
      createNotification({
        adminUserId: null,
        eventType: "message",
        message: `Member replied in: ${selectedConversation.subject || "Conversation"}`,
        entityType: "conversation",
        entityId: selectedConversation.id,
      });

      setReplyMessage("");
      fetchMessages(selectedConversation.id);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(t("messages.failedToSend"));
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-blue-500">{t("support.status.open")}</Badge>;
      case "pending":
        return <Badge variant="secondary">{t("common.pending")}</Badge>;
      case "resolved":
        return <Badge className="bg-alert-resolved">{t("support.status.resolved")}</Badge>;
      case "closed":
        return <Badge variant="outline">{t("support.status.closed")}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Conversation detail view
  if (selectedConversation) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Button
          variant="ghost"
          onClick={() => setSelectedConversation(null)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("messages.backToMessages")}
        </Button>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{selectedConversation.subject || t("messages.conversation")}</CardTitle>
                <CardDescription>
                  {t("messages.started")} {formatDistanceToNow(new Date(selectedConversation.created_at), { addSuffix: true })}
                </CardDescription>
              </div>
              {getStatusBadge(selectedConversation.status)}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px] p-4">
              <div className="space-y-4">
                {messages.filter(m => m.message_type !== "system").map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.sender_type === "member" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-3",
                        msg.sender_type === "member"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className="flex items-center justify-end gap-2 mt-1 text-xs opacity-70">
                        <span>
                          {msg.sender_type === "staff" && msg.staff_name
                            ? `${msg.staff_name} • `
                            : msg.sender_type === "member"
                            ? `${t("messages.you")} • `
                            : ""}
                          {format(new Date(msg.created_at), "h:mm a")}
                        </span>
                        {msg.sender_type === "member" && msg.is_read && (
                          <CheckCheck className="h-3 w-3" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Textarea
                  placeholder={t("messages.typeMessage")}
                  className="min-h-[60px] resize-none flex-1"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                />
                <Button
                  onClick={sendReply}
                  disabled={isSending || !replyMessage.trim()}
                  size="icon"
                  className="h-auto aspect-square"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Conversation list view
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("messages.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("messages.subtitle")}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("messages.newMessage")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("messages.sendMessage")}</DialogTitle>
              <DialogDescription>
                {t("messages.teamWillRespond")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("messages.subject")}</label>
                <Input
                  placeholder={t("messages.subjectPlaceholder")}
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("messages.message")}</label>
                <Textarea
                  placeholder={t("messages.messagePlaceholder")}
                  className="min-h-[120px]"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createConversation} disabled={isSending} className="w-full">
                {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("messages.sendMessage")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Unread indicator */}
      {unreadCount > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{t("messages.unreadMessages", { count: unreadCount })}</p>
              <p className="text-sm text-muted-foreground">{t("messages.clickToRead")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversations List */}
      {conversations.length === 0 ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <div className="h-20 w-20 mx-auto bg-muted rounded-full flex items-center justify-center mb-6">
              <MessageSquare className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-xl mb-2">{t("messages.noMessages")}</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t("messages.noMessagesDesc")}
            </p>
            <Button className="mt-6" onClick={() => setIsDialogOpen(true)}>
              <PenLine className="mr-2 h-4 w-4" />
              {t("messages.sendFirstMessage")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className={cn(
                "cursor-pointer hover:bg-muted/50 transition-colors",
                conv.has_unread && "border-primary bg-primary/5"
              )}
              onClick={() => setSelectedConversation(conv)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {conv.has_unread && (
                        <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                      )}
                      <h3 className={cn(
                        "font-medium truncate",
                        conv.has_unread && "font-semibold"
                      )}>
                        {conv.subject || t("messages.conversation")}
                      </h3>
                    </div>
                    {conv.last_message_preview && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {conv.last_message_preview}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {getStatusBadge(conv.status)}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true }) : ""}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}