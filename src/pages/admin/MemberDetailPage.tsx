import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
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

export default function MemberDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [member, setMember] = useState<Member | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");

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
      toast.error(t("adminMemberDetail.failedUpdate", "Failed to update member"));
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
        member={member as any}
        subscription={subscription}
        hasDevice={!!device}
        onEdit={() => setActiveTab("profile")}
        onSuspend={handleSuspend}
        onDelete={handleDelete}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
          <TabsTrigger value="profile">{t("adminMemberDetail.tabs.profile", "Profile")}</TabsTrigger>
          <TabsTrigger value="medical">{t("adminMemberDetail.tabs.medical", "Medical")}</TabsTrigger>
          <TabsTrigger value="contacts">{t("adminMemberDetail.tabs.contacts", "Contacts")}</TabsTrigger>
          <TabsTrigger value="device">{t("adminMemberDetail.tabs.device", "Device")}</TabsTrigger>
          <TabsTrigger value="subscription">{t("adminMemberDetail.tabs.subscription", "Subscription")}</TabsTrigger>
          <TabsTrigger value="payments">{t("adminMemberDetail.tabs.payments", "Payments")}</TabsTrigger>
          <TabsTrigger value="messages">{t("adminMemberDetail.tabs.messages", "Messages")}</TabsTrigger>
          <TabsTrigger value="notes">{t("adminMemberDetail.tabs.notes", "Notes")}</TabsTrigger>
          <TabsTrigger value="activity">{t("adminMemberDetail.tabs.activity", "Activity")}</TabsTrigger>
          <TabsTrigger value="alerts">{t("adminMemberDetail.tabs.alerts", "Alerts")}</TabsTrigger>
          <TabsTrigger value="tasks">{t("adminMemberDetail.tabs.tasks", "Tasks")}</TabsTrigger>
          <TabsTrigger value="crm">{t("adminMemberDetail.tabs.crm", "CRM")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab member={member} onUpdate={fetchMember} />
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
          <SubscriptionTab memberId={member.id} />
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
    </div>
  );
}
