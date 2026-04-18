import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAddPartnerMember } from "@/hooks/usePartnerMembers";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Clock,
  Signal
} from "lucide-react";
import { usePartnerMembers } from "@/hooks/usePartnerMembers";
import { usePartnerAlertNotifications } from "@/hooks/usePartnerAlertNotifications";
import { format } from "date-fns";

interface ResidentialDashboardProps {
  partnerId: string;
  alertVisibilityEnabled?: boolean;
}

export function ResidentialDashboard({
  partnerId,
  alertVisibilityEnabled = false
}: ResidentialDashboardProps) {
  const { t } = useTranslation();
  const addMember = useAddPartnerMember();
  const [activeTab, setActiveTab] = useState("overview");
  const [memberSearch, setMemberSearch] = useState("");
  const [addResidentOpen, setAddResidentOpen] = useState(false);
  const [newResident, setNewResident] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const csvInputRef = useRef<HTMLInputElement>(null);

  const { data: members, isLoading: membersLoading } = usePartnerMembers(partnerId);
  const { notifications: alertNotifications, isLoading: alertsLoading } = usePartnerAlertNotifications(partnerId);

  // Calculate stats
  const totalResidents = members?.length || 0;
  const activeMembers = members?.filter(m => !m.removed_at).length || 0;
  const pendingMembers = 0;
  const alertsThisMonth = alertNotifications?.filter(a => {
    const sentDate = new Date(a.sent_at);
    const now = new Date();
    return sentDate.getMonth() === now.getMonth() && sentDate.getFullYear() === now.getFullYear();
  }).length || 0;

  // Filter members by search
  const filteredMembers = members?.filter(m => {
    const memberName = `${m.member?.first_name || ''} ${m.member?.last_name || ''}`.toLowerCase();
    return memberName.includes(memberSearch.toLowerCase());
  });

  // Add Resident handler
  const handleAddResident = async () => {
    if (!newResident.firstName.trim() || !newResident.lastName.trim()) {
      toast.error(t("partner.residential.nameRequired", "First name and last name are required"));
      return;
    }

    try {
      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({
          first_name: newResident.firstName.trim(),
          last_name: newResident.lastName.trim(),
          email: newResident.email.trim() || null,
          phone: newResident.phone.trim() || null,
          status: "active",
        } as any)
        .select()
        .single();

      if (memberError) throw memberError;

      await addMember.mutateAsync({
        partnerId,
        memberId: member.id,
        relationshipType: "resident",
      });

      toast.success(t("partner.residential.residentAdded", { name: `${newResident.firstName} ${newResident.lastName}` }));
      setAddResidentOpen(false);
      setNewResident({ firstName: "", lastName: "", email: "", phone: "" });
    } catch (err) {
      console.error("Add resident error:", err);
      toast.error(t("partner.residential.addFailed", "Failed to add resident"));
    }
  };

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
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
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
                      <TableHead>{t("partner.residential.table.device", "Device")}</TableHead>
                      <TableHead>{t("partner.residential.table.relationship", "Relationship")}</TableHead>
                      <TableHead>{t("partner.residential.table.added", "Added")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers?.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.member?.first_name} {member.member?.last_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            {t("common.active", "Active")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Signal className="h-4 w-4 text-green-500" />
                            <span className="text-sm">{t("common.online", "Online")}</span>
                          </div>
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
                <CardDescription>{t("partner.residential.onboarding.addSingleDesc", "Register a new resident for ICE Alarm protection")}</CardDescription>
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
                  {t("partner.residential.onboarding.uploadCsv", "Upload CSV File")}
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
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold">{t("partner.residential.billing.perResident", "Per-Resident Monthly")}</h3>
                  <p className="text-sm text-muted-foreground">{t("partner.residential.billing.perResidentDesc", "Billed monthly per active resident")}</p>
                </div>
                <Badge>{t("common.active", "Active")}</Badge>
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
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  {t("partner.residential.billing.downloadAll", "Download All")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t("partner.residential.billing.noInvoices", "No invoices yet")}</p>
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
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-green-600">100%</p>
                  <p className="text-sm text-muted-foreground">{t("partner.residential.reports.devicesOnline", "Devices Online")}</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-blue-600">&lt;2min</p>
                  <p className="text-sm text-muted-foreground">{t("partner.residential.reports.avgResponseTime", "Avg Response Time")}</p>
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
                  {t("partner.residential.reports.monthlySummaryPdf", "Monthly Summary (PDF)")}
                </Button>
                <Button variant="outline" className="justify-start" onClick={handleExportAlerts}>
                  <Download className="h-4 w-4 mr-2" />
                  {t("partner.residential.reports.alertHistoryCsv", "Alert History (CSV)")}
                </Button>
                <Button variant="outline" className="justify-start" onClick={handleExportMembers}>
                  <Download className="h-4 w-4 mr-2" />
                  {t("partner.residential.reports.memberDirectory", "Member Directory (PDF)")}
                </Button>
                <Button variant="outline" className="justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  {t("partner.residential.reports.deviceStatus", "Device Status (CSV)")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Resident Dialog */}
      <Dialog open={addResidentOpen} onOpenChange={setAddResidentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("partner.residential.addResident", "Add Resident")}</DialogTitle>
            <DialogDescription>{t("partner.residential.addResidentDesc", "Register a new resident for ICE Alarm protection")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("partner.residential.firstName", "First Name")}</Label>
                <Input
                  value={newResident.firstName}
                  onChange={e => setNewResident(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder={t("partner.residential.firstName", "First name")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("partner.residential.lastName", "Last Name")}</Label>
                <Input
                  value={newResident.lastName}
                  onChange={e => setNewResident(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder={t("partner.residential.lastName", "Last name")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("common.email", "Email")}</Label>
              <Input
                type="email"
                value={newResident.email}
                onChange={e => setNewResident(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.phone", "Phone")}</Label>
              <Input
                value={newResident.phone}
                onChange={e => setNewResident(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+34..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddResidentOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleAddResident} disabled={addMember.isPending}>
              {addMember.isPending ? t("common.saving", "Saving...") : t("partner.residential.addResident", "Add Resident")}
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
            const text = event.target?.result as string;
            const lines = text.split("\n").filter(l => l.trim());
            const startIdx = lines[0]?.toLowerCase().includes("name") ? 1 : 0;
            let count = 0;
            for (let i = startIdx; i < lines.length; i++) {
              const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
              if (cols[0]) count++;
            }
            toast.info(t("partner.residential.csvPreview", { count }));
          };
          reader.readAsText(file);
          if (csvInputRef.current) csvInputRef.current.value = "";
        }}
      />
    </div>
  );
}
