import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, Plus, Send, MessageSquare, Phone, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  subject: string | null;
  status: string;
  priority: string | null;
  last_message_at: string | null;
  created_at: string;
  assigned_to: string | null;
}

interface Message {
  id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  message_type: string | null;
  is_read: boolean | null;
  created_at: string;
  staff?: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Staff {
  id: string;
  first_name: string;
  last_name: string;
}

interface MessagesTabProps {
  memberId: string;
  memberName: string;
}

export function MessagesTab({ memberId, memberName }: MessagesTabProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
    fetchStaff();
  }, [memberId]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      
      // Set up realtime subscription
      const channel = supabase
        .channel(`messages-${selectedConversation.id}`)
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
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("member_id", memberId)
        .order("last_message_at", { ascending: false });

      if (error) throw error;
      setConversations((data || []) as Conversation[]);
      if (data && data.length > 0 && !selectedConversation) {
        setSelectedConversation(data[0] as Conversation);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast.error("Failed to load conversations");
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
      
      // Fetch staff names for staff messages
      const staffIds = data?.filter(m => m.sender_type === "staff" && m.sender_id).map(m => m.sender_id).filter((x): x is string => x !== null) || [];
      const { data: staffData } = await supabase.from("staff").select("id, first_name, last_name").in("id", staffIds);
      const staffMap = new Map(staffData?.map(s => [s.id, s]) || []);
      setMessages((data?.map(m => ({
        ...m,
        staff: m.sender_type === "staff" && m.sender_id ? staffMap.get(m.sender_id) || null : null
      })) || []) as Message[]);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .eq("is_active", true);

      if (error) throw error;
      setStaffList(data || []);
    } catch (error) {
      console.error("Error fetching staff:", error);
    }
  };

  const createConversation = async () => {
    if (!newSubject.trim() || !newMessage.trim()) {
      toast.error("Please enter a subject and message");
      return;
    }

    setIsSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data: staffData } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", userData.user.id)
        .single();

      // Create conversation
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .insert({
          member_id: memberId,
          subject: newSubject,
          status: "open",
          assigned_to: staffData?.id,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Create first message
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: convData.id,
          sender_type: "staff",
          sender_id: staffData?.id,
          content: newMessage,
          message_type: "text",
        });

      if (msgError) throw msgError;

      toast.success("Conversation created");
      setIsDialogOpen(false);
      setNewSubject("");
      setNewMessage("");
      fetchConversations();
      setSelectedConversation(convData as Conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast.error("Failed to create conversation");
    } finally {
      setIsSending(false);
    }
  };

  const sendReply = async () => {
    if (!replyMessage.trim() || !selectedConversation) return;

    setIsSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data: staffData } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", userData.user.id)
        .single();

      const { error } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.id,
          sender_type: "staff",
          sender_id: staffData?.id,
          content: replyMessage,
          message_type: "text",
        });

      if (error) throw error;

      // Update conversation last_message_at
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", selectedConversation.id);

      // Notify the member about the staff reply
      if (memberId) {
        const { getMemberUserId, createNotification } = await import("@/utils/notifications");
        const memberUserId = await getMemberUserId(memberId);
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
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const updateConversation = async (field: string, value: string) => {
    if (!selectedConversation) return;

    try {
      const { error } = await supabase
        .from("conversations")
        .update({ [field]: value })
        .eq("id", selectedConversation.id);

      if (error) throw error;
      
      setSelectedConversation({ ...selectedConversation, [field]: value });
      fetchConversations();
    } catch (error) {
      console.error("Error updating conversation:", error);
      toast.error("Failed to update conversation");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-blue-500">Open</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "resolved":
        return <Badge className="bg-alert-resolved text-alert-resolved-foreground">Resolved</Badge>;
      case "closed":
        return <Badge variant="outline">Closed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Messages</CardTitle>
          <CardDescription>Conversations with {memberName}</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Conversation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start New Conversation</DialogTitle>
              <DialogDescription>
                Create a new conversation thread with {memberName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject</label>
                <Input
                  placeholder="e.g., Payment inquiry, Device help..."
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea
                  placeholder="Type your message..."
                  className="min-h-[100px]"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createConversation} disabled={isSending}>
                {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Conversation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {conversations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p>No conversations yet</p>
            <p className="text-sm">Start a new conversation with this member</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Conversation List */}
            <div className="lg:col-span-1 border rounded-lg">
              <ScrollArea className="h-[500px]">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                      selectedConversation?.id === conv.id && "bg-muted"
                    )}
                    onClick={() => setSelectedConversation(conv)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {conv.subject || "No subject"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true }) : ""}
                        </p>
                      </div>
                      {getStatusBadge(conv.status)}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </div>

            {/* Conversation Detail */}
            <div className="lg:col-span-2 border rounded-lg flex flex-col">
              {selectedConversation ? (
                <>
                  {/* Header */}
                  <div className="p-4 border-b space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{selectedConversation.subject || "No subject"}</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={selectedConversation.status}
                        onValueChange={(v) => updateConversation("status", v)}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={selectedConversation.priority ?? undefined}
                        onValueChange={(v) => updateConversation("priority", v)}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={selectedConversation.assigned_to || ""}
                        onValueChange={(v) => updateConversation("assigned_to", v)}
                      >
                        <SelectTrigger className="w-[150px] h-8">
                          <SelectValue placeholder="Assign to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {staffList.map((staff) => (
                            <SelectItem key={staff.id} value={staff.id}>
                              {staff.first_name} {staff.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4 h-[300px]">
                    <div className="space-y-4">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            msg.sender_type === "staff" ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg p-3",
                              msg.sender_type === "staff"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            )}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {msg.sender_type === "staff" && msg.staff
                                ? `${msg.staff.first_name} ${msg.staff.last_name} • `
                                : msg.sender_type === "member"
                                ? `${memberName} • `
                                : ""}
                              {format(new Date(msg.created_at), "h:mm a")}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Reply Box */}
                  <div className="p-4 border-t">
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Type a message..."
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        className="min-h-[60px]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendReply();
                          }
                        }}
                      />
                      <Button onClick={sendReply} disabled={isSending || !replyMessage.trim()}>
                        {isSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" onClick={() => toast.info("SMS integration coming soon")}>
                        <MessageSquare className="mr-1 h-3 w-3" />
                        SMS
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toast.info("WhatsApp integration coming soon")}>
                        <MessageSquare className="mr-1 h-3 w-3" />
                        WhatsApp
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toast.info("Email integration coming soon")}>
                        <Mail className="mr-1 h-3 w-3" />
                        Email
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toast.info("Call logging coming soon")}>
                        <Phone className="mr-1 h-3 w-3" />
                        Log Call
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a conversation
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
