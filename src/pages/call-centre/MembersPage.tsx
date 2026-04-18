import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Phone, MessageSquare, Eye, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  preferred_language: string;
  subscription?: {
    plan_type: string;
    status: string;
  };
  device?: {
    status: string;
    device_type: string;
    is_online: boolean;
  };
}

export default function MembersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('members')
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        status,
        preferred_language,
        subscriptions(plan_type, status),
        devices(status, device_type, is_online)
      `)
      .order('last_name', { ascending: true });

    if (!error && data) {
      const formattedMembers = data.map((member: any) => ({
        ...member,
        subscription: member.subscriptions?.[0] || null,
        device: member.devices?.[0] || null
      }));
      setMembers(formattedMembers);
    }
    setLoading(false);
  };

  const filteredMembers = members.filter((member) => {
    const matchesSearch = 
      member.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.phone.includes(searchQuery);
    
    const matchesStatus = statusFilter === "all" || member.status === statusFilter;
    const matchesPlan = planFilter === "all" || member.subscription?.plan_type === planFilter;

    return matchesSearch && matchesStatus && matchesPlan;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-status-active/20 text-status-active border-status-active/30">{t("common.active", "Active")}</Badge>;
      case 'inactive':
        return <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>;
      case 'suspended':
        return <Badge variant="destructive">{t("common.suspended", "Suspended")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleCall = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${phone}`;
  };

  const handleMessage = (memberId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/call-centre/members/${memberId}?tab=messages`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("navigation.members")}</h1>
          <p className="text-muted-foreground">{t("callCentre.members.subtitle", "Browse and manage member profiles")}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("callCentre.members.searchPlaceholder", "Search by name, phone, or email...")}
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("callCentre.members.allStatus", "All Status")}</SelectItem>
                  <SelectItem value="active">{t("common.active", "Active")}</SelectItem>
                  <SelectItem value="inactive">{t("common.inactive", "Inactive")}</SelectItem>
                  <SelectItem value="suspended">{t("common.suspended", "Suspended")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("callCentre.members.allPlans", "All Plans")}</SelectItem>
                  <SelectItem value="single">{t("common.single", "Single")}</SelectItem>
                  <SelectItem value="couple">{t("common.couple", "Couple")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">{t("callCentre.members.loading", "Loading members...")}</div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-2" />
              <p>{t("callCentre.members.noMembers", "No members found")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name", "Name")}</TableHead>
                  <TableHead>{t("common.phone", "Phone")}</TableHead>
                  <TableHead>{t("callCentre.members.plan", "Plan")}</TableHead>
                  <TableHead>{t("common.status", "Status")}</TableHead>
                  <TableHead>{t("callCentre.members.device", "Device")}</TableHead>
                  <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow 
                    key={member.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/call-centre/members/${member.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{member.first_name} {member.last_name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{member.phone}</TableCell>
                    <TableCell>
                      {member.subscription ? (
                        <Badge variant="outline" className="capitalize">
                          {member.subscription.plan_type}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(member.status)}</TableCell>
                    <TableCell>
                      {member.device ? (
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={member.device.is_online ? 'default' : 'secondary'}
                            className="capitalize"
                          >
                            {member.device.is_online ? t("common.online", "Online") : t("common.offline", "Offline")}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t("callCentre.members.noDevice", "No device")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => handleCall(member.phone, e)}
                          title="Call member"
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => handleMessage(member.id, e)}
                          title="Send message"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); navigate(`/call-centre/members/${member.id}`); }}
                          title="View profile"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
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
