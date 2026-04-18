import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Send, Loader2, Check, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MemberData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  nie_dni: string | null;
  address_line_2: string | null;
  preferred_language: string | null;
}

interface MedicalData {
  blood_type: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  hospital_preference: string | null;
  allergies: string[] | null;
  medications: string[] | null;
}

interface EmergencyContact {
  id: string;
  contact_name: string;
  email: string | null;
}

interface MemberUpdateRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberData;
}

interface MissingField {
  key: string;
  label: string;
  category: "profile" | "medical" | "contacts";
}

export function MemberUpdateRequestModal({ open, onOpenChange, member }: MemberUpdateRequestModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [_medicalData, setMedicalData] = useState<MedicalData | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [recipientEmail, setRecipientEmail] = useState(member.email);

  useEffect(() => {
    if (open) {
      fetchMemberData();
    }
  }, [open, member.id]);

  const fetchMemberData = async () => {
    setLoading(true);
    try {
      // Fetch medical info
      const { data: medical } = await supabase
        .from("medical_information")
        .select("blood_type, doctor_name, doctor_phone, hospital_preference, allergies, medications")
        .eq("member_id", member.id)
        .maybeSingle();
      setMedicalData(medical);

      // Fetch emergency contacts
      const { data: contactsData } = await supabase
        .from("emergency_contacts")
        .select("id, contact_name, email")
        .eq("member_id", member.id)
        .order("priority_order");
      setContacts(contactsData || []);

      // Detect missing fields
      const missing: MissingField[] = [];

      // Profile fields
      if (!member.nie_dni) missing.push({ key: "nie_dni", label: t("common.nieDni", "NIE/DNI"), category: "profile" });

      // Medical fields
      if (!medical?.blood_type) missing.push({ key: "blood_type", label: t("medical.bloodType", "Blood Type"), category: "medical" });
      if (!medical?.doctor_name) missing.push({ key: "doctor_name", label: t("medical.doctorName", "Doctor Name"), category: "medical" });
      if (!medical?.doctor_phone) missing.push({ key: "doctor_phone", label: t("medical.doctorPhone", "Doctor Phone"), category: "medical" });
      if (!medical?.hospital_preference) missing.push({ key: "hospital_preference", label: t("medical.hospitalPreference", "Hospital Preference"), category: "medical" });
      if (!medical?.allergies || medical.allergies.length === 0) missing.push({ key: "allergies", label: t("medical.allergies", "Allergies"), category: "medical" });
      if (!medical?.medications || medical.medications.length === 0) missing.push({ key: "medications", label: t("medical.medications", "Medications"), category: "medical" });

      // Emergency contacts
      if ((contactsData?.length || 0) < 2) missing.push({ key: "contacts_count", label: t("crm.lessThan2Contacts", "Less than 2 emergency contacts"), category: "contacts" });
      const contactsMissingEmail = contactsData?.filter(c => !c.email) || [];
      if (contactsMissingEmail.length > 0) missing.push({ key: "contacts_email", label: t("crm.contactsMissingEmail", "Emergency contacts missing email"), category: "contacts" });

      setMissingFields(missing);
      setSelectedFields(missing.map(f => f.key));
    } catch (error) {
      console.error("Error fetching member data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!recipientEmail || selectedFields.length === 0) {
      toast.error(t("crm.selectFieldsAndEmail", "Please select at least one field and an email"));
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-member-update-request", {
        body: {
          memberId: member.id,
          recipientEmail,
          requestedFields: selectedFields,
          memberName: `${member.first_name} ${member.last_name}`,
          preferredLanguage: member.preferred_language || "en",
        },
      });

      if (error) throw error;

      toast.success(t("crm.updateRequestSent", "Update request sent successfully"));
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sending update request:", error);
      toast.error(t("crm.updateRequestFailed", "Failed to send update request"));
    } finally {
      setSending(false);
    }
  };

  const toggleField = (fieldKey: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldKey)
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "profile": return "bg-blue-100 text-blue-800";
      case "medical": return "bg-red-100 text-red-800";
      case "contacts": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {t("crm.requestMemberUpdate", "Request Member Update")}
          </DialogTitle>
          <DialogDescription>
            {t("crm.requestUpdateDescription", "Send an email to the member with a link to update their missing information.")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : missingFields.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Check className="h-12 w-12 text-green-500 mb-4" />
            <p className="font-medium">{t("crm.noMissingFields", "No missing fields detected")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("crm.allFieldsComplete", "This member's profile appears to be complete.")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Missing Fields */}
            <div>
              <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                {t("crm.missingFields", "Missing Fields Detected")} ({missingFields.length})
              </Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {missingFields.map(field => (
                  <div key={field.key} className="flex items-center gap-2">
                    <Checkbox
                      id={field.key}
                      checked={selectedFields.includes(field.key)}
                      onCheckedChange={() => toggleField(field.key)}
                    />
                    <label htmlFor={field.key} className="text-sm flex-1 cursor-pointer">
                      {field.label}
                    </label>
                    <Badge variant="secondary" className={`text-xs ${getCategoryColor(field.category)}`}>
                      {field.category}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Email Selection */}
            <div>
              <Label htmlFor="recipient">{t("crm.selectRecipient", "Select Email Recipient")}</Label>
              <Select value={recipientEmail} onValueChange={setRecipientEmail}>
                <SelectTrigger id="recipient" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={member.email}>{member.email} ({t("common.primary", "Primary")})</SelectItem>
                  {contacts.filter(c => c.email).map(contact => (
                    <SelectItem key={contact.id} value={contact.email!}>
                      {contact.email} ({contact.contact_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Summary */}
            <div className="bg-muted rounded-lg p-3">
              <p className="text-sm">
                <strong>{t("crm.fieldsToUpdate", "The member will be asked to provide:")}</strong>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedFields.length} {t("common.fields", "field(s)")} → {recipientEmail}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={sending || loading || missingFields.length === 0 || selectedFields.length === 0}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("common.sending", "Sending...")}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {t("crm.sendUpdateRequest", "Send Update Request")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
