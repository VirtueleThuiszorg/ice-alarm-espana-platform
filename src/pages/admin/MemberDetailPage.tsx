import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MEMBER_TAB_LIST_CLASS,
  MEMBER_TAB_TRIGGER_CLASS,
} from "@/components/admin/member-detail/memberRecordTabs";
import { MemberHeader } from "@/components/admin/member-detail/MemberHeader";
import { ProfileTab } from "@/components/admin/member-detail/ProfileTab";
import { MedicalTab } from "@/components/admin/member-detail/MedicalTab";
import { ContactsTab } from "@/components/admin/member-detail/ContactsTab";
import { DeviceTab } from "@/components/admin/member-detail/DeviceTab";
import { SubscriptionTab } from "@/components/admin/member-detail/SubscriptionTab";
import { PaymentsTab } from "@/components/admin/member-detail/PaymentsTab";
import { MessagesTab } from "@/components/admin/member-detail/MessagesTab";
import { NotesTab } from "@/components/admin/member-detail/NotesTab";
import { ActivityTab } from "@/components/admin/member-detail/ActivityTab";
import { AlertsTab } from "@/components/admin/member-detail/AlertsTab";
import { TasksTab } from "@/components/admin/member-detail/TasksTab";
import { CRMTab } from "@/components/admin/member-detail/CRMTab";
import { dbMessage } from "@/lib/dbMessage";
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
} from "@/components/UnsavedChanges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  /** Who bills them: stripe, legacy (imported, paid outside Stripe) or none. */
  billing_source: string | null;
  photo_url: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  preferred_language: string | null;
  date_of_birth: string | null;
  nie_dni: string | null;
  special_instructions: string | null;
}

interface Subscription {
  id: string;
  plan_type: string;
  has_pendant: boolean | null;
  status: string;
}

interface Device {
  id: string;
}

// Must match the values used in this page's TabsList.
const TAB_VALUES = [
  "profile",
  "medical",
  "contacts",
  "device",
  "subscription",
  "payments",
  "messages",
  "notes",
  "activity",
  "alerts",
  "tasks",
  "crm",
] as const;

/**
 * THE PROVIDER SITS OUTSIDE THE PAGE, not inside it: the cards register from within the tabs,
 * and the guard reads the registry when a trigger is clicked. Both need the same context, and
 * the trigger is rendered by this page.
 */
export default function MemberDetailPage() {
  return (
    <UnsavedChangesProvider>
      <MemberRecord />
    </UnsavedChangesProvider>
  );
}

