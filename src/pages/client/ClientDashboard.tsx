import { Phone, MessageCircle, ArrowRight, Eye, ArrowLeft, MessageSquare, Inbox} from "lucide-react";
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

import { telHref, waNumber } from "@/lib/phone";
import { PageHeader } from "@/components/client/PageHeader";
import { ProtectionChecklist } from "@/components/client/ProtectionChecklist";
import { useMemberSubscriptions, useMemberAlerts } from "@/hooks/useMemberProfile";
import { useMemberUnread } from "@/hooks/useMemberUnread";
import { useMemberLastThread } from "@/hooks/useMemberLastThread";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
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
  // Null when settings_emergency_phone is unset; the call and WhatsApp buttons are rendered
  // conditionally on these rather than as controls that do nothing.
  const phoneHref = telHref(companySettings.emergency_phone);
  const whatsappNumber = waNumber(companySettings.emergency_phone);

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

  /*
    ONE definition of "the active subscription", shared with the Membership page.

    This was a local `.eq("status","active")` query — a second copy of that filter, and one that
    could only ever see the active row. The protection checklist needs the LATEST subscription of
    any status too, because "paused" and "never joined" are different things to say to a member
    (see `membershipCondition.ts`). `useMemberSubscriptions` answers both from one read.
  */
  const { data: subscriptions } = useMemberSubscriptions(
    isTemplatePreview ? null : effectiveMemberId,
  );
  const subscription = subscriptions?.active ?? null;

  /*
    Readiness, the derived view — the same row the header notice and the staff queue read.

    It is here for two reasons. The checklist's contacts and pendant rungs need it, and the
    contacts COUNT on this page was wrong: the `emergency_contacts` query below is `.limit(3)`,
    so a member with five contacts was shown "3 contacts". `emergency_contact_count` is the
    count, not the length of a page of rows.
  */
  const { data: readiness, isLoading: readinessLoading } = useQuery({
    queryKey: ["member-readiness", effectiveMemberId],
    queryFn: async () => {
      if (!effectiveMemberId) return null;
      const { data, error } = await supabase
        .from("member_monitoring_readiness")
        .select("monitoring_ready, emergency_contact_count, device_tested_at")
        .eq("member_id", effectiveMemberId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveMemberId && !isTemplatePreview,
  });

  /*
    THE `emergency_contacts` READ IS GONE FROM THIS PAGE.

    It was `.limit(3)`, used for two things: two contact-name cards (now the contacts rung, which
    says whether we have anybody rather than listing them) and a "N contacts" number that could
    never exceed three. The readiness view already carries the count, so this page now makes one
    fewer round trip and reports the right number.
  */

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

  // One definition of "unread", shared with the nav badge. It was inline here, so nothing else
  // could reach it — which is why the nav had no badge to put a count on.
  const { data: unreadMsgCount } = useMemberUnread(isTemplatePreview ? null : effectiveMemberId);
  // M23: the card said "2 unread messages" — how much is waiting, and nothing about what it is.
  const { data: lastThread } = useMemberLastThread(isTemplatePreview ? null : effectiveMemberId);

  // The last few alerts, for "Recent activity". Same override as the subscription read, for the
  // same admin-preview reason.
  const { data: recentAlerts } = useMemberAlerts(isTemplatePreview ? null : effectiveMemberId);

  // Use mock data in template preview mode
  const displayMember = isTemplatePreview ? MOCK_MEMBER : member;
  const displayDevice = isTemplatePreview ? MOCK_DEVICE : device;
  const displayAlertsCount = isTemplatePreview ? 2 : alertsCount;
  const displayUnreadMsgs = isTemplatePreview ? 3 : (unreadMsgCount || 0);
  const displayRecentAlerts = isTemplatePreview ? [] : (recentAlerts ?? []);
  /*
    THE COUNT, not the length of a page of rows.

    `contacts` above is `.limit(3)`, so `displayContacts.length` maxes out at three and a member
    with five was shown "3 contacts" — an undercount on the one number that says how many people
    we can reach. `emergency_contact_count` comes from the readiness view and is the count.
    `null` when the row could not be read, and rendered as an em dash rather than a zero: on this
    page a zero means "nobody is coming".
  */
  const contactCount = isTemplatePreview
    ? MOCK_CONTACTS.length
    : (readiness?.emergency_contact_count ?? null);

  const dateLocale = i18n.language === 'es' ? es : enGB;
  const currentDate = format(new Date(), 'EEEE, d MMMM yyyy', { locale: dateLocale });

  const memberName = displayMember?.first_name || t("common.member");



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

      {/*
        R3: the greeting and the date stay in PAGE CONTENT, not in the app header — that is
        where the readiness notice goes. But it is still this page's title, so it goes through
        the same shell as every other page rather than being the one hand-rolled header left.

        The skeleton keeps its place as the TITLE, so the page does not reflow when the name
        arrives: a heading that appears late pushes everything below it down, and on this page
        that is the protection checklist a member is reading.
      */}
      <PageHeader
        title={
          memberLoading && !isTemplatePreview ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            <>
              {t("dashboard.welcomeBack")}, {memberName}
            </>
          )
        }
        subtitle={currentDate}
        action={
          <div className="flex items-center gap-2">
          {phoneHref && (
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10"
              title={t("dashboard.callUs")}
              asChild
            >
              <a href={phoneHref}>
                <Phone className="h-5 w-5" />
              </a>
            </Button>
          )}
          {whatsappNumber && (
            /*
              THE LAST RAW HEX ON THE DASHBOARD. `bg-[#25D366] hover:bg-[#128C7E] text-white`
              is WhatsApp's brand green, outside the token system — and white on #25D366 is
              2.1:1, below WCAG AA for text of any size, so it failed the bar GOALS.md sets
              while looking deliberate. `DevicePage` lost the same two in #324; this is the
              other place they were.

              Outline, like every other icon control in this header. The WhatsApp glyph is what
              identifies it, not the colour.
            */
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10"
              title={t("dashboard.whatsappUs")}
              asChild
            >
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-5 w-5" />
              </a>
            </Button>
          )}
          </div>
        }
      />

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
        /*
          NOTHING, deliberately, and the checklist below says it instead.

          This branch was a card reading "No device assigned / Please contact support to get your
          device set up." — R6's banned sentence, and a card that tells a member what is missing
          without telling them whether it is on its way, whether they chose a phone-only plan, or
          what happens next. The pendant rung answers all three. Two notices about the same
          absence, one of them a dead end, is worse than one that works.
        */
        null
      )}


      {/*
        "YOUR PROTECTION" — WP4's checklist, replacing the Subscription and Emergency-contacts
        cards that were here.

        Those two were small dashboards of their own: a plan name, a renewal date, an amount, two
        contact names with ordinal badges. All true, and none of it the question a member opens
        this page to ask, which is "if I press it, will somebody come?" That has three parts, and
        the member has to be able to see which one is missing.

        Reasoning for the five states — and for why a pendant on its way is NOT "action needed",
        and a phone-only plan is not a fault — is in `src/lib/protectionChecklist.ts`.
      */}
      <ProtectionChecklist
        input={
          isTemplatePreview
            ? {
                latestSubscription: MOCK_SUBSCRIPTION,
                hasPendant: true,
                device: MOCK_DEVICE,
                readiness: { emergency_contact_count: MOCK_CONTACTS.length, device_tested_at: null },
              }
            : {
                latestSubscription: subscriptions?.latest,
                hasPendant: subscription?.has_pendant,
                device,
                readiness,
              }
        }
      />

      {/*
        RECENT ACTIVITY — and its empty state is the reassuring one.

        WP4: *"Recent activity (empty = 'No alerts')."* For most members most of the time this
        list is empty, and that is the good outcome — so the empty state says so plainly rather
        than apologising for having nothing to show.
      */}
      <Card data-testid="recent-activity">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {t("dashboard.recentActivity", "Recent activity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentAlerts === undefined && !isTemplatePreview ? (
            <Skeleton className="h-12 w-full" />
          ) : displayRecentAlerts.length === 0 ? (
            <p className="text-base text-muted-foreground" data-testid="recent-activity-empty">
              {t("dashboard.noAlerts", "No alerts. Nothing has happened, which is the idea.")}
            </p>
          ) : (
            <ul className="space-y-2">
              {displayRecentAlerts.slice(0, 3).map((alert) => (
                <li
                  key={alert.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3"
                >
                  <span className="min-w-0 truncate text-base">
                    {t(`alerts.type.${alert.alert_type}`, alert.alert_type)}
                  </span>
                  <span className="shrink-0 text-[0.8125rem] text-muted-foreground">
                    {format(new Date(alert.received_at), "dd MMM yyyy")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
            <Link to="/dashboard/alerts">
              {t("dashboard.viewAllAlerts", "See your alert history")}
              <ArrowRight className="ml-auto h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {/* Messages Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t("navigation.messages")}</CardTitle>
              {displayUnreadMsgs > 0 && (
                /* Ink, matching the nav badge — R1 rations red to the page's one action, and a
                   count is not one. Two different colours for the same number, on two surfaces a
                   member sees together, is two conventions to learn. */
                <Badge className="bg-foreground text-background text-xs">
                  {displayUnreadMsgs} {t("dashboard.unread", "unread")}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastThread ? (
              /*
                M23 — the LAST THREAD, not a number. What it is about is what decides whether a
                member opens it, and the count alone never said. The unread badge above still
                carries "how much"; this line carries "what".
              */
              <div
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  displayUnreadMsgs > 0 ? "bg-primary/5 border-primary/10" : "bg-muted/50 border-transparent",
                )}
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Inbox className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {lastThread.subject || t("dashboard.yourConversation", "Your conversation")}
                  </p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{lastThread.preview.text}</p>
                  {lastThread.preview.at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(lastThread.preview.at), { addSuffix: true })}
                    </p>
                  )}
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

      {/*
        QUICK STATS — NOT SHOWN AT ALL TO A MEMBER WITH NO DEVICE.

        WP4 says so in as many words: *"No stat tiles for a member with no device."* Two of the
        four are about the pendant, and with no pendant they read "0%" battery and "Offline" —
        which is not a zero, it is a fact about a device that does not exist. On a page whose
        subject is whether an alarm works, that is false precision at best and quietly alarming
        at worst.

        Still gated on loading as well: rendering "0 alerts / Offline" mid-fetch is false
        reassurance on a safety dashboard.
      */}
      {!isTemplatePreview && !deviceLoading && !displayDevice ? null : (deviceLoading || readinessLoading) && !isTemplatePreview ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-16 mx-auto mb-2" />
                <Skeleton className="h-3 w-24 mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{displayAlertsCount || 0}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.alertsLast30Days")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            {/* The count from the readiness view, not the length of a `.limit(3)` page. An em
                dash rather than 0 when it cannot be read: a zero here means nobody is coming. */}
            <p className="text-2xl font-bold text-alert-resolved" data-testid="stat-contact-count">
              {contactCount ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">{t("common.contacts")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{displayDevice?.battery_level || 0}%</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.batteryLevel")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              {/* is_online is the real connectivity signal — status covers
                  allocation states (allocated/with_staff/live/active), so a
                  live online pendant used to read "Offline" here */}
              <div className={`h-2 w-2 rounded-full ${displayDevice?.is_online ? "bg-alert-resolved" : "bg-muted-foreground"}`} />
              <p className="text-sm font-medium">{displayDevice?.is_online ? t("common.online") : t("common.offline")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("dashboard.deviceStatus")}</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/*
        THE SERVICE ANNOUNCEMENT IS GONE. D10: "Company announcements go in the bell, never in
        page content."

        It was a permanent card at the bottom of Home carrying one hardcoded string — the same
        sentence every day, for every member, forever. A notice that never changes is furniture,
        and furniture at the bottom of the page a member checks their alarm on is furniture in
        the way. The bell is where something that actually changes belongs, and it already
        exists (`NotificationBell`).
      */}
    </div>
  );
}