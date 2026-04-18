import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  MessageSquare, 
  Video, 
  Share2, 
  Megaphone, 
  ArrowRight,
  Mail,
  Clock,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { MarketingOverviewCard } from "@/components/admin/dashboard/MarketingOverviewCard";
import { FailedActionsCard } from "@/components/admin/dashboard/FailedActionsCard";

export default function CommunicationsDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Fetch messages stats
  const { data: messagesStats, isLoading: messagesLoading } = useQuery({
    queryKey: ["communications-messages-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, status");
      
      if (error) throw error;
      
      const open = data?.filter(c => c.status === "open").length || 0;
      
      return { unread: open, open, total: data?.length || 0 };
    },
  });

  // Fetch video hub stats
  const { data: videoStats, isLoading: videoLoading } = useQuery({
    queryKey: ["communications-video-stats"],
    queryFn: async () => {
      const [projectsRes, rendersRes] = await Promise.all([
        supabase.from("video_projects").select("id, status"),
        supabase.from("video_renders").select("id, status"),
      ]);
      
      if (projectsRes.error) throw projectsRes.error;
      if (rendersRes.error) throw rendersRes.error;
      
      const drafts = projectsRes.data?.filter(p => p.status === "draft").length || 0;
      const rendering = rendersRes.data?.filter(r => ["queued", "running"].includes(r.status)).length || 0;
      const completed = rendersRes.data?.filter(r => r.status === "done").length || 0;
      
      return { drafts, rendering, completed, total: projectsRes.data?.length || 0 };
    },
  });

  // Fetch media manager stats
  const { data: mediaStats, isLoading: mediaLoading } = useQuery({
    queryKey: ["communications-media-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_posts")
        .select("id, status");
      
      if (error) throw error;
      
      const drafts = data?.filter(p => p.status === "draft").length || 0;
      const approved = data?.filter(p => p.status === "approved").length || 0;
      const published = data?.filter(p => p.status === "published").length || 0;
      
      return { drafts, approved, published, total: data?.length || 0 };
    },
  });

  // Fetch AI outreach stats
  const { data: outreachStats, isLoading: outreachLoading } = useQuery({
    queryKey: ["communications-outreach-stats"],
    queryFn: async () => {
      const [campaignsRes, contactsRes] = await Promise.all([
        supabase.from("outreach_campaigns").select("id, status"),
        supabase.from("crm_contacts").select("id, status"),
      ]);
      
      if (campaignsRes.error) throw campaignsRes.error;
      if (contactsRes.error) throw contactsRes.error;
      
      const activeCampaigns = campaignsRes.data?.filter(c => c.status === "active").length || 0;
      const leads = contactsRes.data?.length || 0;
      const hotLeads = contactsRes.data?.filter(c => c.status === "hot").length || 0;
      
      return { activeCampaigns, leads, hotLeads, totalCampaigns: campaignsRes.data?.length || 0 };
    },
  });

  const cards = [
    {
      id: "messages",
      icon: MessageSquare,
      title: t("commsDashboard.messages.title"),
      description: t("commsDashboard.messages.description"),
      path: "/admin/messages",
      buttonText: t("commsDashboard.messages.button"),
      isLoading: messagesLoading,
      stats: [
        { label: t("commsDashboard.messages.unread"), value: messagesStats?.unread ?? 0, highlight: true },
        { label: t("commsDashboard.messages.open"), value: messagesStats?.open ?? 0 },
      ],
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      id: "video",
      icon: Video,
      title: t("commsDashboard.videoHub.title"),
      description: t("commsDashboard.videoHub.description"),
      path: "/admin/video-hub",
      buttonText: t("commsDashboard.videoHub.button"),
      isLoading: videoLoading,
      stats: [
        { label: t("commsDashboard.videoHub.drafts"), value: videoStats?.drafts ?? 0 },
        { label: t("commsDashboard.videoHub.rendering"), value: videoStats?.rendering ?? 0, highlight: videoStats?.rendering && videoStats.rendering > 0 },
        { label: t("commsDashboard.videoHub.completed"), value: videoStats?.completed ?? 0 },
      ],
      color: "bg-red-500/10 text-red-600",
    },
    {
      id: "media",
      icon: Share2,
      title: t("commsDashboard.mediaManager.title"),
      description: t("commsDashboard.mediaManager.description"),
      path: "/admin/media-manager",
      buttonText: t("commsDashboard.mediaManager.button"),
      isLoading: mediaLoading,
      stats: [
        { label: t("commsDashboard.mediaManager.drafts"), value: mediaStats?.drafts ?? 0 },
        { label: t("commsDashboard.mediaManager.approved"), value: mediaStats?.approved ?? 0 },
        { label: t("commsDashboard.mediaManager.published"), value: mediaStats?.published ?? 0 },
      ],
      color: "bg-green-500/10 text-green-600",
    },
    {
      id: "outreach",
      icon: Megaphone,
      title: t("commsDashboard.aiOutreach.title"),
      description: t("commsDashboard.aiOutreach.description"),
      path: "/admin/ai-outreach",
      buttonText: t("commsDashboard.aiOutreach.button"),
      isLoading: outreachLoading,
      stats: [
        { label: t("commsDashboard.aiOutreach.activeCampaigns"), value: outreachStats?.activeCampaigns ?? 0, highlight: true },
        { label: t("commsDashboard.aiOutreach.leads"), value: outreachStats?.leads ?? 0 },
        { label: t("commsDashboard.aiOutreach.hotLeads"), value: outreachStats?.hotLeads ?? 0 },
      ],
      color: "bg-purple-500/10 text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("commsDashboard.title")}</h1>
        <p className="text-muted-foreground">{t("commsDashboard.subtitle")}</p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
                <Mail className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{messagesStats?.unread ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("commsDashboard.quickStats.unreadMessages")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mediaStats?.drafts ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("commsDashboard.quickStats.pendingDrafts")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                <Video className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{videoStats?.rendering ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("commsDashboard.quickStats.videosRendering")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mediaStats?.approved ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("commsDashboard.quickStats.readyToPublish")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failed Actions (auto-hides when empty) */}
      <FailedActionsCard />

      {/* Marketing Overview */}
      <MarketingOverviewCard />

      {/* Overview Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{card.title}</CardTitle>
                      <CardDescription className="mt-0.5">{card.description}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {card.isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {card.stats.map((stat, idx) => (
                      <Badge 
                        key={idx} 
                        variant={stat.highlight ? "default" : "secondary"}
                        className="text-sm py-1 px-2"
                      >
                        {stat.value} {stat.label}
                      </Badge>
                    ))}
                  </div>
                )}
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => navigate(card.path)}
                >
                  {card.buttonText}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
