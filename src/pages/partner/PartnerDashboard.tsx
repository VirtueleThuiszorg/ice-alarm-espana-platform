import { useState } from "react";
import { usePartnerData } from "@/hooks/usePartnerData";
import { usePartnerStats } from "@/hooks/usePartnerStats";
import { StatsCards } from "@/components/partner/StatsCards";
import { ReferralPipeline } from "@/components/partner/ReferralPipeline";
import { ShareContentSection } from "@/components/partner/ShareContentSection";
import { CareDashboard } from "@/components/partner/CareDashboard";
import { ResidentialDashboard } from "@/components/partner/ResidentialDashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Link, ArrowLeft, Eye, Share2, Users, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { usePartnerMonthlyStats } from "@/hooks/usePartnerMonthlyStats";
import { generateReferralLink } from "@/lib/crmEvents";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Mock data for template preview
const MOCK_PARTNER = {
  id: "template-preview",
  contact_name: "Demo Partner",
  referral_code: "DEMO2024",
  company_name: "Demo Company Ltd",
  email: "demo@partner.com",
  partner_type: "referral" as const,
};

const MOCK_STATS = {
  totalInvitesSent: 24,
  totalRegistrations: 12,
  totalDelivered: 8,
  pendingCommission: 240,
  approvedCommission: 480,
  paidCommission: 960,
};

