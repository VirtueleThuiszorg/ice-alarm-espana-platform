import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, Plus, Trash2, Search, Bell, BellOff } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePartnerMembers, useAddPartnerMember, useRemovePartnerMember } from "@/hooks/usePartnerMembers";
import { usePartnerAlertSubscriptions, useCreateAlertSubscription, useDeleteAlertSubscription } from "@/hooks/usePartnerAlertSubscriptions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PartnerMembersTabProps {
  partnerId: string;
  partnerType: string;
  alertVisibilityEnabled: boolean;
}

const relationshipLabels: Record<string, string> = {
  resident: "Resident",
  client: "Client",
  beneficiary: "Beneficiary",
};

export function PartnerMembersTab({ partnerId, partnerType, alertVisibilityEnabled }: PartnerMembersTabProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [relationshipType, setRelationshipType] = useState<"resident" | "client" | "beneficiary">("resident");

  const { data: partnerMembers, isLoading } = usePartnerMembers(partnerId);
  const { subscriptions: alertSubscriptions } = usePartnerAlertSubscriptions(partnerId);
  const addMember = useAddPartnerMember();
  const removeMember = useRemovePartnerMember();
  const createAlertSub = useCreateAlertSubscription();
  const deleteAlertSub = useDeleteAlertSubscription();

  // Search members for adding
  const { data: searchResults } = useQuery({
    queryKey: ["member-search", memberSearchQuery],
    queryFn: async () => {
      if (!memberSearchQuery || memberSearchQuery.length < 2) return [];

      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, email, status")
        .or(`first_name.ilike.%${memberSearchQuery}%,last_name.ilike.%${memberSearchQuery}%,email.ilike.%${memberSearchQuery}%`)
        .eq("status", "active")
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: memberSearchQuery.length >= 2,
  });

  // Filter displayed members
  const filteredMembers = partnerMembers?.filter((pm) => {
    if (!searchQuery) return true;
    const member = pm.member;
    if (!member) return false;
    return (
      member.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Check if member has alert subscription
  const hasAlertSubscription = (memberId: string) => {
    return alertSubscriptions?.some((sub) => sub.member_id === memberId);
  };

  const handleAddMember = async () => {
    if (!selectedMemberId) return;

    try {
      await addMember.mutateAsync({
        partnerId,
        memberId: selectedMemberId,
        relationshipType,
      });
      toast.success("Member added successfully");
      setIsAddDialogOpen(false);
      setSelectedMemberId(null);
      setMemberSearchQuery("");
    } catch (error) {
      toast.error("Failed to add member");
    }
  };

  const handleRemoveMember = async (id: string) => {
    try {
      await removeMember.mutateAsync({ id, partnerId });
      toast.success("Member removed");
    } catch (error) {
      toast.error("Failed to remove member");
    }
  };

  const handleToggleAlertSubscription = async (memberId: string) => {
    const existingSub = alertSubscriptions?.find((sub) => sub.member_id === memberId);

    try {
      if (existingSub) {
        await deleteAlertSub.mutateAsync({ id: existingSub.id, partnerId });
        toast.success("Alert subscription removed");
      } else {
        await createAlertSub.mutateAsync({ partnerId, memberId });
        toast.success("Alert subscription created");
      }
    } catch (error) {
      toast.error("Failed to update alert subscription");
    }
  };

  if (partnerType === "referral") {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Member management is available for Care and Residential partners only.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Partner Members
              </CardTitle>
              <CardDescription>
                Members associated with this {partnerType === "care" ? "care partner" : "residential facility"}
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Member to Partner</DialogTitle>
                  <DialogDescription>
                    Search for an active member to associate with this partner
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Search Member</Label>
                    <Input
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="Type name or email..."
                    />
                  </div>

                  {searchResults && searchResults.length > 0 && (
                    <div className="border rounded-md max-h-48 overflow-y-auto">
                      {searchResults.map((member) => (
                        <div
                          key={member.id}
                          className={`p-3 cursor-pointer hover:bg-muted ${
                            selectedMemberId === member.id ? "bg-primary/10" : ""
                          }`}
                          onClick={() => setSelectedMemberId(member.id)}
                        >
                          <p className="font-medium">
                            {member.first_name} {member.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Relationship Type</Label>
                    <Select
                      value={relationshipType}
                      onValueChange={(v) => setRelationshipType(v as typeof relationshipType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resident">Resident</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="beneficiary">Beneficiary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddMember} disabled={!selectedMemberId || addMember.isPending}>
                    {addMember.isPending ? "Adding..." : "Add Member"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter members..."
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : filteredMembers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No members associated with this partner
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  {alertVisibilityEnabled && <TableHead>Alert Notifications</TableHead>}
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers?.map((pm) => (
                  <TableRow key={pm.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {pm.member?.first_name} {pm.member?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">{pm.member?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {relationshipLabels[pm.relationship_type] || pm.relationship_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          pm.member?.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }
                      >
                        {pm.member?.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(pm.added_at), "dd MMM yyyy")}
                    </TableCell>
                    {alertVisibilityEnabled && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleAlertSubscription(pm.member_id)}
                          disabled={createAlertSub.isPending || deleteAlertSub.isPending}
                        >
                          {hasAlertSubscription(pm.member_id) ? (
                            <>
                              <Bell className="h-4 w-4 mr-1 text-green-600" />
                              <span className="text-green-600">Subscribed</span>
                            </>
                          ) : (
                            <>
                              <BellOff className="h-4 w-4 mr-1 text-muted-foreground" />
                              <span className="text-muted-foreground">Not subscribed</span>
                            </>
                          )}
                        </Button>
                      </TableCell>
                    )}
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Member</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the association between this partner and the member.
                              The member's subscription and account will not be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveMember(pm.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
