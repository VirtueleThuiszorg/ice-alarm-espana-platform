import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Plus, Send, Ticket, Search, User, Clock, 
  AlertTriangle, HelpCircle, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { useAuth } from "@/contexts/AuthContext";

interface TicketType {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  member_id: string | null;
  created_by: string;
  assigned_to: string | null;
  creator?: { first_name: string; last_name: string };
  assignee?: { first_name: string; last_name: string } | null;
  member?: { id: string; first_name: string; last_name: string; phone: string } | null;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  is_internal: boolean | null;
  staff?: { first_name: string; last_name: string } | null;
}

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

export default function TicketsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<TicketType[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filter, setFilter] = useState("my-tickets");
  const [searchQuery, setSearchQuery] = useState("");
  const [newTicket, setNewTicket] = useState({
    title: "",
    description: "",
    category: "pendant_help",
    priority: "normal",
    memberId: "",
  });
  const [replyMessage, setReplyMessage] = useState("");

  useEffect(() => {
    fetchCurrentStaff();
    fetchMembers();
  }, [user?.id]);

  useEffect(() => {
    if (currentStaffId) {
      fetchTickets();

      const channel = supabase
        .channel("cc-tickets")
        .on("postgres_changes", { event: "*", schema: "public", table: "internal_tickets" }, fetchTickets)
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentStaffId]);

  useEffect(() => {
    filterTickets();
  }, [tickets, filter, searchQuery, currentStaffId]);

  useEffect(() => {
    if (selectedTicket) {
      fetchComments(selectedTicket.id);

      const channel = supabase
        .channel(`cc-ticket-comments-${selectedTicket.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "ticket_comments", filter: `ticket_id=eq.${selectedTicket.id}` },
          () => fetchComments(selectedTicket.id)
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedTicket]);

  const fetchCurrentStaff = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", user.id)
      .single();
    setCurrentStaffId(data?.id || null);
  };

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("internal_tickets")
        .select(`
          *,
          creator:staff!internal_tickets_created_by_fkey(first_name, last_name),
          assignee:staff!internal_tickets_assigned_to_fkey(first_name, last_name),
          member:members(id, first_name, last_name, phone)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast.error(t("tickets.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchComments = async (ticketId: string) => {
    const { data, error } = await supabase
      .from("ticket_comments")
      .select(`*, staff:staff_id(first_name, last_name)`)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching comments:", error);
      return;
    }
    setComments((data || []) as Comment[]);
  };

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("members")
      .select("id, first_name, last_name, phone, email")
      .eq("status", "active")
      .order("last_name");
    setMembers(data || []);
  };

  const filterTickets = () => {
    let filtered = [...tickets];

    switch (filter) {
      case "my-tickets":
        filtered = filtered.filter(t => t.created_by === currentStaffId);
        break;
      case "open":
        filtered = filtered.filter(t => t.status === "open" || t.status === "in_progress");
        break;
      case "resolved":
        filtered = filtered.filter(t => t.status === "resolved" || t.status === "closed");
        break;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        t =>
          t.title.toLowerCase().includes(q) ||
          t.ticket_number.toLowerCase().includes(q) ||
          t.member?.first_name?.toLowerCase().includes(q) ||
          t.member?.last_name?.toLowerCase().includes(q)
      );
    }

    setFilteredTickets(filtered);
  };

  const createTicket = async () => {
    if (!newTicket.title.trim() || !newTicket.description.trim()) {
      toast.error(t("tickets.fillTitleAndDescription"));
      return;
    }

    setIsSending(true);
    try {
      const insertData = {
        title: newTicket.title,
        description: newTicket.description,
        category: newTicket.category,
        priority: newTicket.priority,
        member_id: newTicket.memberId || null,
        created_by: currentStaffId!,
      };
      
      const { error } = await supabase.from("internal_tickets").insert(insertData as any);

      if (error) throw error;

      toast.success(t("tickets.created"));
      setIsDialogOpen(false);
      setNewTicket({ title: "", description: "", category: "pendant_help", priority: "normal", memberId: "" });
      fetchTickets();
    } catch (error) {
      console.error("Error creating ticket:", error);
      toast.error(t("tickets.failedToCreate"));
    } finally {
      setIsSending(false);
    }
  };

  const sendComment = async () => {
    if (!replyMessage.trim() || !selectedTicket) return;

    setIsSending(true);
    try {
      const { error } = await supabase.from("ticket_comments").insert({
        ticket_id: selectedTicket.id,
        staff_id: currentStaffId!,
        content: replyMessage,
      });

      if (error) throw error;

      setReplyMessage("");
      fetchComments(selectedTicket.id);
    } catch (error) {
      console.error("Error sending comment:", error);
      toast.error(t("tickets.failedToComment"));
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-blue-500">{t("tickets.status.open")}</Badge>;
      case "in_progress":
        return <Badge className="bg-orange-500">{t("tickets.status.inProgress")}</Badge>;
      case "pending":
        return <Badge variant="secondary">{t("common.pending")}</Badge>;
      case "resolved":
        return <Badge className="bg-green-600">{t("tickets.status.resolved")}</Badge>;
      case "closed":
        return <Badge variant="outline">{t("tickets.status.closed")}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive">{t("tickets.priority.urgent")}</Badge>;
      case "high":
        return <Badge className="bg-orange-500">{t("tickets.priority.high")}</Badge>;
      default:
        return null;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "pendant_help":
        return t("tickets.category.pendantHelp");
      case "technical_issue":
        return t("tickets.category.technicalIssue");
      case "member_query":
        return t("tickets.category.memberQuery");
      case "billing_question":
        return t("tickets.category.billingQuestion");
      case "general":
        return t("tickets.category.general");
      default:
        return category;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "pendant_help":
        return <HelpCircle className="h-4 w-4" />;
      case "technical_issue":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Ticket className="h-4 w-4" />;
    }
  };

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
            <h1 className="text-2xl font-bold">{t("tickets.title")}</h1>
            <p className="text-muted-foreground">{t("tickets.subtitle")}</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("tickets.newTicket")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("tickets.createTicket")}</DialogTitle>
                <DialogDescription>{t("tickets.createDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("tickets.titleField")} *</label>
                  <Input
                    placeholder={t("tickets.titlePlaceholder")}
                    value={newTicket.title}
                    onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("tickets.category")}</label>
                    <Select value={newTicket.category} onValueChange={(v) => setNewTicket({ ...newTicket, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendant_help">{t("tickets.category.pendantHelp")}</SelectItem>
                        <SelectItem value="technical_issue">{t("tickets.category.technicalIssue")}</SelectItem>
                        <SelectItem value="member_query">{t("tickets.category.memberQuery")}</SelectItem>
                        <SelectItem value="billing_question">{t("tickets.category.billingQuestion")}</SelectItem>
                        <SelectItem value="general">{t("tickets.category.general")}</SelectItem>
                        <SelectItem value="other">{t("tickets.category.other")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("tickets.priorityLabel")}</label>
                    <Select value={newTicket.priority} onValueChange={(v) => setNewTicket({ ...newTicket, priority: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{t("tickets.priority.low")}</SelectItem>
                        <SelectItem value="normal">{t("tickets.priority.normal")}</SelectItem>
                        <SelectItem value="high">{t("tickets.priority.high")}</SelectItem>
                        <SelectItem value="urgent">{t("tickets.priority.urgent")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("tickets.relatedMember")}</label>
                  <Select value={newTicket.memberId} onValueChange={(v) => setNewTicket({ ...newTicket, memberId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("tickets.selectMember")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("tickets.none")}</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.first_name} {m.last_name} - {m.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("common.description")} *</label>
                  <Textarea
                    placeholder={t("tickets.descriptionPlaceholder")}
                    className="min-h-[120px]"
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createTicket} disabled={isSending}>
                  {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("tickets.submit")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Tabs value={filter} onValueChange={setFilter} className="flex-1">
            <TabsList>
              <TabsTrigger value="my-tickets">{t("tickets.myTickets")}</TabsTrigger>
              <TabsTrigger value="all">{t("tickets.allTickets")}</TabsTrigger>
              <TabsTrigger value="open">{t("tickets.status.open")}</TabsTrigger>
              <TabsTrigger value="resolved">{t("tickets.status.resolved")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("tickets.searchPlaceholder")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Ticket List */}
        <div className="w-96 border-r flex flex-col">
          <ScrollArea className="flex-1">
            {filteredTickets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Ticket className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>{t("tickets.noTickets")}</p>
              </div>
            ) : (
              filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className={cn(
                    "p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedTicket?.id === ticket.id && "bg-muted"
                  )}
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(ticket.category)}
                      <span className="text-xs text-muted-foreground font-mono">{ticket.ticket_number}</span>
                    </div>
                    {getStatusBadge(ticket.status)}
                  </div>
                  <p className="font-medium truncate">{ticket.title}</p>
                  {ticket.member && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <User className="h-3 w-3 inline mr-1" />
                      {ticket.member.first_name} {ticket.member.last_name}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {getPriorityBadge(ticket.priority)}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Ticket Detail */}
        <div className="flex-1 flex flex-col">
          {selectedTicket ? (
            <>
              {/* Ticket Header */}
              <div className="p-4 border-b bg-background/50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-muted-foreground font-mono">{selectedTicket.ticket_number}</span>
                      {getStatusBadge(selectedTicket.status)}
                      {getPriorityBadge(selectedTicket.priority)}
                    </div>
                    <h2 className="text-lg font-semibold">{selectedTicket.title}</h2>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span>
                        <User className="h-3 w-3 inline mr-1" />
                        {selectedTicket.creator?.first_name} {selectedTicket.creator?.last_name}
                      </span>
                      <span>
                        <Clock className="h-3 w-3 inline mr-1" />
                        {format(new Date(selectedTicket.created_at), "PPp")}
                      </span>
                      <Badge variant="outline">{getCategoryLabel(selectedTicket.category)}</Badge>
                    </div>
                  </div>
                </div>

                {/* Linked Member Card */}
                {selectedTicket.member && (
                  <Card className="mt-4 bg-muted/50">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {selectedTicket.member.first_name[0]}{selectedTicket.member.last_name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {selectedTicket.member.first_name} {selectedTicket.member.last_name}
                            </p>
                            <p className="text-sm text-muted-foreground">{selectedTicket.member.phone}</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/call-centre/members/${selectedTicket.member.id}`}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            {t("tickets.viewCRM")}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Description & Comments */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {/* Original Description */}
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-muted-foreground mb-2">{t("common.description")}</p>
                      <p className="text-sm whitespace-pre-wrap">{selectedTicket.description}</p>
                    </CardContent>
                  </Card>

                  {/* Comments */}
                  {comments.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-muted-foreground">{t("tickets.comments")}</p>
                      {comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {comment.staff?.first_name?.[0]}{comment.staff?.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {comment.staff?.first_name} {comment.staff?.last_name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(comment.created_at), "PPp")}
                              </span>
                            </div>
                            <p className="text-sm mt-1">{comment.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Reply Box */}
              {selectedTicket.status !== "closed" && (
                <div className="p-4 border-t bg-background/50">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder={t("tickets.addComment")}
                      className="min-h-[80px] resize-none"
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendComment();
                        }
                      }}
                    />
                    <Button
                      onClick={sendComment}
                      disabled={isSending || !replyMessage.trim()}
                      className="self-end"
                    >
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Ticket className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">{t("tickets.selectTicket")}</p>
                <p className="text-sm">{t("tickets.selectTicketDesc")}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