export default function PartnerDashboard() {
  const { t } = useTranslation();
  const { isStaff, staffRole } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [referralDialogOpen, setReferralDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "share">("overview");

  const isAdminRole = isStaff && (staffRole === "admin" || staffRole === "super_admin");
  const partnerIdParam = searchParams.get("partnerId");
  const isTemplatePreview = isAdminRole && !partnerIdParam;

  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminRole ? partnerIdParam : undefined
  );
  const { data: stats, isLoading: statsLoading } = usePartnerStats(
    isTemplatePreview ? undefined : partner?.id
  );

  const { data: monthlyStats } = usePartnerMonthlyStats(
    isTemplatePreview ? undefined : partner?.id
  );

  // Use mock data for template preview
  const displayPartner = isTemplatePreview ? MOCK_PARTNER : partner;
  const displayStats = isTemplatePreview ? MOCK_STATS : stats;

  const referralLink = displayPartner
    ? generateReferralLink(displayPartner.referral_code)
    : "";

  const copyReferralLink = () => {
    if (isTemplatePreview) {
      toast.info(t("partner.toast.previewOnly"));
      return;
    }
    navigator.clipboard.writeText(referralLink);
    toast.success(t("partner.toast.linkCopied"));
  };

  if (!isTemplatePreview && partnerLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-56" />
        </div>
        
        {/* Stats cards skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        
        {/* Pipeline skeleton */}
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!isTemplatePreview && !partner) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>{t("partner.dashboard.notFound")}</CardTitle>
            <CardDescription>
              {t("partner.dashboard.notLinked")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Determine partner type for dashboard rendering
  const partnerType = displayPartner?.partner_type || "referral";

  // Render Care Dashboard
  if (partnerType === "care" && !isTemplatePreview && partner) {
    return (
      <div className="space-y-6">
        {/* Admin viewing specific partner banner */}
        {isAdminRole && partnerIdParam && (
          <div className="flex items-center gap-4 p-4 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate("/admin/partners")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("admin.preview.backToPartners")}
            </Button>
            <span className="text-sm text-amber-800 dark:text-amber-200">
              {t("admin.preview.viewingAsAdmin")} <strong>{partner.contact_name}</strong>{t("admin.preview.dashboard")}
            </span>
          </div>
        )}
        <CareDashboard partnerId={partner.id} partner={partner} />
      </div>
    );
  }

  // Render Residential Dashboard
  if (partnerType === "residential" && !isTemplatePreview && partner) {
    return (
      <div className="space-y-6">
        {/* Admin viewing specific partner banner */}
        {isAdminRole && partnerIdParam && (
          <div className="flex items-center gap-4 p-4 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate("/admin/partners")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("admin.preview.backToPartners")}
            </Button>
            <span className="text-sm text-amber-800 dark:text-amber-200">
              {t("admin.preview.viewingAsAdmin")} <strong>{partner.contact_name}</strong>{t("admin.preview.dashboard")}
            </span>
          </div>
        )}
        <ResidentialDashboard 
          partnerId={partner.id} 
          alertVisibilityEnabled={partner.alert_visibility_enabled || false}
        />
      </div>
    );
  }

  // Default: Referral Partner Dashboard
  return (
    <div className="space-y-6">
      {/* Template Preview Banner */}
      {isTemplatePreview && (
        <div className="flex items-center gap-4 p-4 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg">
          <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {t("admin.preview.templateMode")}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {t("admin.preview.templateModeDesc")}
            </p>
          </div>
          <Badge variant="secondary" className="bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
            {t("admin.preview.demoData")}
          </Badge>
        </div>
      )}

      {/* Admin viewing specific partner banner */}
      {isAdminRole && partnerIdParam && partner && (
        <div className="flex items-center gap-4 p-4 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate("/admin/partners")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("admin.preview.backToPartners")}
          </Button>
          <span className="text-sm text-amber-800 dark:text-amber-200">
            {t("admin.preview.viewingAsAdmin")} <strong>{partner.contact_name}</strong>{t("admin.preview.dashboard")}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("partner.dashboard.title")}</h1>
          <p className="text-muted-foreground">
            {t("partner.dashboard.welcomeBack", { name: displayPartner?.contact_name })}
          </p>
        </div>

        {/* Referral Link Dialog */}
        <Dialog open={referralDialogOpen} onOpenChange={setReferralDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Link className="h-4 w-4" />
              {t("partner.dashboard.referralLink")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                {t("partner.dashboard.referralLink")}
              </DialogTitle>
              <DialogDescription>
                {t("partner.dashboard.shareToEarn")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="flex gap-2 items-center">
                <div className="flex-1 min-w-0">
                  <code className="block w-full rounded bg-muted px-3 py-2 text-sm border overflow-hidden text-ellipsis whitespace-nowrap">
                    {referralLink}
                  </code>
                </div>
                <Button onClick={copyReferralLink} className="shrink-0">
                  <Copy className="h-4 w-4 mr-2" />
                  {t("partner.dashboard.copy")}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("partner.dashboard.referralCode")} <strong>{displayPartner?.referral_code}</strong>
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={displayStats} isLoading={!isTemplatePreview && statsLoading} />

      {/* Monthly Performance Chart */}
      {!isTemplatePreview && monthlyStats && monthlyStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("partner.dashboard.monthlyPerformance", "Monthly Performance")}
            </CardTitle>
            <CardDescription>
              {t("partner.dashboard.monthlyPerformanceDesc", "Your referral activity over the last 6 months")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="invites_sent"
                  name={t("partner.dashboard.invitesSent", "Invites Sent")}
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="registrations"
                  name={t("partner.dashboard.registrations", "Registrations")}
                  fill="hsl(142, 76%, 36%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Overview and Share Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "share")}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Users className="h-4 w-4" />
            {t("partner.dashboard.pipeline.title")}
          </TabsTrigger>
          <TabsTrigger value="share" className="gap-2">
            <Share2 className="h-4 w-4" />
            {t("partner.share.title")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          {/* Referral Pipeline - show empty state for template preview */}
          {isTemplatePreview ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("partner.dashboard.pipeline.title")}</CardTitle>
                <CardDescription>{t("partner.dashboard.pipeline.subtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>{t("partner.dashboard.pipeline.emptyPreview")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ReferralPipeline partnerId={partner!.id} />
          )}
        </TabsContent>

        <TabsContent value="share" className="mt-6">
          {isTemplatePreview ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Share2 className="h-5 w-5" />
                  {t("partner.share.title")}
                </CardTitle>
                <CardDescription>{t("partner.share.subtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Share2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>{t("partner.share.noContent")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ShareContentSection partnerId={partner!.id} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}