function MemberRecord() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [member, setMember] = useState<Member | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /*
    The header's Edit button switches to the Profile tab AND opens its card. Switching alone
    left the operator looking at a locked card, having pressed a button that says Edit.
  */
  const [profileEditSignal, setProfileEditSignal] = useState(0);
  /*
    A tab click while a card is mid-edit. Radix unmounts the panel, so switching IS the data
    loss — the confirm is the only thing between a half-typed address and nothing.
  */
  const unsaved = useUnsavedChanges();
  const [pendingTab, setPendingTab] = useState<string | null>(null);

  const requestTab = (next: string) => {
    if (unsaved?.hasUnsaved()) setPendingTab(next);
    else setActiveTab(next);
  };
  // Honour deep links like ?tab=messages (e.g. MembersPage "Send message"),
  // read once on mount; invalid values fall back to the profile tab.
  const [activeTab, setActiveTab] = useState<string>(() => {
    const requested = searchParams.get("tab");
    return requested && (TAB_VALUES as readonly string[]).includes(requested)
      ? requested
      : "profile";
  });

  // Determine if we're in call-centre or admin context
  const isCallCentre = location.pathname.startsWith('/call-centre');
  const backPath = isCallCentre ? '/call-centre/members' : '/admin/members';

  useEffect(() => {
    if (id) {
      fetchMember();
      fetchSubscription();
      fetchDevice();
    }
  }, [id]);

  const fetchMember = async () => {
    try {
      const { data, error } = await supabase
        .from("members")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setMember(data as unknown as Member);
    } catch (error) {
      console.error("Error fetching member:", error);
      toast.error(t("adminMemberDetail.failedLoad", "Failed to load member"));
      navigate(backPath);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, plan_type, has_pendant, status")
        .eq("member_id", id)
        .eq("status", "active")
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      setSubscription(data as Subscription | null);
    } catch (error) {
      console.error("Error fetching subscription:", error);
    }
  };

  const fetchDevice = async () => {
    try {
      const { data, error } = await supabase
        .from("devices")
        .select("id")
        .eq("member_id", id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      setDevice(data);
    } catch (error) {
      console.error("Error fetching device:", error);
    }
  };

  const handleSuspend = async () => {
    if (!member) return;
    try {
      const { error } = await supabase
        .from("members")
        .update({ status: member.status === "suspended" ? "active" : "suspended" })
        .eq("id", member.id);

      if (error) throw error;
      toast.success(t("adminMemberDetail.memberUpdated", `Member ${member.status === "suspended" ? "activated" : "suspended"}`));
      fetchMember();
    } catch (error) {
      console.error("Error updating member:", error);
      /*
        SHOW WHAT THE DATABASE SAID, not a generic failure.

        Since 20260909110000 the guard trigger refuses `status = 'active'` for a member with no
        active or past_due subscription, and its message names the remedy: "activation is the
        payment webhook's job — send them a payment link instead". A staff member reinstating an
        unpaid member needs to read that sentence; "Failed to update member" sends them to look
        for a bug that is not there.
      */
      toast.error(dbMessage(error, t("adminMemberDetail.failedUpdate", "Failed to update member")));
    }
  };

  const handleDelete = async () => {
    if (!member) return;
    try {
      const { error } = await supabase
        .from("members")
        .delete()
        .eq("id", member.id);

      if (error) throw error;
      toast.success(t("adminMemberDetail.memberDeleted", "Member deleted"));
      navigate(backPath);
    } catch (error) {
      console.error("Error deleting member:", error);
      toast.error(t("adminMemberDetail.failedDelete", "Failed to delete member"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("adminMemberDetail.notFound", "Member not found")}</p>
        <Button variant="link" onClick={() => navigate(backPath)}>
          {t("adminMemberDetail.backToMembers", "Back to Members")}
        </Button>
      </div>
    );
  }

  const memberName = `${member.first_name} ${member.last_name}`;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate(backPath)} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("adminMemberDetail.backToMembers", "Back to Members")}
      </Button>

      {/* Member Header */}
      <MemberHeader
        member={member}
        subscription={subscription}
        hasDevice={!!device}
        onEdit={() => {
          setActiveTab("profile");
          setProfileEditSignal((n) => n + 1);
        }}
        onSuspend={handleSuspend}
        onDelete={handleDelete}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={requestTab} className="space-y-4">
        {/* A quiet segmented bar, scoped to this page — see memberRecordTabs.ts for why the
            global <Tabs> component is not touched, and why red is now one underline rather
            than twelve rectangles. */}
        <TabsList className={MEMBER_TAB_LIST_CLASS}>
          <TabsTrigger value="profile" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.profile", "Profile")}</TabsTrigger>
          <TabsTrigger value="medical" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.medical", "Medical")}</TabsTrigger>
          <TabsTrigger value="contacts" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.contacts", "Contacts")}</TabsTrigger>
          <TabsTrigger value="device" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.device", "Device")}</TabsTrigger>
          <TabsTrigger value="subscription" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.subscription", "Subscription")}</TabsTrigger>
          <TabsTrigger value="payments" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.payments", "Payments")}</TabsTrigger>
          <TabsTrigger value="messages" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.messages", "Messages")}</TabsTrigger>
          <TabsTrigger value="notes" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.notes", "Notes")}</TabsTrigger>
          <TabsTrigger value="activity" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.activity", "Activity")}</TabsTrigger>
          <TabsTrigger value="alerts" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.alerts", "Alerts")}</TabsTrigger>
          <TabsTrigger value="tasks" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.tasks", "Tasks")}</TabsTrigger>
          <TabsTrigger value="crm" className={MEMBER_TAB_TRIGGER_CLASS}>{t("adminMemberDetail.tabs.crm", "CRM")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab member={member} onUpdate={fetchMember} editSignal={profileEditSignal} />
        </TabsContent>

        <TabsContent value="medical">
          <MedicalTab memberId={member.id} />
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTab memberId={member.id} />
        </TabsContent>

        <TabsContent value="device">
          <DeviceTab memberId={member.id} />
        </TabsContent>

        <TabsContent value="subscription">
          <SubscriptionTab
            memberId={member.id}
            memberName={`${member.first_name} ${member.last_name}`}
            memberStatus={member.status}
            billingSource={member.billing_source}
          />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsTab memberId={member.id} />
        </TabsContent>

        <TabsContent value="messages">
          <MessagesTab memberId={member.id} memberName={memberName} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesTab memberId={member.id} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab memberId={member.id} />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsTab memberId={member.id} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab memberId={member.id} />
        </TabsContent>

        <TabsContent value="crm">
          <CRMTab memberId={member.id} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={pendingTab !== null} onOpenChange={(open) => !open && setPendingTab(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("adminMemberDetail.leaveTabTitle", "Leave this tab without saving?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "adminMemberDetail.leaveTabBody",
                "You are part-way through editing a card here. Moving to another tab closes it and loses what you have typed.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("adminMemberDetail.edit.keepEditing", "Keep editing")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="leave-tab-confirm"
              onClick={() => {
                if (pendingTab) setActiveTab(pendingTab);
                setPendingTab(null);
              }}
            >
              {t("adminMemberDetail.leaveTab", "Leave and discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
