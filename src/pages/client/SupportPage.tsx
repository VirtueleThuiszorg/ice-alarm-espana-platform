import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  Phone, 
  MessageCircle, 
  Smartphone, 
  Loader2,
  Send,
  HelpCircle,
  Bot,
  Headphones,
  Plus,
  ArrowLeft,
  CheckCheck,
  Clock,
  Shield,
  Heart,
  Users,
  Search,
  CreditCard,
  User,
  BookOpen
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { InlineAIChat } from "@/components/chat/InlineAIChat";
import { useDocumentation } from "@/hooks/useDocumentation";
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

export default function SupportPage() {
  const { t } = useTranslation();
  const { settings: companySettings } = useCompanySettings();
  const phoneForLink = companySettings.emergency_phone.replace(/\s/g, "");
  const { memberId, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  type FaqCategory = 'all' | 'device' | 'account' | 'billing' | 'safety';
  
  const FAQ_ITEMS: { id: string; category: FaqCategory; question: string; answer: string }[] = [
    // Device & Pendant
    { id: "test-pendant", category: "device", question: t("support.faq.testPendant"), answer: t("support.faq.testPendantAnswer") },
    { id: "sos-button", category: "device", question: t("support.faq.sosButton"), answer: t("support.faq.sosButtonAnswer") },
    { id: "fall-detection", category: "device", question: t("support.faq.fallDetection"), answer: t("support.faq.fallDetectionAnswer") },
    { id: "geo-fencing", category: "device", question: t("support.faq.geoFencing"), answer: t("support.faq.geoFencingAnswer") },
    { id: "charge-pendant", category: "device", question: t("support.faq.chargePendant"), answer: t("support.faq.chargePendantAnswer") },
    { id: "pendant-wet", category: "device", question: t("support.faq.pendantWet"), answer: t("support.faq.pendantWetAnswer") },
    // My Account
    { id: "update-medical", category: "account", question: t("support.faq.updateMedical"), answer: t("support.faq.updateMedicalAnswer") },
    { id: "add-contacts", category: "account", question: t("support.faq.addContacts"), answer: t("support.faq.addContactsAnswer") },
    { id: "change-password", category: "account", question: t("support.faq.changePassword"), answer: t("support.faq.changePasswordAnswer") },
    { id: "update-address", category: "account", question: t("support.faq.updateAddress"), answer: t("support.faq.updateAddressAnswer") },
    { id: "view-subscription", category: "account", question: t("support.faq.viewSubscription"), answer: t("support.faq.viewSubscriptionAnswer") },
    // Billing & Payments
    { id: "update-payment", category: "billing", question: t("support.faq.updatePayment"), answer: t("support.faq.updatePaymentAnswer") },
    { id: "billing-date", category: "billing", question: t("support.faq.billingDate"), answer: t("support.faq.billingDateAnswer") },
    { id: "cancel-subscription", category: "billing", question: t("support.faq.cancelSubscription"), answer: t("support.faq.cancelSubscriptionAnswer") },
    // Safety & Privacy
    { id: "medical-privacy", category: "safety", question: t("support.faq.medicalPrivacy"), answer: t("support.faq.medicalPrivacyAnswer") },
    { id: "location-data", category: "safety", question: t("support.faq.locationData"), answer: t("support.faq.locationDataAnswer") },
  ];

  const [faqSearch, setFaqSearch] = useState("");
  const [faqCategory, setFaqCategory] = useState<FaqCategory>("all");

  const categoryIcons: Record<FaqCategory, React.ReactNode> = {
    all: <HelpCircle className="h-4 w-4" />,
    device: <Smartphone className="h-4 w-4" />,
    account: <User className="h-4 w-4" />,
    billing: <CreditCard className="h-4 w-4" />,
    safety: <Shield className="h-4 w-4" />,
  };

  const filteredFaqItems = FAQ_ITEMS.filter((item) => {
    const matchesCategory = faqCategory === "all" || item.category === faqCategory;
    const matchesSearch = !faqSearch || item.question.toLowerCase().includes(faqSearch.toLowerCase()) || item.answer.toLowerCase().includes(faqSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Knowledge base articles from documentation table
  const { data: kbArticles } = useDocumentation({
    status: 'published',
    visibility: 'member',
  });

  const memberArticles = kbArticles?.filter(a => a.category === 'member_guide' || a.category === 'general') || [];
  
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  // Messaging state
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

  // Auto-open new message dialog from query params (e.g. from DevicePage)
  useEffect(() => {
    const action = searchParams.get("action");
    if (action) {
      const subjectMap: Record<string, string> = {
        report_issue: t("support.reportIssueSubject", "Device Issue Report"),
        request_replacement: t("support.requestReplacementSubject", "Device Replacement Request"),
      };
      setNewSubject(subjectMap[action] || action.replace(/_/g, " "));
      setIsDialogOpen(true);
      // Clear the action param so it doesn't re-open on navigation
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    
    if (memberId) {
      fetchConversations();

      const channel = supabase
        .channel("support-conversations")
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
        .channel(`support-messages-${selectedConversation.id}`)
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      toast.error(t("support.enterSubjectAndMessage"));
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

      toast.success(t("support.messageSent"));
      setIsDialogOpen(false);
      setNewSubject("");
      setNewMessage("");
      fetchConversations();
      setSelectedConversation(convData as Conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast.error(t("support.failedToSend"));
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

      setReplyMessage("");
      fetchMessages(selectedConversation.id);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(t("support.failedToSend"));
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
        return <Badge className="bg-green-600">{t("support.status.resolved")}</Badge>;
      case "closed":
        return <Badge variant="outline">{t("support.status.closed")}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const unreadCount = conversations.filter(c => c.has_unread).length;

  // Conversation detail view
  if (selectedConversation) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Button
          variant="ghost"
          onClick={() => setSelectedConversation(null)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("support.backToSupport")}
        </Button>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{selectedConversation.subject || t("support.conversation")}</CardTitle>
                <CardDescription>
                  {t("support.started")} {formatDistanceToNow(new Date(selectedConversation.created_at), { addSuffix: true })}
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
                            ? `${t("support.you")} • `
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
                  placeholder={t("support.typeMessage")}
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("support.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("support.subtitle")}</p>
        </div>
      </div>

      {/* Emergency Banner */}
      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 overflow-hidden relative">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iNCIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <CardContent className="p-6 relative">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="h-20 w-20 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center flex-shrink-0">
              <Smartphone className="h-10 w-10" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-xl font-bold mb-2">{t("support.forEmergencies")}</h2>
              <p className="text-primary-foreground/80 mb-1">
                {t("support.pressSosButton")}
              </p>
              <p className="text-primary-foreground/80 text-sm">
                {t("support.teamWithYou")}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <a 
                href={`tel:${phoneForLink}`}
                className="inline-flex items-center justify-center gap-2 bg-white text-primary font-semibold px-6 py-3 rounded-full hover:bg-white/90 transition-colors"
              >
                <Phone className="h-5 w-5" />
                {t("common.callNow", "Call Now")}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="chat" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="chat" className="flex items-center gap-2 py-3">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">{t("support.aiAssistant")}</span>
            <span className="sm:hidden">AI</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-2 py-3 relative">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">{t("navigation.messages")}</span>
            <span className="sm:hidden">{t("support.chat")}</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="help" className="flex items-center gap-2 py-3">
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">{t("support.helpCenter")}</span>
            <span className="sm:hidden">FAQ</span>
          </TabsTrigger>
        </TabsList>

        {/* AI Chat Tab */}
        <TabsContent value="chat" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <InlineAIChat memberContext={true} />
            </div>
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    {t("support.aiAssistant")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-3">
                  <p>{t("support.aiCanHelp")}</p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{t("support.aiHelp.device")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Heart className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{t("support.aiHelp.billing")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Users className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{t("support.aiHelp.service")}</span>
                    </li>
                  </ul>
                  <p className="pt-2 text-xs">
                    {t("support.aiConnectSupport")}
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    {t("support.needPerson")}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("support.conversations")}</h2>
              <p className="text-sm text-muted-foreground">{t("support.chatWithTeam")}</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("support.newMessage")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("support.sendMessage")}</DialogTitle>
                  <DialogDescription>
                    {t("support.teamWillRespond")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("support.subject")}</label>
                    <Input
                      placeholder={t("support.subjectPlaceholder")}
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("support.message")}</label>
                    <Textarea
                      placeholder={t("support.messagePlaceholder")}
                      className="min-h-[120px]"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={createConversation} disabled={isSending} className="w-full">
                    {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("support.sendMessage")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <Headphones className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <p className="font-medium">{t("support.noMessages")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("support.startConversation")}
                </p>
                <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("support.sendFirstMessage")}
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
                            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                          <h3 className={cn(
                            "font-medium truncate",
                            conv.has_unread && "font-semibold"
                          )}>
                            {conv.subject || t("support.conversation")}
                          </h3>
                        </div>
                        {conv.last_message_preview && (
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {conv.last_message_preview}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
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
        </TabsContent>

        {/* Help Center Tab */}
        <TabsContent value="help" className="space-y-6">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={t("support.faqSearchPlaceholder")}
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              className="pl-12 h-14 text-base rounded-xl"
            />
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {(["all", "device", "account", "billing", "safety"] as FaqCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setFaqCategory(cat)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors min-h-[44px]",
                  faqCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {categoryIcons[cat]}
                {t(`support.faqCategories.${cat}`)}
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* FAQ Accordion */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5" />
                    {t("support.faqTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("support.faqSubtitle")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredFaqItems.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8 text-base">
                      {t("support.faqNoResults")}
                    </p>
                  ) : (
                    <Accordion type="single" collapsible className="w-full">
                      {filteredFaqItems.map((item) => (
                        <AccordionItem key={item.id} value={item.id}>
                          <AccordionTrigger className="text-left text-base min-h-[48px]">
                            {item.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                            {item.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </CardContent>
              </Card>

              {/* Knowledge Base section */}
              {memberArticles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      {t("support.knowledgeBase")}
                    </CardTitle>
                    <CardDescription>
                      {t("support.knowledgeBaseSubtitle")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {memberArticles.slice(0, 6).map((article) => (
                      <div key={article.id} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors min-h-[48px]"
                        >
                          <span className="font-medium text-base">{article.title}</span>
                          <Badge variant="secondary" className="ml-2 shrink-0">
                            {article.category === 'member_guide' ? t("support.faqCategories.device") : t("support.faqCategories.all")}
                          </Badge>
                        </button>
                        {expandedArticle === article.id && (
                          <div className="px-4 pb-4 text-muted-foreground text-sm leading-relaxed border-t pt-3">
                            <div dangerouslySetInnerHTML={{ __html: article.content.substring(0, 500) + (article.content.length > 500 ? '...' : '') }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Still need help card */}
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-6 text-center">
                  <HelpCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold text-lg mb-1">{t("support.stillNeedHelp")}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{t("support.stillNeedHelpDesc")}</p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button variant="outline" onClick={() => {
                      const tabsList = document.querySelector('[value="chat"]') as HTMLElement;
                      tabsList?.click();
                    }}>
                      <Bot className="mr-2 h-4 w-4" />
                      {t("support.askAI")}
                    </Button>
                    <Button onClick={() => setIsDialogOpen(true)}>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      {t("support.sendUsMessage")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("support.contactOptions")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a 
                    href={`tel:${phoneForLink}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors min-h-[48px]"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Phone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{t("support.callUs")}</p>
                      <p className="text-primary text-sm">{t("support.tapToCall")}</p>
                    </div>
                  </a>

                  <a 
                    href={`https://wa.me/${phoneForLink.replace("+", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 transition-colors min-h-[48px]"
                  >
                    <div className="h-10 w-10 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                      <MessageCircle className="h-5 w-5 text-[#25D366]" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">WhatsApp</p>
                      <p className="text-[#25D366] text-sm">{t("support.chatWithUs")}</p>
                    </div>
                  </a>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-2">{t("support.cantFindAnswer")}</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t("support.aiAndTeamReady")}
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => setIsDialogOpen(true)}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    {t("support.contactSupport")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
