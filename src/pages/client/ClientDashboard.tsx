import { Phone, MessageCircle, ArrowRight, Calendar, CreditCard, AlertTriangle, CheckCircle2, Eye, ArrowLeft, MessageSquare, Inbox } from "lucide-react";
import { DeviceStatusCard } from "@/components/dashboard/DeviceStatusCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminRole as checkAdminRole } from "@/config/constants";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { format } from "date-fns";
import { es, enGB } from "date-fns/locale";
import i18n from "@/i18n";

// Mock data for template preview mode
const MOCK_MEMBER = {
  first_name: "Demo",
  last_name: "Member",
};

const MOCK_DEVICE = {
  id: "demo-device",
  status: "live",
  is_online: true,
  battery_level: 85,
  last_checkin_at: new Date().toISOString(),
  last_location_address: "Calle Demo 123, Madrid",
};

const MOCK_SUBSCRIPTION = {
  plan_type: "single",
  status: "active",
  renewal_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  amount: 24.95,
  billing_frequency: "monthly",
};

const MOCK_CONTACTS = [
  { id: "1", contact_name: "Maria Garcia", relationship: "Daughter" },
  { id: "2", contact_name: "Carlos Garcia", relationship: "Son" },
];

export default function ClientDashboard() {
  const { memberId: authMemberId, isStaff, staffRole } = useAuth();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { settings: companySettings } = useCompanySettings();
  const phoneForLink = companySettings.emergency_phone.replace(/\s/g, "");

  // Determine if admin is viewing
  const isAdminRole = isStaff && checkAdminRole(staffRole);
  const memberIdParam = searchParams.get("memberId");
  const isTemplatePreview = isAdminRole && !memberIdParam;
  const effectiveMemberId = isAdminRole ? memberIdParam : authMemberId;

  // Fetch member data
  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ["member-dashboard", effectiveMemberId],
    queryFn: async () => {
      if (!effectiveMemberId) return null;
      const { data, error } = await supabase
        .from("members")
        .select("first_name, last_name")
        .eq("id", effectiveMemberId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveMemberId && !isTemplatePreview,
  });

  // Fetch device data - look for EV-07B devices in any active lifecycle status
  const { data: device, isLoading: deviceLoading } = useQuery({
    queryKey: ["member-device", effectiveMemberId],
    queryFn: async () => {
      if (!effectiveMemberId) return null;
      const { data, error } = await supabase
        .from("devices")
        .select("id, status, is_online, battery_level, last_checkin_at, last_location_address, offline_since")
        .eq("member_id", effectiveMemberId)
        .in("status", ["allocated", "with_staff", "live", "active"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveMemberId && !isTemplatePreview,
  });

  // Fetch subscription data
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["member-subscription", effectiveMemberId],
    queryFn: async () => {
      if (!effectiveMemberId) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("member_id", effectiveMemberId)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveMemberId && !isTemplatePreview,
  });

  // Fetch emergency contacts
  const { data: contacts, isLoading: contactsLoading } = useQuery({
    queryKey: ["member-emergency-contacts", effectiveMemberId],
    queryFn: async () => {
      if (!effectiveMemberId) return [];
      const { data, error } = await supabase
        .from("emergency_contacts")
        .select("*")
        .eq("member_id", effectiveMemberId)
        .order("priority_order", { ascending: true })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveMemberId && !isTemplatePreview,
  });

  // Fetch recent alerts count
  const { data: alertsCount } = useQuery({
    queryKey: ["member-alerts-count", effectiveMemberId],
    queryFn: async () => {
      if (!effectiveMemberId) return 0;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count, error } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("member_id", effectiveMemberId)
        .gte("received_at", thirtyDaysAgo.toISOString());
      if (error) throw error;
      return count || 0;
    },
    enabled: !!effectiveMemberId && !isTemplatePreview,
  });

  // Fetch unread message count
  const { data: unreadMsgCount } = useQuery({
    queryKey: ["member-unread-messages", effectiveMemberId],
    queryFn: async () => {
      if (!effectiveMemberId) return 0;
      // Get conversations for this member
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .eq("member_id", effectiveMemberId);
      if (!convs?.length) return 0;
      const convIds = convs.map(c => c.id);
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", convIds)
        .eq("sender_type", "staff")
        .eq("is_read", false);
      return count || 0;
    },
    enabled: !!effectiveMemberId && !isTemplatePreview,
  });

  // Use mock data in template preview mode
  const displayMember = isTemplatePreview ? MOCK_MEMBER : member;
  const displayDevice = isTemplatePreview ? MOCK_DEVICE : device;
  const displaySubscription = isTemplatePreview ? MOCK_SUBSCRIPTION : subscription;
  const displayContacts = isTemplatePreview ? MOCK_CONTACTS : contacts;
  const displayAlertsCount = isTemplatePreview ? 2 : alertsCount;
  const displayUnreadMsgs = isTemplatePreview ? 3 : (unreadMsgCount || 0);

  const dateLocale = i18n.language === 'es' ? es : enGB;
  const currentDate = format(new Date(), 'EEEE, d MMMM yyyy', { locale: dateLocale });

  const memberName = displayMember?.first_name || t("common.member");

  const formatPlanType = (type: string) => {
    return type === "single" ? t("membership.single") : type === "couple" ? t("membership.couple") : type;
  };

  const formatBillingFrequency = (freq: string) => {
    switch (freq) {
      case "monthly": return t("subscription.mo");
      case "quarterly": return t("subscription.quarterly");
      case "annual": return t("subscription.yr");
      default: return "";
    }
  };

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
          <Badge variant="secondary" className="bg-blue-200 dark:bg-blue-800">
            {t("admin.preview.demoData")}
          </Badge>
        </div>
      )}

      {/* Admin Viewing Banner */}
      {isAdminRole && memberIdParam && displayMember && (
        <div className="flex items-center gap-4 p-4 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/members")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("admin.preview.backToMembers")}
          </Button>
          <span className="text-sm text-amber-800 dark:text-amber-200">
            {t("admin.preview.viewingAsAdmin")} <strong>{displayMember.first_name} {displayMember.last_name}</strong>{t("admin.preview.dashboard")}
          </span>
        </div>
      )}

      {/* Welcome Section with Help Icons */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {memberLoading && !isTemplatePreview ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {t("dashboard.welcomeBack")}, {memberName}
            </h1>
          )}
          <p className="text-muted-foreground text-sm">{currentDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            size="icon" 
            variant="outline"
            className="h-10 w-10"
            title={t("dashboard.callUs")}
            asChild
          >
            <a href={`tel:${phoneForLink}`}>
              <Phone className="h-5 w-5" />
            </a>
          </Button>
          <Button 
            size="icon" 
            className="h-10 w-10 bg-[#25D366] hover:bg-[#128C7E] text-white"
            title={t("dashboard.whatsappUs")}
            asChild
          >
            <a href={`https://wa.me/${phoneForLink.replace("+", "")}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>

      {/* Device Status */}
      {deviceLoading && !isTemplatePreview ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : displayDevice ? (
        <DeviceStatusCard
          batteryLevel={displayDevice.battery_level || 0}
          isConnected={displayDevice.is_online === true}
          lastCheckIn={displayDevice.last_checkin_at ? new Date(displayDevice.last_checkin_at) : undefined}
          location={displayDevice.last_location_address || undefined}
        />
      ) : (
        <Card className="border-alert-battery/30 bg-alert-battery/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-alert-battery" />
            <div>
              <p className="font-medium">{t("dashboard.noDeviceAssigned") || "No device assigned"}</p>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.contactSupportDevice") || "Please contact support to get your device set up."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Quick Actions Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Subscription Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t("navigation.subscription") || "Subscription"}</CardTitle>
              {subLoading && !isTemplatePreview ? (
                <Skeleton className="h-5 w-16" />
              ) : displaySubscription ? (
                <Badge variant="outline" className="bg-alert-resolved/10 text-alert-resolved border-alert-resolved/30 text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {t("common.active") || "Active"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  {t("common.inactive") || "Inactive"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {subLoading && !isTemplatePreview ? (
              <>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </>
            ) : displaySubscription ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("common.plan") || "Plan"}</span>
                  <span className="font-medium">{formatPlanType(displaySubscription.plan_type)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("dashboard.nextPayment") || "Next Payment"}</span>
                  <span className="font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(displaySubscription.renewal_date), "dd MMM yyyy")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("common.amount") || "Amount"}</span>
                  <span className="font-medium">€{displaySubscription.amount}{formatBillingFrequency(displaySubscription.billing_frequency)}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("dashboard.noActiveSubscription") || "No active subscription"}</p>
            )}
            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link to="/dashboard/subscription">
                <CreditCard className="mr-2 h-4 w-4" />
                {t("dashboard.manageSubscription") || "Manage Subscription"}
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Emergency Contacts Summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t("navigation.emergencyContacts") || "Emergency Contacts"}</CardTitle>
              {(isTemplatePreview || (!contactsLoading && displayContacts && displayContacts.length > 0)) && (
                <Badge variant="secondary" className="text-xs">{displayContacts?.length || 0} {t("common.contacts") || "contacts"}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {contactsLoading && !isTemplatePreview ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : displayContacts && displayContacts.length > 0 ? (
              <div className="space-y-2">
                {displayContacts.slice(0, 2).map((contact, index) => (
                  <div key={contact.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <span className="font-medium text-sm block">{contact.contact_name}</span>
                      <span className="text-xs text-muted-foreground">{contact.relationship}</span>
                    </div>
                    {index === 0 ? (
                      <Badge variant="secondary" className="text-xs">{t("common.primary") || "Primary"}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">{index + 1}{t("common.ordinalSuffix") || "nd"}</Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <AlertTriangle className="h-8 w-8 text-alert-battery mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("dashboard.noEmergencyContacts") || "No emergency contacts added"}</p>
              </div>
            )}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/dashboard/contacts">
                {t("dashboard.updateContacts") || "Update Contacts"}
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Messages Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t("navigation.messages") || "Messages"}</CardTitle>
              {displayUnreadMsgs > 0 && (
                <Badge className="text-xs">{displayUnreadMsgs} {t("dashboard.unread", "unread")}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {displayUnreadMsgs > 0 ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Inbox className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{t("dashboard.unreadMessages", { count: displayUnreadMsgs, defaultValue: "{{count}} unread messages" })}</p>
                  <p className="text-xs text-muted-foreground">{t("dashboard.tapToRead", "Tap to read and reply")}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("dashboard.noNewMessages", "No new messages")}</p>
              </div>
            )}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/dashboard/messages">
                <MessageSquare className="mr-2 h-4 w-4" />
                {t("dashboard.viewMessages", "View Messages")}
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{displayAlertsCount || 0}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.alertsLast30Days") || "Alerts (30 days)"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-alert-resolved">{displayContacts?.length || 0}</p>
            <p className="text-xs text-muted-foreground">{t("common.contacts") || "Contacts"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{displayDevice?.battery_level || 0}%</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.batteryLevel") || "Battery"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <div className={`h-2 w-2 rounded-full ${displayDevice?.status === "active" ? "bg-alert-resolved" : "bg-muted-foreground"}`} />
              <p className="text-sm font-medium">{displayDevice?.status === "active" ? t("common.online") || "Online" : t("common.offline") || "Offline"}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("dashboard.deviceStatus") || "Device"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Announcements */}
      <Card className="border-alert-checkin/30 bg-alert-checkin/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-alert-checkin/20 flex items-center justify-center shrink-0">
              <span className="text-base">📢</span>
            </div>
            <div>
              <h3 className="font-semibold text-sm">{t("dashboard.serviceAnnouncement") || "Service Announcement"}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("dashboard.announcementText") || "We've upgraded our response system! Your alerts now reach our team 30% faster. Thank you for trusting ICE Alarm España with your safety."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}