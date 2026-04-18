import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminRole as checkAdminRole } from "@/config/constants";
import { usePartnerData } from "@/hooks/usePartnerData";
import { usePartnerMembers } from "@/hooks/usePartnerMembers";
import { usePartnerAlertSubscriptions } from "@/hooks/usePartnerAlertSubscriptions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Bell, Search, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function PartnerMembersPage() {
  const { isStaff, staffRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");

  // Admin view mode detection
  const isAdminRole = isStaff && checkAdminRole(staffRole);
  const partnerIdParam = searchParams.get("partnerId");
  const isAdminViewMode = isAdminRole && !!partnerIdParam;

  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminViewMode ? partnerIdParam : undefined
  );

  const partnerId = partner?.id;

  const { data: partnerMembers, isLoading: membersLoading } = usePartnerMembers(partnerId);
  const { 
    subscriptions, 
    toggleSubscription
  } = usePartnerAlertSubscriptions(partnerId);

  // Check if partner can access this page
  const canAccess = partner?.partner_type === "care" || partner?.partner_type === "residential";
  const isResidential = partner?.partner_type === "residential";
  const alertsEnabled = partner?.alert_visibility_enabled;

  // Filter members by search
  const filteredMembers = partnerMembers?.filter(pm => {
    const member = pm.member;
    const searchLower = searchQuery.toLowerCase();
    const fullName = member ? `${member.first_name} ${member.last_name}`.toLowerCase() : "";
    return (
      fullName.includes(searchLower) ||
      member?.email?.toLowerCase().includes(searchLower) ||
      member?.phone?.toLowerCase().includes(searchLower)
    );
  }) || [];

  // Get subscription status for a member
  const getMemberSubscription = (memberId: string) => {
    return subscriptions?.find(s => s.member_id === memberId);
  };

  // Handle alert subscription toggle
  const handleToggleAlerts = async (memberId: string, currentlySubscribed: boolean) => {
    if (!partnerId) return;
    
    try {
      await toggleSubscription.mutateAsync({
        partnerId,
        memberId,
        subscribe: !currentlySubscribed
      });
      toast.success(currentlySubscribed ? "Alert notifications disabled" : "Alert notifications enabled");
    } catch (error) {
      toast.error("Failed to update alert settings");
    }
  };

  // Export members to CSV
  const handleExport = () => {
    if (!filteredMembers.length) return;

    const headers = ["Name", "Email", "Phone", "Relationship", "Added Date", "Alert Notifications"];
    const rows = filteredMembers.map(pm => [
      pm.member ? `${pm.member.first_name} ${pm.member.last_name}` : "",
      pm.member?.email || "",
      pm.member?.phone || "",
      pm.relationship_type || "",
      pm.added_at ? format(new Date(pm.added_at), "yyyy-MM-dd") : "",
      getMemberSubscription(pm.member_id) ? "Yes" : "No"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `partner-members-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (partnerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Feature Not Available</h2>
          <p className="text-muted-foreground">
            Member management is only available for Care and Residential partners.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isResidential ? "Residents" : "Clients"}
          </h1>
          <p className="text-muted-foreground">
            {isResidential 
              ? "Manage your facility residents and alert notifications"
              : "View clients referred through your organization"
            }
          </p>
        </div>
        {filteredMembers.length > 0 && (
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total {isResidential ? "Residents" : "Clients"}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{partnerMembers?.length || 0}</div>
          </CardContent>
        </Card>

        {isResidential && alertsEnabled && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Alert Subscriptions</CardTitle>
                <Bell className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{subscriptions?.length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  receiving notifications
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Coverage</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {partnerMembers?.length 
                    ? Math.round((subscriptions?.length || 0) / partnerMembers.length * 100)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  of residents monitored
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isResidential ? "Resident List" : "Client List"}
          </CardTitle>
          <CardDescription>
            {isResidential 
              ? "Members associated with your facility"
              : "Members referred through your organization"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {membersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery 
                  ? "No members found matching your search"
                  : `No ${isResidential ? "residents" : "clients"} have been added yet`
                }
              </p>
              {!searchQuery && !isAdminViewMode && (
                <p className="text-sm text-muted-foreground mt-2">
                  Contact ICE Alarm to add members to your organization.
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Added</TableHead>
                  {isResidential && alertsEnabled && (
                    <TableHead>Alert Notifications</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((pm) => {
                  const member = pm.member;
                  const subscription = getMemberSubscription(pm.member_id);
                  const isSubscribed = !!subscription;

                  return (
                    <TableRow key={pm.id}>
                      <TableCell className="font-medium">
                        {member ? `${member.first_name} ${member.last_name}` : "Unknown"}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {member?.email && (
                            <div className="text-muted-foreground">{member.email}</div>
                          )}
                          {member?.phone && (
                            <div className="text-muted-foreground">{member.phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {pm.relationship_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {pm.added_at 
                          ? format(new Date(pm.added_at), "MMM d, yyyy")
                          : "-"
                        }
                      </TableCell>
                      {isResidential && alertsEnabled && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={isSubscribed}
                              onCheckedChange={() => handleToggleAlerts(pm.member_id, isSubscribed)}
                              disabled={toggleSubscription.isPending}
                            />
                            <span className="text-sm text-muted-foreground">
                              {isSubscribed ? "On" : "Off"}
                            </span>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
