import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateReferralLink } from "@/lib/crmEvents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  Download,
  Plus,
  Upload,
  Heart,
  Send,
  UserCheck,
  Package,
  DollarSign,
  Trash2
} from "lucide-react";
import { ReferralPipeline } from "./ReferralPipeline";
import { ShareContentSection } from "./ShareContentSection";
import { StatsCards } from "./StatsCards";
import { usePartnerStats } from "@/hooks/usePartnerStats";

interface CareDashboardProps {
  partnerId: string;
  partner: {
    contact_name: string;
    company_name?: string | null;
    organization_type?: string | null;
    organization_registration?: string | null;
    organization_website?: string | null;
    estimated_monthly_referrals?: string | null;
    referral_code: string;
  };
}

interface BulkReferral {
  name: string;
  email: string;
  phone: string;
}

export function CareDashboard({ partnerId, partner }: CareDashboardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [bulkReferrals, setBulkReferrals] = useState<BulkReferral[]>([
    { name: "", email: "", phone: "" }
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stats, isLoading: statsLoading } = usePartnerStats(partnerId);

  const referralLink = generateReferralLink(partner.referral_code);

  const addBulkRow = () => {
    setBulkReferrals([...bulkReferrals, { name: "", email: "", phone: "" }]);
  };

  const removeBulkRow = (index: number) => {
    if (bulkReferrals.length > 1) {
      setBulkReferrals(bulkReferrals.filter((_, i) => i !== index));
    }
  };

  const updateBulkRow = (index: number, field: keyof BulkReferral, value: string) => {
    const updated = [...bulkReferrals];
    updated[index][field] = value;
    setBulkReferrals(updated);
  };

  // Validate bulk referral rows
  const validateRows = () => {
    const validRows = bulkReferrals.filter(r => r.name.trim() && (r.email.trim() || r.phone.trim()));
    if (validRows.length === 0) {
      toast.error(t("partner.care.noValidReferrals", "Add at least one referral with a name and email or phone"));
      return null;
    }
    return validRows;
  };

  // Save as drafts mutation
  const saveDraftsMutation = useMutation({
    mutationFn: async () => {
      const validRows = validateRows();
      if (!validRows) throw new Error("No valid rows");

      const invites = validRows.map(row => ({
        partner_id: partnerId,
        invitee_name: row.name.trim(),
        invitee_email: row.email.trim() || null,
        invitee_phone: row.phone.trim() || null,
        channel: (row.email ? "email" : "whatsapp") as "email" | "whatsapp",
        status: "draft" as const,
        metadata: { source: "bulk_care", referral_link: referralLink },
      }));

      const { data, error } = await supabase
        .from("partner_invites")
        .insert(invites)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(t("partner.care.draftsSaved", { count: data?.length || 0 }));
      queryClient.invalidateQueries({ queryKey: ["partner-pipeline", partnerId] });
      setBulkReferrals([{ name: "", email: "", phone: "" }]);
    },
    onError: () => toast.error(t("partner.care.saveFailed", "Failed to save drafts")),
  });

  // Send all invites mutation
  const sendAllMutation = useMutation({
    mutationFn: async () => {
      const validRows = validateRows();
      if (!validRows) throw new Error("No valid rows");

      const invites = validRows.map(row => ({
        partner_id: partnerId,
        invitee_name: row.name.trim(),
        invitee_email: row.email.trim() || null,
        invitee_phone: row.phone.trim() || null,
        channel: (row.email ? "email" : "whatsapp") as "email" | "whatsapp",
        status: "sent" as const,
        sent_at: new Date().toISOString(),
        metadata: { source: "bulk_care", referral_link: referralLink },
      }));

      const { data, error } = await supabase
        .from("partner_invites")
        .insert(invites)
        .select();

      if (error) throw error;

      // For each invite with email, call the send edge function
      for (const invite of (data || [])) {
        if (invite.invitee_email) {
          try {
            await supabase.functions.invoke("partner-send-invite", {
              body: {
                inviteId: invite.id,
                channel: "email",
                recipient: invite.invitee_email,
                message: `Hi ${invite.invitee_name}, you've been referred to ICE Alarm España by ${partner.company_name || partner.contact_name}.\n\nSign up here: ${referralLink}`,
                language: "en",
                referralCode: partner.referral_code,
                referralLink,
              },
            });
          } catch (e) {
            console.error("Failed to send invite for:", invite.invitee_email, e);
          }
        }
      }

      return data;
    },
    onSuccess: (data) => {
      toast.success(t("partner.care.invitesSent", { count: data?.length || 0 }));
      queryClient.invalidateQueries({ queryKey: ["partner-pipeline", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner-stats", partnerId] });
      setBulkReferrals([{ name: "", email: "", phone: "" }]);
    },
    onError: () => toast.error(t("partner.care.sendFailed", "Failed to send invites")),
  });

  // CSV upload handler
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter(line => line.trim());
        const startIdx = lines[0]?.toLowerCase().includes("name") ? 1 : 0;

        const parsed: BulkReferral[] = [];
        for (let i = startIdx; i < lines.length; i++) {
          const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
          if (cols[0]) {
            parsed.push({ name: cols[0] || "", email: cols[1] || "", phone: cols[2] || "" });
          }
        }

        if (parsed.length === 0) {
          toast.error(t("partner.care.csvEmpty", "CSV file is empty"));
          return;
        }

        setBulkReferrals(parsed);
        toast.success(t("partner.care.csvLoaded", { count: parsed.length }));
      } catch {
        toast.error(t("partner.care.csvParseError", "Failed to parse CSV file"));
      }
    };
    reader.readAsText(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Calculate impact stats
  const totalProtected = stats?.totalDelivered || 0;
  const totalReferrals = stats?.totalRegistrations || 0;
  const totalCommissions = (stats?.pendingCommission || 0) + (stats?.approvedCommission || 0) + (stats?.paidCommission || 0);

  return (
    <div className="space-y-6">
      {/* Hidden CSV input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleCsvUpload}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {partner.company_name || t("partner.care.title", "Partner Dashboard")}
          </h1>
          <p className="text-muted-foreground">
            {t("partner.care.welcome", { name: partner.contact_name })}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.care.tabs.overview", "Overview")}</span>
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.care.tabs.organization", "Organization")}</span>
          </TabsTrigger>
          <TabsTrigger value="referrals" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.care.tabs.referrals", "Referrals")}</span>
          </TabsTrigger>
          <TabsTrigger value="bulk" className="gap-2">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.care.tabs.bulkRefer", "Bulk Refer")}</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.care.tabs.reports", "Reports")}</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Organization Summary Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-primary/10 p-4">
                  <Heart className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">{partner.company_name || t("partner.care.org.yourOrg", "Your Organization")}</h2>
                  <p className="text-muted-foreground">
                    {partner.organization_type?.replace("_", " ") || t("partner.care.org.carePartner", "Care Partner")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-primary">{totalProtected}</p>
                  <p className="text-sm text-muted-foreground">{t("partner.care.stats.protected", "People Protected")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <StatsCards stats={stats} isLoading={statsLoading} />

          {/* Pipeline */}
          <ReferralPipeline partnerId={partnerId} />

          {/* Share Content */}
          <ShareContentSection partnerId={partnerId} />
        </TabsContent>

        {/* Organization Tab */}
        <TabsContent value="organization" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("partner.care.org.title", "Organization Profile")}</CardTitle>
              <CardDescription>{t("partner.care.org.subtitle", "Details about your organization")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t("partner.care.org.name", "Organization Name")}</label>
                  <p className="text-lg font-medium">{partner.company_name || "-"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t("partner.care.org.type", "Organization Type")}</label>
                  <p className="text-lg font-medium capitalize">
                    {partner.organization_type?.replace("_", " ") || "-"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t("partner.care.org.regNumber", "Registration Number")}</label>
                  <p className="text-lg font-medium">{partner.organization_registration || "-"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t("partner.care.org.website", "Website")}</label>
                  <p className="text-lg font-medium">
                    {partner.organization_website ? (
                      <a
                        href={partner.organization_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {partner.organization_website}
                      </a>
                    ) : "-"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t("partner.care.org.monthlyReferrals", "Expected Monthly Referrals")}</label>
                  <p className="text-lg font-medium">{partner.estimated_monthly_referrals || "-"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t("partner.referralCode", "Referral Code")}</label>
                  <p className="text-lg font-medium font-mono">{partner.referral_code}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-6 mt-6">
          <ReferralPipeline partnerId={partnerId} />
        </TabsContent>

        {/* Bulk Refer Tab */}
        <TabsContent value="bulk" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("partner.care.bulk.title", "Bulk Referral Form")}</CardTitle>
              <CardDescription>{t("partner.care.bulk.subtitle", "Add multiple referrals at once")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name", "Name")} *</TableHead>
                    <TableHead>{t("common.email", "Email")} *</TableHead>
                    <TableHead>{t("common.phone", "Phone")}</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkReferrals.map((referral, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          placeholder={t("common.name", "Full name")}
                          value={referral.name}
                          onChange={(e) => updateBulkRow(index, "name", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          value={referral.email}
                          onChange={(e) => updateBulkRow(index, "email", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="tel"
                          placeholder="+34 600 000 000"
                          value={referral.phone}
                          onChange={(e) => updateBulkRow(index, "phone", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeBulkRow(index)}
                          disabled={bulkReferrals.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex gap-3">
                <Button variant="outline" onClick={addBulkRow}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("partner.care.bulk.addRow", "Add Row")}
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  {t("partner.care.uploadCsv", "Upload CSV")}
                </Button>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => saveDraftsMutation.mutate()}
                  disabled={saveDraftsMutation.isPending || sendAllMutation.isPending}
                >
                  {saveDraftsMutation.isPending ? t("common.saving", "Saving...") : t("partner.care.saveAsDrafts", "Save as Drafts")}
                </Button>
                <Button
                  onClick={() => sendAllMutation.mutate()}
                  disabled={saveDraftsMutation.isPending || sendAllMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendAllMutation.isPending ? t("common.sending", "Sending...") : t("partner.care.sendAllInvites", "Send All Invites")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6 mt-6">
          {/* Impact Statement */}
          <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/50">
                  <Heart className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-green-800 dark:text-green-200">
                    {t("partner.care.reports.yourImpact", "Your Impact")}
                  </h2>
                  <p className="text-green-700 dark:text-green-300">
                    {t("partner.care.reports.impactStatement", "You've helped protect {{count}} people through ICE Alarm", { count: totalProtected })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("partner.care.reports.thisMonth", "This Month")}</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalInvitesSent || 0}</div>
                <p className="text-xs text-muted-foreground">{t("partner.care.reports.referralsSent", "Referrals sent")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("partner.care.reports.thisQuarter", "This Quarter")}</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalReferrals}</div>
                <p className="text-xs text-muted-foreground">{t("partner.stats.registrations", "Registrations")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("partner.care.reports.thisYear", "This Year")}</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalProtected}</div>
                <p className="text-xs text-muted-foreground">{t("partner.care.reports.activeMembers", "Active members")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("partner.care.reports.totalEarned", "Total Earned")}</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">&euro;{totalCommissions.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">{t("partner.care.reports.allTime", "All time")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Download Reports */}
          <Card>
            <CardHeader>
              <CardTitle>{t("partner.care.reports.downloadTitle", "Download Reports")}</CardTitle>
              <CardDescription>{t("partner.care.reports.downloadDesc", "Generate PDF reports for board meetings or records")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <Button variant="outline" className="justify-start h-auto py-4">
                  <div className="flex items-center gap-3">
                    <Download className="h-5 w-5" />
                    <div className="text-left">
                      <p className="font-medium">{t("partner.care.reports.monthlySummary", "Monthly Summary Report")}</p>
                      <p className="text-xs text-muted-foreground">{t("partner.care.reports.monthlySummaryDesc", "Referrals, conversions, commissions")}</p>
                    </div>
                  </div>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-4">
                  <div className="flex items-center gap-3">
                    <Download className="h-5 w-5" />
                    <div className="text-left">
                      <p className="font-medium">{t("partner.care.reports.impactReport", "Impact Report")}</p>
                      <p className="text-xs text-muted-foreground">{t("partner.care.reports.impactReportDesc", "For stakeholders & board meetings")}</p>
                    </div>
                  </div>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-4">
                  <div className="flex items-center gap-3">
                    <Download className="h-5 w-5" />
                    <div className="text-left">
                      <p className="font-medium">{t("partner.care.reports.commissionStatement", "Commission Statement")}</p>
                      <p className="text-xs text-muted-foreground">{t("partner.care.reports.commissionStatementDesc", "Detailed breakdown by referral")}</p>
                    </div>
                  </div>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-4">
                  <div className="flex items-center gap-3">
                    <Download className="h-5 w-5" />
                    <div className="text-left">
                      <p className="font-medium">{t("partner.care.reports.referralExport", "Referral List (CSV)")}</p>
                      <p className="text-xs text-muted-foreground">{t("partner.care.reports.referralExportDesc", "Export all referral data")}</p>
                    </div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
