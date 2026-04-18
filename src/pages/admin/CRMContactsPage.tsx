import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowLeft, ExternalLink, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface CRMContact {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email_primary: string | null;
  phone_primary: string | null;
  status: string | null;
  stage: string | null;
  referral_source: string | null;
  city: string | null;
  linked_member_id: string | null;
}

export default function CRMContactsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [linkedFilter, setLinkedFilter] = useState<string>("all");

  useEffect(() => {
    fetchContacts();
  }, [statusFilter, stageFilter, linkedFilter]);

  const fetchContacts = async () => {
    try {
      let query = supabase
        .from("crm_contacts")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (stageFilter !== "all") {
        query = query.eq("stage", stageFilter);
      }
      if (linkedFilter === "linked") {
        query = query.not("linked_member_id", "is", null);
      } else if (linkedFilter === "unlinked") {
        query = query.is("linked_member_id", null);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error("Failed to load CRM contacts");
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = contacts.filter((contact) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      contact.full_name?.toLowerCase().includes(searchLower) ||
      contact.first_name?.toLowerCase().includes(searchLower) ||
      contact.last_name?.toLowerCase().includes(searchLower) ||
      contact.email_primary?.toLowerCase().includes(searchLower) ||
      contact.phone_primary?.includes(searchLower)
    );
  });

  const getDisplayName = (contact: CRMContact) => {
    if (contact.full_name) return contact.full_name;
    if (contact.first_name || contact.last_name) {
      return `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
    }
    return "Unknown";
  };

  // Get unique statuses and stages for filters
  const uniqueStatuses = [...new Set(contacts.map((c) => c.status).filter(Boolean))] as string[];
  const uniqueStages = [...new Set(contacts.map((c) => c.stage).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
         <div className="flex-1">
           <h1 className="text-2xl font-bold">{t("adminCRM.title", "CRM Contacts")}</h1>
           <p className="text-muted-foreground">
             {t("adminCRM.subtitle", "Incomplete records from CRM import that need follow-up")}
           </p>
         </div>
        <Badge variant="secondary">{filteredContacts.length} contacts</Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {uniqueStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {uniqueStages.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={linkedFilter} onValueChange={setLinkedFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Link Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="linked">Linked to Member</SelectItem>
                <SelectItem value="unlinked">Not Linked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Referral Source</TableHead>
                <TableHead>Linked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No CRM contacts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">{getDisplayName(contact)}</TableCell>
                    <TableCell>{contact.email_primary || "-"}</TableCell>
                    <TableCell>{contact.phone_primary || "-"}</TableCell>
                    <TableCell>
                      {contact.status ? (
                        <Badge variant="outline">{contact.status}</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.stage ? (
                        <Badge variant="secondary">{contact.stage}</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{contact.referral_source || "-"}</TableCell>
                    <TableCell>
                      {contact.linked_member_id ? (
                        <Badge variant="default" className="bg-green-600">
                          Linked
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not Linked</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/crm-contacts/${contact.id}`)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {!contact.linked_member_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/admin/crm-contacts/${contact.id}?convert=true`)}
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
