import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Users,
  Bell,
  UserPlus,
  FileText,
  CreditCard,
  Download,
  Search,
  Plus,
  Upload,
  Activity,
  CheckCircle,
  Clock
} from "lucide-react";
import { usePartnerMembers } from "@/hooks/usePartnerMembers";
import { usePartnerAlertNotifications } from "@/hooks/usePartnerAlertNotifications";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * A resident's real membership state.
 *
 * `members.status` is nullable and a partner cannot read the `members` row at
 * all today (no partner SELECT policy), so the joined record can be missing
 * entirely. Both cases render as "Unknown" rather than as a green tick — a
 * facility must never be shown cover that may not exist.
 */
function residentStatusBadge(status: string | null) {
  switch (status) {
    case "active":
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          Active
        </Badge>
      );
    case "inactive":
      return <Badge variant="secondary">Pending activation</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

interface ResidentialDashboardProps {
  partnerId: string;
  alertVisibilityEnabled?: boolean;
  /** `partners.billing_model` — 'commission' | 'per_resident' | 'custom'. */
  billingModel?: string | null;
  /** `partners.custom_rate_monthly`, only meaningful when billingModel is 'custom'. */
  customRateMonthly?: number | null;
}

export function ResidentialDashboard({
  partnerId,
  alertVisibilityEnabled = false,
  billingModel = null,
  customRateMonthly = null
}: ResidentialDashboardProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");
  const [memberSearch, setMemberSearch] = useState("");
  const [addResidentOpen, setAddResidentOpen] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const { data: members, isLoading: membersLoading } = usePartnerMembers(partnerId);
  const { notifications: alertNotifications, isLoading: alertsLoading } = usePartnerAlertNotifications(partnerId);

  // Calculate stats
  const totalResidents = members?.length || 0;
  // "Active" means the member row says active — not merely that the link to this
  // facility has not been removed. The two were conflated, so every resident
  // counted as active however their membership actually stood.
  const activeMembers = members?.filter(m => m.member?.status === "active").length || 0;
  // Was the literal `0`. A resident is pending until their membership activates,
  // which happens on the payment webhook and nowhere else.
  const pendingMembers = members?.filter(m => m.member?.status && m.member.status !== "active").length || 0;
  const alertsThisMonth = alertNotifications?.filter(a => {
    const sentDate = new Date(a.sent_at);
    const now = new Date();
    return sentDate.getMonth() === now.getMonth() && sentDate.getFullYear() === now.getFullYear();
  }).length || 0;

  // What this facility actually agreed to, from `partners.billing_model`.
  const billingModelLabel =
    billingModel === "per_resident"
      ? t("partner.residential.billing.perResident", "Per-Resident Monthly")
      : billingModel === "custom"
        ? t("partner.residential.billing.custom", "Custom Arrangement")
        : billingModel === "commission"
          ? t("partner.residential.billing.commission", "Referral Commission")
          : t("partner.residential.billing.notSet", "Not set");

  const billingModelDescription =
    billingModel === "per_resident"
      ? t("partner.residential.billing.perResidentDesc", "Your facility is invoiced monthly for each active resident.")
      : billingModel === "custom"
        ? (customRateMonthly
            ? t("partner.residential.billing.customDescRate", "A rate agreed with the office: {{rate}} € per month.", {
                rate: customRateMonthly.toFixed(2).replace(".", ","),
              })
            : t("partner.residential.billing.customDesc", "A rate agreed with the office."))
        : billingModel === "commission"
          ? t("partner.residential.billing.commissionDesc", "Residents' families pay their own membership. Your facility is not invoiced; you receive a commission on each referral.")
          : t("partner.residential.billing.notSetDesc", "No arrangement is recorded against your account. Call the office on 950 473 199.");

  // Filter members by search
  const filteredMembers = members?.filter(m => {
    const memberName = `${m.member?.first_name || ''} ${m.member?.last_name || ''}`.toLowerCase();
    return memberName.includes(memberSearch.toLowerCase());
  });

  /**
   * Adding a resident from this screen is not available, and this is the honest
   * version of that rather than a button that appears to work.
   *
   * The old handler inserted straight into `members` from the browser. Three
   * things were wrong with it. There is no partner INSERT policy on `members`,
   * so RLS rejected it. It omitted `date_of_birth`, `address_line_1`, `city`,
   * `province` and `postal_code`, all NOT NULL, so it would have failed even
   * with a policy. And it created a monitored person with no subscription and
   * no payer, which is the open design question — for a care home the bill may
   * go to the facility or to the family, depending on the partner, and the
   * schema carries no payer distinct from the monitored member
   * (MEMBER_ONBOARDING.md Q1).
   *
   * Building half of it before that decision would mean migrating real resident
   * records afterwards. So the dialog explains the position and gives the
   * office number, exactly as AddMemberWizard does on the admin side.
   */

  // Export members to CSV
  const handleExportMembers = () => {
    if (!members?.length) {
      toast.error(t("partner.residential.noMembers", "No residents to export"));
      return;
    }

    const headers = ["First Name", "Last Name", "Email", "Phone", "Status", "Added"];
    const rows = members.map(m => [
      m.member?.first_name || "",
      m.member?.last_name || "",
      m.member?.email || "",
      m.member?.phone || "",
      m.member?.status || "",
      m.added_at ? format(new Date(m.added_at), "yyyy-MM-dd") : "",
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `residents-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("partner.residential.exported", "Export downloaded"));
  };

  // Export alerts to CSV
  const handleExportAlerts = () => {
    if (!alertNotifications?.length) {
      toast.error(t("partner.residential.noAlerts", "No alerts to export"));
      return;
    }

    const headers = ["Member", "Method", "Status", "Sent At"];
    const rows = alertNotifications.map(a => [
      `${a.member?.first_name || ""} ${a.member?.last_name || ""}`.trim(),
      a.notification_method || "",
      a.acknowledged_at ? "Acknowledged" : "Pending",
      a.sent_at ? format(new Date(a.sent_at), "yyyy-MM-dd HH:mm") : "",
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alerts-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("partner.residential.exported", "Export downloaded"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("partner.residential.title", "Facility Dashboard")}</h1>
          <p className="text-muted-foreground">{t("partner.residential.subtitle", "Manage your residents and monitor alerts")}</p>
        </div>
        <Button className="gap-2" onClick={() => setAddResidentOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("partner.residential.addResident", "Add Resident")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          className={cn(
            "grid w-full lg:w-auto lg:inline-grid",
            alertVisibilityEnabled ? "grid-cols-6" : "grid-cols-5"
          )}
        >
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.residential.tabs.overview", "Overview")}</span>
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.residential.tabs.residents", "Residents")}</span>
          </TabsTrigger>
          {alertVisibilityEnabled && (
            <TabsTrigger value="alerts" className="gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">{t("partner.residential.tabs.alerts", "Alerts")}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="onboarding" className="gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.residential.tabs.onboarding", "Onboarding")}</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.residential.tabs.billing", "Billing")}</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">{t("partner.residential.tabs.reports", "Reports")}</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("partner.residential.stats.totalResidents", "Total Residents")}</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalResidents}</div>
                <p className="text-xs text-muted-foreground">{t("partner.residential.stats.linkedToFacility", "Linked to your facility")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("partner.residential.stats.active", "Active Members")}</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{activeMembers}</div>
                <p className="text-xs text-muted-foreground">{t("partner.residential.stats.activeDesc", "With active subscriptions")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("partner.residential.stats.pending", "Pending Setup")}</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{pendingMembers}</div>
                <p className="text-xs text-muted-foreground">{t("partner.residential.stats.pendingDesc", "Awaiting activation")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("partner.residential.stats.alertsThisMonth", "Alerts This Month")}</CardTitle>
                <Bell className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{alertsThisMonth}</div>
                <p className="text-xs text-muted-foreground">{t("partner.residential.stats.acrossResidents", "Across all residents")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>{t("partner.residential.actions.title", "Quick Actions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setAddResidentOpen(true)}>
                  <UserPlus className="h-5 w-5" />
                  <span>{t("partner.residential.actions.addResident", "Add Resident")}</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab("alerts")}>
                  <Bell className="h-5 w-5" />
                  <span>{t("partner.residential.actions.viewAlerts", "View Alerts")}</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={handleExportMembers}>
                  <Download className="h-5 w-5" />
                  <span>{t("partner.residential.actions.downloadReport", "Download Report")}</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setActiveTab("onboarding")}>
                  <Upload className="h-5 w-5" />
                  <span>{t("partner.residential.actions.bulkUpload", "Bulk Upload")}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>{t("partner.residential.recentActivity", "Recent Activity")}</CardTitle>
              <CardDescription>{t("partner.residential.recentActivityDesc", "Latest events across your facility")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alertNotifications?.slice(0, 5).map((notification) => (
                  <div key={notification.id} className="flex items-center gap-4">
                    <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/30">
                      <Bell className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{t("partner.residential.alertSent", "Alert notification sent")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("partner.residential.via", "Via")} {notification.notification_method} - {format(new Date(notification.sent_at), "dd MMM yyyy HH:mm")}
                      </p>
                    </div>
                    {notification.acknowledged_at ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800">
                        {t("partner.residential.acknowledged", "Acknowledged")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                        {t("common.pending", "Pending")}
                      </Badge>
                    )}
                  </div>
                ))}
                {(!alertNotifications || alertNotifications.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">
                    {t("partner.residential.noRecentActivity", "No recent activity")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("partner.residential.facilityMembers", "Facility Members")}</CardTitle>
                  <CardDescription>{t("partner.residential.facilityMembersDesc", "All residents linked to your facility")}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleExportMembers()}>
                    <Download className="h-4 w-4 mr-2" />
                    {t("partner.residential.export", "Export")}
                  </Button>
                  <Button size="sm" onClick={() => setAddResidentOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("partner.residential.addMember", "Add Member")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("partner.residential.searchMembers", "Search members...")}
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {membersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : filteredMembers?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t("partner.residential.empty.noResidents", "No residents found")}</p>
                  <Button className="mt-4" variant="outline" onClick={() => setAddResidentOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("partner.residential.addFirstMember", "Add Your First Member")}
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.name", "Name")}</TableHead>
                      <TableHead>{t("common.status", "Status")}</TableHead>
                      <TableHead>{t("partner.residential.table.relationship", "Relationship")}</TableHead>
                      <TableHead>{t("partner.residential.table.added", "Added")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers?.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.member
                            ? `${member.member.first_name} ${member.member.last_name}`
                            : (
                              <span className="text-muted-foreground italic">
                                {t("partner.residential.table.detailsUnavailable", "Details not available")}
                              </span>
                            )}
                        </TableCell>
                        <TableCell>
                          {/* Was a hardcoded green "Active" on every row, and a hardcoded
                              "Online" device column beside it — neither read any data.
                              A facility looking at this screen was being told every
                              resident was covered and every pendant was connected,
                              whatever the truth. The device column is gone because this
                              query fetches no device state; status is the real column. */}
                          {residentStatusBadge(member.member?.status ?? null)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {member.relationship_type || "resident"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(member.added_at), "dd MMM yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        {alertVisibilityEnabled && (
          <TabsContent value="alerts" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t("partner.residential.alertHistory", "Alert History")}</CardTitle>
                    <CardDescription>{t("partner.residential.alertHistoryDesc", "Notifications sent for your residents")}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleExportAlerts}>
                    <Download className="h-4 w-4 mr-2" />
                    {t("partner.residential.export", "Export")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {alertsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : alertNotifications?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t("partner.residential.empty.noAlerts", "No alerts yet")}</p>
                    <p className="text-sm">{t("partner.residential.empty.noAlertsDesc", "You'll be notified when a resident triggers an alert")}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.date", "Date")}</TableHead>
                        <TableHead>{t("partner.residential.table.resident", "Resident")}</TableHead>
                        <TableHead>{t("partner.residential.table.method", "Method")}</TableHead>
                        <TableHead>{t("common.status", "Status")}</TableHead>
                        <TableHead>{t("common.actions", "Actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alertNotifications?.map((notification) => (
                        <TableRow key={notification.id}>
                          <TableCell>
                            {format(new Date(notification.sent_at), "dd MMM yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="font-medium">
                            {notification.member?.first_name} {notification.member?.last_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {notification.notification_method}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {notification.acknowledged_at ? (
                              <Badge className="bg-green-100 text-green-800">
                                {t("partner.residential.acknowledged", "Acknowledged")}
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800">
                                {t("common.pending", "Pending")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {!notification.acknowledged_at && (
                              <Button size="sm" variant="outline">
                                {t("partner.residential.acknowledge", "Acknowledge")}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Onboarding Tab */}
        <TabsContent value="onboarding" className="space-y-6 mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("partner.residential.onboarding.addSingle", "Add Single Resident")}</CardTitle>
                <CardDescription>{t("partner.residential.onboarding.addSingleDesc", "Register a new resident for ICE Alarm España protection")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => setAddResidentOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t("partner.residential.onboarding.startRegistration", "Start New Registration")}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("partner.residential.onboarding.bulkUpload", "Bulk Upload")}</CardTitle>
                <CardDescription>{t("partner.residential.onboarding.bulkUploadDesc", "Upload multiple residents via CSV file")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={() => csvInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  {t("partner.residential.previewCsv", "Preview CSV (import coming soon)")}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("partner.residential.onboarding.pendingTitle", "Pending Onboardings")}</CardTitle>
              <CardDescription>{t("partner.residential.onboarding.pendingDesc", "Residents awaiting device activation")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("partner.residential.onboarding.noPending", "No pending onboardings")}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("partner.residential.billing.currentPlan", "Current Plan")}</CardTitle>
              <CardDescription>{t("partner.residential.billing.planDesc", "Your facility billing arrangement")}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* This card used to state "Per-Resident Monthly / Billed monthly per
                  active resident" with an Active badge, hardcoded, for every partner
                  — including commission partners, whose residents' families pay and
                  who are never invoiced at all. It now reads `partners.billing_model`.
                  Nothing on the payment path acts on that column yet, so the card
                  says what was agreed, and does not imply a live billing run. */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold">{billingModelLabel}</h3>
                  <p className="text-sm text-muted-foreground">{billingModelDescription}</p>
                </div>
                <Badge variant="secondary">
                  {t("partner.residential.billing.agreedWithOffice", "As agreed")}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("partner.residential.billing.invoiceHistory", "Invoice History")}</CardTitle>
                  <CardDescription>{t("partner.residential.billing.invoiceHistoryDesc", "Past invoices and payment status")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("partner.residential.billing.noInvoices", "No invoices yet")}</p>
                <p className="text-sm mt-2">
                  {t(
                    "partner.residential.billing.invoicesByOffice",
                    "Invoices are issued by the office. Call 950 473 199 for a copy.",
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("partner.residential.reports.monthlySummary", "Monthly Summary")}</CardTitle>
              <CardDescription>{t("partner.residential.reports.monthlySummaryDesc", "Overview of alerts, response times, and device health")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-primary">{alertsThisMonth}</p>
                  <p className="text-sm text-muted-foreground">{t("partner.residential.stats.alertsThisMonth", "Alerts This Month")}</p>
                </div>
                {/* "100% Devices Online" and "<2min Avg Response Time" were literals
                    in the JSX — a service-level claim, shown to a business partner,
                    computed from nothing. Replaced with figures this component can
                    actually derive. Real device uptime and response times belong in
                    a monthly report generated server-side from `alerts`. */}
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-primary">{activeMembers}</p>
                  <p className="text-sm text-muted-foreground">{t("partner.residential.stats.activeResidents", "Active Residents")}</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-yellow-600">{pendingMembers}</p>
                  <p className="text-sm text-muted-foreground">{t("partner.residential.stats.pending", "Pending Activation")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("partner.residential.reports.downloadTitle", "Download Reports")}</CardTitle>
              <CardDescription>{t("partner.residential.reports.downloadDesc", "Generate PDF reports for your records")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <Button variant="outline" className="justify-start" onClick={handleExportMembers}>
                  <Download className="h-4 w-4 mr-2" />
                  {t("partner.residential.reports.memberDirectoryCsv", "Resident Directory (CSV)")}
                </Button>
                <Button variant="outline" className="justify-start" onClick={handleExportAlerts}>
                  <Download className="h-4 w-4 mr-2" />
                  {t("partner.residential.reports.alertHistoryCsv", "Alert History (CSV)")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Resident Dialog — deliberately not a form. See the note above
          handleAddResident: the write it used to make could not succeed, and the
          design it needs is an open decision. */}
      <Dialog open={addResidentOpen} onOpenChange={setAddResidentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("partner.residential.addResident", "Add Resident")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "partner.residential.addUnavailable",
                "Adding a resident from this screen isn't available yet.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <p>
              {t(
                "partner.residential.addUnavailableWhy",
                "A resident needs a full record and a payment arrangement before their pendant can be monitored, and who is billed differs from one facility to the next. We set that up with you rather than have this screen guess it.",
              )}
            </p>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="font-medium">
                {t("partner.residential.addUnavailableCallTitle", "To add a resident")}
              </p>
              <p className="text-muted-foreground mt-1">
                {t(
                  "partner.residential.addUnavailableCallBody",
                  "Call the office on 950 473 199, or email partners@icealarm.es with the resident's name. They are usually set up the same day.",
                )}
              </p>
            </div>
            <p className="text-muted-foreground">
              {t(
                "partner.residential.addUnavailableSoon",
                "Self-service resident registration is on the roadmap. Residents already registered appear in this dashboard automatically.",
              )}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setAddResidentOpen(false)}>
              {t("common.close", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden CSV input */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const text = event.target?.result as string;
              const lines = text.split("\n").filter(l => l.trim());
              const startIdx = lines[0]?.toLowerCase().includes("name") ? 1 : 0;
              let count = 0;
              for (let i = startIdx; i < lines.length; i++) {
                const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
                if (cols[0]) count++;
              }
              toast.info(t("partner.residential.csvPreview", {
                count,
                defaultValue: "Preview: {{count}} residents found in the file — nothing was imported (import coming soon)",
              }));
            } catch {
              toast.error(t("partner.residential.csvParseError", "Failed to parse CSV file"));
            }
          };
          reader.onerror = () => {
            toast.error(t("partner.residential.csvReadError", "Failed to read CSV file"));
          };
          reader.readAsText(file);
          if (csvInputRef.current) csvInputRef.current.value = "";
        }}
      />
    </div>
  );
}
