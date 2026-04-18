import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createNotification, getMemberUserId } from "@/utils/notifications";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Loader2, Plus, Send, MessageSquare, Search,
  Phone, Mail, ExternalLink, StickyNote, Users, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  subject: string | null;
  status: string;
  priority: string | null;
  last_message_at: string | null;
  created_at: string;
  assigned_to: string | null;
  conversation_type: "member" | "staff" | "internal";
  member_id: string | null;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  } | null;
  staff_participants?: string[];
  participants_info?: {
    id: string;
    first_name: string;
    last_name: string;
  }[];
  assigned_staff?: {
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

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export default function CallCentreMessagesPage() {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [newConversation, setNewConversation] = useState({
    type: "member" as "member" | "staff",
    memberId: "",
    staffParticipants: [] as string[],
    subject: "",
    message: "",
    priority: "normal",
  });
  const [replyMessage, setReplyMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCurrentStaff();
    fetchConversations();
    fetchStaff();
    fetchMembers();

    const conversationChannel = supabase
      .channel("cc-conversations-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationChannel);
    };
  }, []);

  useEffect(() => {
    filterConversations();
  }, [conversations, filter, searchQuery, currentStaffId]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      markMessagesAsRead(selectedConversation.id);

      const messageChannel = supabase
        .channel(`cc-messages-${selectedConversation.id}`)
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
            markMessagesAsRead(selectedConversation.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(messageChannel);
      };
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .select(`*, member:members!conversations_member_id_fkey(id, first_name, last_name, email, phone)`)
        .order("last_message_at", { ascending: false });

      if (convError) throw convError;

      const assignedStaffIds = convData?.filter(c => c.assigned_to).map(c => c.assigned_to).filter((x): x is string => x !== null) || [];
      const { data: staffData } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .in("id", assignedStaffIds);

      const staffMap = new Map(staffData?.map(s => [s.id, s]) || []);

      // Fetch staff participants info for staff conversations
      const staffConvs = convData?.filter(c => c.conversation_type === "staff") || [];
      const allParticipantIds = staffConvs.flatMap(c => (c.staff_participants as string[] || []));
      const { data: participantsData } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .in("id", allParticipantIds);
      const participantsMap = new Map(participantsData?.map(s => [s.id, s]) || []);

      const conversationsWithDetails = await Promise.all(
        (convData || []).map(async (conv) => {
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .eq("is_read", false)
            .neq("sender_type", "staff");

          const { data: lastMsg } = await supabase
            .from("messages")
            .select("content")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          return {
            ...conv,
            conversation_type: (conv.conversation_type || "member") as "member" | "staff" | "internal",
            assigned_staff: conv.assigned_to ? staffMap.get(conv.assigned_to) || null : null,
            participants_info: conv.conversation_type === "staff"
              ? (conv.staff_participants || []).map((id: string) => participantsMap.get(id)).filter(Boolean)
              : undefined,
            unread_count: count || 0,
            last_message_preview: lastMsg?.content?.substring(0, 60) + (lastMsg?.content && lastMsg.content.length > 60 ? "..." : "") || "",
          };
        })
      );

      setConversations(conversationsWithDetails as Conversation[]);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast.error("Failed to load conversations");
    } finally {
      setIsLoading(false);
    }
  };

  const filterConversations = () => {
    let filtered = [...conversations];

    switch (filter) {
      case "unread":
        filtered = filtered.filter(c => (c.unread_count || 0) > 0);
        break;
      case "mine":
        filtered = filtered.filter(c => c.assigned_to === currentStaffId || (c.staff_participants || []).includes(currentStaffId || ""));
        break;
      case "unassigned":
        filtered = filtered.filter(c => !c.assigned_to && c.conversation_type === "member");
        break;
      case "resolved":
        filtered = filtered.filter(c => c.status === "resolved" || c.status === "closed");
        break;
      case "staff":
        filtered = filtered.filter(c => c.conversation_type === "staff");
        break;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.member?.first_name?.toLowerCase().includes(query) ||
          c.member?.last_name?.toLowerCase().includes(query) ||
          c.subject?.toLowerCase().includes(query) ||
          c.last_message_preview?.toLowerCase().includes(query)
      );
    }

    setFilteredConversations(filtered);
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const staffIds = data?.filter(m => m.sender_type === "staff" && m.sender_id).map(m => m.sender_id).filter((x): x is string => x !== null) || [];
      const { data: staffData } = await supabase.from("staff").select("id, first_name, last_name").in("id", staffIds);
      const staffMap = new Map(staffData?.map(s => [s.id, s]) || []);

      setMessages(
        (data?.map(m => ({
          ...m,
          staff: m.sender_type === "staff" && m.sender_id ? staffMap.get(m.sender_id) || null : null,
        })) || []) as Message[]
      );
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const markMessagesAsRead = async (conversationId: string) => {
    try {
      await supabase
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("sender_type", "member")
        .eq("is_read", false);
    } catch (error) {
      console.error("Error marking messages as read:", error);
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

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, email, phone")
        .eq("status", "active")
        .order("last_name");

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  const createConversation = async () => {
    const isStaffConversation = newConversation.type === "staff";

    // Validation
    if (isStaffConversation && newConversation.staffParticipants.length === 0) {
      toast.error("Please select at least one staff member");
      return;
    }
    if (!isStaffConversation && !newConversation.memberId) {
      toast.error("Please select a member");
      return;
    }
    if (!newConversation.subject.trim() || !newConversation.message.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSending(true);
    try {
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .insert({
          member_id: isStaffConversation ? null : newConversation.memberId,
          staff_participants: isStaffConversation
            ? [...newConversation.staffParticipants, currentStaffId].filter((s): s is string => s != null)
            : [],
          conversation_type: isStaffConversation ? "staff" : "member",
          subject: newConversation.subject,
          status: "open",
          priority: newConversation.priority,
          assigned_to: currentStaffId,
        })
        .select()
        .single();

      if (convError) throw convError;

      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: convData.id,
          sender_type: "staff",
          sender_id: currentStaffId,
          content: newConversation.message,
          message_type: "text",
        });

      if (msgError) throw msgError;

      toast.success("Conversation created");
      setIsDialogOpen(false);
      setNewConversation({ type: "member", memberId: "", staffParticipants: [], subject: "", message: "", priority: "normal" });
      fetchConversations();
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
      const { error } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.id,
          sender_type: isInternalNote ? "system" : "staff",
          sender_id: currentStaffId,
          content: isInternalNote ? `[Internal Note] ${replyMessage}` : replyMessage,
          message_type: isInternalNote ? "system" : "text",
        });

      if (error) throw error;

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", selectedConversation.id);

      // Notify the member if this is a member conversation and not an internal note
      if (!isInternalNote && selectedConversation.member_id) {
        const memberUserId = await getMemberUserId(selectedConversation.member_id);
        if (memberUserId) {
          createNotification({
            adminUserId: memberUserId,
            eventType: "message",
            message: `New reply from support: ${selectedConversation.subject || "Your conversation"}`,
            entityType: "conversation",
            entityId: selectedConversation.id,
          });
        }
      }

      setReplyMessage("");
      setIsInternalNote(false);
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
        return <Badge className="bg-green-600">Resolved</Badge>;
      case "closed":
        return <Badge variant="outline">Closed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive">Urgent</Badge>;
      case "high":
        return <Badge className="bg-orange-500">High</Badge>;
      case "normal":
        return null;
      case "low":
        return <Badge variant="outline">Low</Badge>;
      default:
        return null;
    }
  };

  const unreadCount = conversations.filter(c => (c.unread_count || 0) > 0).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-background/50">
        <div className="flex items-center justify-between mb-4">
          <div>
           <h1 className="text-2xl font-bold">{t("callCentreMessages.title", "Messages")}</h1>
           <p className="text-muted-foreground">{t("callCentreMessages.subtitle", "Manage member conversations")}</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Conversation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Start New Conversation</DialogTitle>
                <DialogDescription>Create a new conversation with a member or staff</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Conversation Type Selector */}
                <Tabs value={newConversation.type} onValueChange={(v) => setNewConversation({ ...newConversation, type: v as "member" | "staff", memberId: "", staffParticipants: [] })}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="member" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Member
                    </TabsTrigger>
                    <TabsTrigger value="staff" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Staff
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Member Selection */}
                {newConversation.type === "member" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Member</label>
                    <Select
                      value={newConversation.memberId}
                      onValueChange={(v) => setNewConversation({ ...newConversation, memberId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a member..." />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.first_name} {member.last_name} - {member.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Staff Selection (Multi-select) */}
                {newConversation.type === "staff" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Staff Member(s)</label>
                    <div className="border rounded-md max-h-[200px] overflow-auto">
                      {staffList.filter(s => s.id !== currentStaffId).map((staff) => (
                        <label
                          key={staff.id}
                          className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                        >
                          <Checkbox
                            checked={newConversation.staffParticipants.includes(staff.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setNewConversation({
                                  ...newConversation,
                                  staffParticipants: [...newConversation.staffParticipants, staff.id]
                                });
                              } else {
                                setNewConversation({
                                  ...newConversation,
                                  staffParticipants: newConversation.staffParticipants.filter(id => id !== staff.id)
                                });
                              }
                            }}
                          />
                          <span className="text-sm">{staff.first_name} {staff.last_name}</span>
                        </label>
                      ))}
                      {staffList.filter(s => s.id !== currentStaffId).length === 0 && (
                        <p className="p-3 text-sm text-muted-foreground">No other staff members available</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    placeholder={newConversation.type === "staff" ? "e.g., Shift handover, Escalation..." : "e.g., Payment inquiry, Device help..."}
                    value={newConversation.subject}
                    onChange={(e) => setNewConversation({ ...newConversation, subject: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    value={newConversation.priority}
                    onValueChange={(v) => setNewConversation({ ...newConversation, priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    placeholder="Type your message..."
                    className="min-h-[100px]"
                    value={newConversation.message}
                    onChange={(e) => setNewConversation({ ...newConversation, message: e.target.value })}
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
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Tabs value={filter} onValueChange={setFilter} className="flex-1">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread" className="flex items-center gap-1">
                Unread
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="mine">Assigned to Me</TabsTrigger>
              <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
              <TabsTrigger value="staff" className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Staff
              </TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation List */}
        <div className="w-80 border-r flex flex-col">
          <ScrollArea className="flex-1">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No conversations found</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedConversation?.id === conv.id && "bg-muted"
                  )}
                  onClick={() => setSelectedConversation(conv)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {(conv.unread_count || 0) > 0 && (
                          <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                        {conv.conversation_type === "staff" ? (
                          <>
                            <Users className="h-4 w-4 text-blue-500 shrink-0" />
                            <span className="font-medium truncate">
                              {conv.participants_info?.map(p => p.first_name).join(", ") || "Staff Chat"}
                            </span>
                            <Badge variant="outline" className="text-xs shrink-0">Staff</Badge>
                          </>
                        ) : (
                          <span className="font-medium truncate">
                            {conv.member?.first_name} {conv.member?.last_name}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{conv.subject || "No subject"}</p>
                      <p className="text-xs text-muted-foreground truncate mt-1">{conv.last_message_preview}</p>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                      {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true }) : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {getStatusBadge(conv.status)}
                    {getPriorityBadge(conv.priority)}
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Conversation Detail */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="p-4 border-b bg-background/50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">
                        {selectedConversation.member?.first_name} {selectedConversation.member?.last_name}
                      </h2>
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/call-centre/members/${selectedConversation.member_id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedConversation.subject || "No subject"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`tel:${selectedConversation.member?.phone}`}>
                      <Button variant="outline" size="icon">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </a>
                    <a href={`mailto:${selectedConversation.member?.email}`}>
                      <Button variant="outline" size="icon">
                        <Mail className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <Select
                    value={selectedConversation.status}
                    onValueChange={(v) => updateConversation("status", v)}
                  >
                    <SelectTrigger className="w-32">
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
                    value={selectedConversation.priority || "normal"}
                    onValueChange={(v) => updateConversation("priority", v)}
                  >
                    <SelectTrigger className="w-32">
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
                    value={selectedConversation.assigned_to || "unassigned"}
                    onValueChange={(v) => updateConversation("assigned_to", v === "unassigned" ? "" : v)}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
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
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.filter(m => m.message_type !== "system" || m.content.startsWith("[Internal Note]")).map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.sender_type === "member" ? "justify-start" : "justify-end"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg p-3",
                          msg.sender_type === "member"
                            ? "bg-muted"
                            : msg.message_type === "system"
                            ? "bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
                        {msg.message_type === "system" && (
                          <div className="flex items-center gap-1 mb-1">
                            <StickyNote className="h-3 w-3" />
                            <span className="text-xs font-medium">Internal Note</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">
                          {msg.content.replace("[Internal Note] ", "")}
                        </p>
                        <div className="flex items-center justify-end gap-2 mt-1">
                          {msg.sender_type === "staff" && msg.staff && (
                            <span className="text-xs opacity-70">
                              {msg.staff.first_name}
                            </span>
                          )}
                          <span className="text-xs opacity-70">
                            {format(new Date(msg.created_at), "HH:mm")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply Box */}
              <div className="p-4 border-t bg-background/50">
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    variant={isInternalNote ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setIsInternalNote(!isInternalNote)}
                  >
                    <StickyNote className="h-4 w-4 mr-1" />
                    Internal Note
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder={isInternalNote ? "Add an internal note..." : "Type your reply..."}
                    className={cn(
                      "min-h-[80px] resize-none",
                      isInternalNote && "border-yellow-400 focus-visible:ring-yellow-400"
                    )}
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
                    className="self-end"
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm">Choose a conversation from the list to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
