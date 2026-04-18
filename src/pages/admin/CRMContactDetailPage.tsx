import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, User, Mail, Phone, MapPin, FileText, UserPlus, Loader2, Check, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface CRMContact {
  id: string;
  created_at: string;
  source: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email_primary: string | null;
  phone_primary: string | null;
  status: string | null;
  stage: string | null;
  referral_source: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  notes: string | null;
  tags: string[] | null;
  groups: string[] | null;
  linked_member_id: string | null;
}

interface ImportRow {
  id: string;
  batch_id: string;
  row_index: number;
  raw: unknown;
  import_status: string;
}

export default function CRMContactDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showConvert = searchParams.get("convert") === "true";

  const [contact, setContact] = useState<CRMContact | null>(null);
  const [importRow, setImportRow] = useState<ImportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(showConvert);

  // Conversion form
  const [convertForm, setConvertForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    addressLine1: "",
    city: "",
    province: "",
    postalCode: "",
    country: "Spain",
  });

  useEffect(() => {
    if (id) {
      fetchContact();
      fetchImportRow();
    }
  }, [id]);

  useEffect(() => {
    if (contact) {
      setConvertForm({
        firstName: contact.first_name || "",
        lastName: contact.last_name || "",
        email: contact.email_primary || "",
        phone: contact.phone_primary || "",
        dateOfBirth: "",
        addressLine1: contact.address_line_1 || "",
        city: contact.city || "",
        province: contact.province || "",
        postalCode: contact.postal_code || "",
        country: contact.country || "Spain",
      });
    }
  }, [contact]);

  const fetchContact = async () => {
    try {
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setContact(data);
    } catch (error) {
      console.error("Error fetching contact:", error);
      toast.error("Failed to load contact");
      navigate("/admin/crm-contacts");
    } finally {
      setLoading(false);
    }
  };

  const fetchImportRow = async () => {
    try {
      const { data, error } = await supabase
        .from("crm_import_rows")
        .select("*")
        .eq("imported_crm_contact_id", id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      setImportRow(data);
    } catch (error) {
      console.error("Error fetching import row:", error);
    }
  };

  const handleConvertToMember = async () => {
    if (!contact) return;

    // Validation
    if (!convertForm.firstName || !convertForm.lastName) {
      toast.error("First and last name are required");
      return;
    }
    if (!convertForm.dateOfBirth) {
      toast.error("Date of birth is required");
      return;
    }
    if (!convertForm.addressLine1 || !convertForm.city || !convertForm.postalCode) {
      toast.error("Address, city, and postal code are required");
      return;
    }
    if (!convertForm.email && !convertForm.phone) {
      toast.error("Email or phone is required");
      return;
    }

    setConverting(true);
    try {
      // Create member
      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({
          first_name: convertForm.firstName,
          last_name: convertForm.lastName,
          email: convertForm.email || `converted-${Date.now()}@placeholder.local`,
          phone: convertForm.phone || "N/A",
          date_of_birth: convertForm.dateOfBirth,
          address_line_1: convertForm.addressLine1,
          city: convertForm.city,
          province: convertForm.province || "N/A",
          postal_code: convertForm.postalCode,
          country: convertForm.country,
          status: "active",
        })
        .select()
        .single();

      if (memberError) throw memberError;

      // Create CRM profile
      await supabase.from("crm_profiles").insert({
        member_id: member.id,
        stage: contact.stage || null,
        status: contact.status || null,
        referral_source: contact.referral_source || null,
        tags: contact.tags || [],
        groups: contact.groups || [],
      });

      // Link CRM contact to member
      await supabase
        .from("crm_contacts")
        .update({ linked_member_id: member.id })
        .eq("id", contact.id);

      // Create note if notes exist
      if (contact.notes) {
        await supabase.from("member_notes").insert({
          member_id: member.id,
          content: `Imported from CRM:\n${contact.notes}`,
          note_type: "general",
        });
      }

      toast.success("Contact converted to member successfully!");
      setConvertDialogOpen(false);
      navigate(`/admin/members/${member.id}`);
    } catch (error) {
      console.error("Error converting to member:", error);
      toast.error("Failed to convert to member");
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Contact not found</p>
       <Button variant="link" onClick={() => navigate("/admin/crm-contacts")}>
           {t("adminCRM.backToContacts", "Back to CRM Contacts")}
         </Button>
      </div>
    );
  }

  const displayName =
    contact.full_name ||
    `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
    "Unknown Contact";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/crm-contacts")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{displayName}</h1>
            {contact.linked_member_id ? (
              <Badge variant="default" className="bg-green-600">
                Linked to Member
              </Badge>
            ) : (
              <Badge variant="outline">CRM Contact</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Source: {contact.source} · Created: {new Date(contact.created_at).toLocaleDateString()}
          </p>
        </div>
        {!contact.linked_member_id && (
          <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Convert to Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Convert to Member</DialogTitle>
                <DialogDescription>
                  Fill in the missing required fields to create a full member record.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={convertForm.firstName}
                      onChange={(e) =>
                        setConvertForm({ ...convertForm, firstName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={convertForm.lastName}
                      onChange={(e) =>
                        setConvertForm({ ...convertForm, lastName: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={convertForm.email}
                    onChange={(e) => setConvertForm({ ...convertForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={convertForm.phone}
                    onChange={(e) => setConvertForm({ ...convertForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={convertForm.dateOfBirth}
                    onChange={(e) =>
                      setConvertForm({ ...convertForm, dateOfBirth: e.target.value })
                    }
                  />
                </div>
                <Separator />
                <div>
                  <Label htmlFor="addressLine1">Address *</Label>
                  <Input
                    id="addressLine1"
                    value={convertForm.addressLine1}
                    onChange={(e) =>
                      setConvertForm({ ...convertForm, addressLine1: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={convertForm.city}
                      onChange={(e) => setConvertForm({ ...convertForm, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="province">Province</Label>
                    <Input
                      id="province"
                      value={convertForm.province}
                      onChange={(e) =>
                        setConvertForm({ ...convertForm, province: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="postalCode">Postal Code *</Label>
                    <Input
                      id="postalCode"
                      value={convertForm.postalCode}
                      onChange={(e) =>
                        setConvertForm({ ...convertForm, postalCode: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={convertForm.country}
                      onChange={(e) =>
                        setConvertForm({ ...convertForm, country: e.target.value })
                      }
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleConvertToMember}
                  disabled={converting}
                >
                  {converting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Create Member
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {contact.linked_member_id && (
          <Button variant="outline" onClick={() => navigate(`/admin/members/${contact.linked_member_id}`)}>
            <Link className="h-4 w-4 mr-2" />
            View Member
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">First Name</p>
                <p className="font-medium">{contact.first_name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Name</p>
                <p className="font-medium">{contact.last_name || "-"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {contact.email_primary || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {contact.phone_primary || "-"}
              </p>
            </div>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Address</p>
              <p className="font-medium flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                <span>
                  {contact.address_line_1 || "-"}
                  {contact.address_line_2 && <br />}
                  {contact.address_line_2}
                  {(contact.city || contact.province || contact.postal_code) && <br />}
                  {[contact.city, contact.province, contact.postal_code].filter(Boolean).join(", ")}
                  {contact.country && <br />}
                  {contact.country}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CRM Details */}
        <Card>
          <CardHeader>
            <CardTitle>CRM Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-medium">
                  {contact.status ? <Badge variant="outline">{contact.status}</Badge> : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stage</p>
                <p className="font-medium">
                  {contact.stage ? <Badge variant="secondary">{contact.stage}</Badge> : "-"}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Referral Source</p>
              <p className="font-medium">{contact.referral_source || "-"}</p>
            </div>
            {contact.tags && contact.tags.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag, i) => (
                    <Badge key={i} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {contact.groups && contact.groups.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Groups</p>
                <div className="flex flex-wrap gap-1">
                  {contact.groups.map((group, i) => (
                    <Badge key={i} variant="secondary">
                      {group}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {contact.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{contact.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Raw Import Data (Admin Only) */}
        {importRow && (
          <Card>
            <CardHeader>
              <CardTitle>Raw Import Data</CardTitle>
              <CardDescription>Original data from CSV import (admin view)</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-64 text-xs">
                {JSON.stringify(importRow.raw, null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                Batch ID: {importRow.batch_id} · Row: {importRow.row_index} · Status:{" "}
                {importRow.import_status}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
