import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Send, RotateCcw, XCircle, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStaffMember } from "@/hooks/useStaffMembers";
import { useStaffInvite, useSendInvite, useRevokeInvite } from "@/hooks/useStaffInvites";
import { StaffDetailHeader } from "@/components/admin/staff/StaffDetailHeader";
import { StaffOverviewTab } from "@/components/admin/staff/StaffOverviewTab";
import { StaffDocumentsTab } from "@/components/admin/staff/StaffDocumentsTab";
import { StaffActivityTab } from "@/components/admin/staff/StaffActivityTab";
import { StaffFormPanel } from "@/components/admin/staff/StaffFormPanel";

function formatTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();

  if (diff <= 0) return "Expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
}

export default function StaffDetailPage() {
  const { staffId = "" } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const { data: staff, isLoading } = useStaffMember(staffId);
  const { data: invite, isLoading: inviteLoading } = useStaffInvite(staffId);
  const sendInvite = useSendInvite();
  const revokeInvite = useRevokeInvite();
  const [activeTab, setActiveTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Staff member not found</p>
        <Button variant="link" onClick={() => navigate("/admin/staff")}>
          Back to Staff
        </Button>
      </div>
    );
  }

  const isPending = staff.status === "pending";
  const hasActiveInvite = invite?.status === "pending" && new Date(invite.expires_at) > new Date();
  const hasExpiredInvite = invite && (invite.status === "expired" || (invite.status === "pending" && new Date(invite.expires_at) <= new Date()));

  return (
    <div className="space-y-6">
      <StaffDetailHeader staff={staff} onEdit={() => setEditOpen(true)} />

      {/* Invite Banner for pending staff */}
      {isPending && !inviteLoading && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                {hasActiveInvite ? (
                  <>
                    <Clock className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-medium text-sm">Invitation Pending</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRemaining(invite!.expires_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
                      Invite Sent
                    </Badge>
                  </>
                ) : hasExpiredInvite ? (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="font-medium text-sm">Invitation Expired</p>
                      <p className="text-xs text-muted-foreground">
                        Send a new invitation to this staff member
                      </p>
                    </div>
                    <Badge variant="outline" className="border-red-300 text-red-700 dark:text-red-400">
                      Expired
                    </Badge>
                  </>
                ) : invite?.status === "completed" ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <p className="font-medium text-sm">Invitation Completed</p>
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-medium text-sm">No Invitation Sent</p>
                      <p className="text-xs text-muted-foreground">
                        Send an invitation so this staff member can set up their account
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                {hasActiveInvite && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => revokeInvite.mutate({ inviteId: invite!.id, staffId: staff.id })}
                    disabled={revokeInvite.isPending}
                  >
                    {revokeInvite.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1" />
                    )}
                    Revoke
                  </Button>
                )}

                {hasActiveInvite ? (
                  <Button
                    size="sm"
                    onClick={() => sendInvite.mutate(staff.id)}
                    disabled={sendInvite.isPending}
                  >
                    {sendInvite.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-1" />
                    )}
                    Resend Invite
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => sendInvite.mutate(staff.id)}
                    disabled={sendInvite.isPending}
                  >
                    {sendInvite.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Send Invite
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <StaffOverviewTab staff={staff} />
        </TabsContent>

        <TabsContent value="documents">
          <StaffDocumentsTab staffId={staff.id} />
        </TabsContent>

        <TabsContent value="activity">
          <StaffActivityTab staffId={staff.id} />
        </TabsContent>
      </Tabs>

      <StaffFormPanel
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        staffMember={staff}
      />
    </div>
  );
}
