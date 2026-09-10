import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import {
  buildUpdateSubmission,
  groupUpdateFormFields,
  requestedIncludesContacts,
  updateFormFields,
  type UpdateFormField,
} from "@/lib/memberUpdateForm";
import { REQUIRED_GROUP_LABELS } from "@/lib/memberRequiredFields";
import { BLOOD_TYPES } from "@/lib/medicalFields";
import { toast } from "sonner";
import { Logo } from "@/components/ui/logo";
import { functionError } from "@/lib/functionError";

interface MemberData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  nie_dni: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  province: string;
  postal_code: string;
  country: string | null;
  date_of_birth: string;
  preferred_language: string;
}

interface MedicalData {
  blood_type: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  hospital_preference: string | null;
  allergies: string[] | null;
  medications: string[] | null;
  medical_conditions: string[] | null;
  additional_notes: string | null;
}

interface EmergencyContact {
  id?: string;
  contact_name: string;
  relationship: string;
  phone: string;
  email: string;
  priority_order: number;
  is_primary: boolean;
  speaks_spanish: boolean;
  notes: string;
}

type TokenStatus = "loading" | "valid" | "invalid" | "expired" | "used" | "submitted";

/**
 * ONE CONTROL, CHOSEN BY THE FIELD'S KIND.
 *
 * Bigger text and a real `type` on the input are not decoration here: this page is opened on a
 * phone by somebody in their seventies, and `type="tel"` is the difference between a number pad
 * and a keyboard. The reason we are asking sits under the label, where it is read.
 */
function UpdateField({
  field,
  value,
  onChange,
  label,
  because,
  listHint,
  selectHint,
}: {
  field: UpdateFormField;
  value: string;
  onChange: (value: string) => void;
  label: string;
  because: string;
  listHint: string;
  selectHint: string;
}) {
  const id = `update-${field.key}`;
  const control =
    field.control === "bloodType" ? (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={selectHint} />
        </SelectTrigger>
        <SelectContent>
          {BLOOD_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : field.control === "list" ? (
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <Input
        id={id}
        type={
          field.control === "date"
            ? "date"
            : field.control === "tel"
              ? "tel"
              : field.control === "email"
                ? "email"
                : "text"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );

  return (
    <div data-testid={`update-field-${field.key}`}>
      <Label htmlFor={id}>
        {label}
        {field.control === "list" ? ` (${listHint})` : ""}
      </Label>
      <p className="text-sm text-muted-foreground mb-1">{because}</p>
      {control}
    </div>
  );
}



export default function MemberUpdatePage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<TokenStatus>("loading");
  const [requestedFields, setRequestedFields] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form data
  const [member, setMember] = useState<MemberData | null>(null);
  const [medical, setMedical] = useState<MedicalData>({
    blood_type: null,
    doctor_name: null,
    doctor_phone: null,
    hospital_preference: null,
    allergies: null,
    medications: null,
    medical_conditions: null,
    additional_notes: null,
  });
  const [_contacts, setContacts] = useState<EmergencyContact[]>([]);

  /*
    ONE MAP, KEYED BY REQUIRED-FIELD KEY, instead of two hand-written form objects.

    The old page held `formMember` with exactly one field on it and `formMedical` with six,
    which is why it could only ever render nine of the eighteen things a member can be asked
    for: adding a tenth meant adding a state field, a control and a submit line by hand, and
    nobody did. What is rendered is now whatever the token asked for.
  */
  const [values, setValues] = useState<Record<string, string>>({});
  const [formContacts, setFormContacts] = useState<EmergencyContact[]>([]);

  const fields = updateFormFields(requestedFields);
  const groups = groupUpdateFormFields(fields);
  const showContacts = requestedIncludesContacts(requestedFields);
  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (token) {
      validateToken();
    } else {
      setStatus("invalid");
    }
  }, [token]);

  const validateToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("validate-member-update-token", {
        body: { token },
      });

      if (error) throw await functionError(error);

      if (!data.valid) {
        if (data.error === "token_expired") setStatus("expired");
        else if (data.error === "token_used") setStatus("used");
        else setStatus("invalid");
        return;
      }

      setMember(data.member);
      setMedical(data.medical || medical);
      setContacts(data.emergencyContacts || []);
      setRequestedFields(data.requestedFields || []);

      // Set preferred language
      if (data.member?.preferred_language) {
        i18n.changeLanguage(data.member.preferred_language);
      }

      // Pre-fill from whatever we already hold, so a member correcting one field is not
      // retyping the three beside it.
      const prefill: Record<string, string> = {};
      for (const field of updateFormFields(data.requestedFields || [])) {
        if (!field.column) continue;
        const source = field.target === "member" ? data.member : data.medical;
        const held = (source as Record<string, unknown> | null | undefined)?.[field.column];
        if (Array.isArray(held)) prefill[field.key] = held.join(", ");
        else if (held !== null && held !== undefined) prefill[field.key] = String(held);
      }
      setValues(prefill);
      setFormContacts(
        data.emergencyContacts?.map((c: EmergencyContact) => ({
          ...c,
          email: c.email || "",
          notes: c.notes || "",
          speaks_spanish: c.speaks_spanish || false,
        })) || []
      );

      setStatus("valid");
    } catch (error) {
      console.error("Error validating token:", error);
      setStatus("invalid");
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Blank fields are not sent: the link exists to ADD what is missing, and a member who
      // fills in two of six must not blank the other four.
      const { member: memberUpdates, medical: medicalUpdates } = buildUpdateSubmission(
        fields,
        values,
      );

      const { data, error } = await supabase.functions.invoke("submit-member-update", {
        body: {
          token,
          member: memberUpdates,
          medical: medicalUpdates,
          emergencyContacts: formContacts.filter(c => c.contact_name && c.phone),
        },
      });

      if (error) throw await functionError(error);

      if (!data.success) {
        if (data.error === "token_expired") setStatus("expired");
        else if (data.error === "token_used") setStatus("used");
        else if (data.error === "write_failed") {
          // The submission did NOT save. The link is deliberately still usable, so say so
          // rather than showing a generic failure the member cannot act on. Previously a
          // failed write returned success and the member was told they were done.
          toast.error(
            t(
              "memberUpdate.writeFailed",
              "We could not save your details. Nothing was saved and your link still works — please try again, or call us.",
            ),
          );
        } else if (data.error === "nothing_submitted") {
          toast.error(
            t(
              "memberUpdate.nothingSubmitted",
              "Please add at least one emergency contact before submitting — without one we have nobody to call for you.",
            ),
          );
        } else throw new Error(data.error);
        return;
      }

      setStatus("submitted");
      toast.success(t("memberUpdate.updateSuccess", "Thank you! Your information has been updated."));
    } catch (error) {
      console.error("Error submitting update:", error);
      toast.error(t("common.error", "An error occurred"));
    } finally {
      setSubmitting(false);
    }
  };

  const addContact = () => {
    setFormContacts(prev => [
      ...prev,
      {
        contact_name: "",
        relationship: "",
        phone: "",
        email: "",
        priority_order: prev.length + 1,
        is_primary: prev.length === 0,
        speaks_spanish: false,
        notes: "",
      },
    ]);
  };

  const updateContact = <K extends keyof EmergencyContact>(index: number, field: K, value: EmergencyContact[K]) => {
    setFormContacts(prev => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  // Render status screens
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">{t("common.loading", "Loading...")}</p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("memberUpdate.tokenInvalid", "Invalid Link")}</h2>
            <p className="text-muted-foreground">
              {t("memberUpdate.tokenInvalidDesc", "This link is invalid. Please contact us for assistance.")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 text-alert-battery mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("memberUpdate.tokenExpired", "Link Expired")}</h2>
            <p className="text-muted-foreground">
              {t("memberUpdate.tokenExpiredDesc", "This link has expired. Please contact us for a new link.")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "used") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-alert-resolved mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("memberUpdate.tokenAlreadyUsed", "Already Submitted")}</h2>
            <p className="text-muted-foreground">
              {t("memberUpdate.tokenAlreadyUsedDesc", "This form has already been submitted. Thank you!")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-alert-resolved mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("memberUpdate.updateSuccess", "Thank You!")}</h2>
            <p className="text-muted-foreground">
              {t("memberUpdate.updateSuccessDesc", "Your information has been updated successfully.")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Logo className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold">{t("memberUpdate.title", "Update Your Information")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("memberUpdate.subtitle", "Please complete the missing information below")}
          </p>
          {member && (
            <p className="text-sm text-muted-foreground mt-1">
              {member.first_name} {member.last_name}
            </p>
          )}
        </div>

        {/*
          EVERY FIELD THE TOKEN ASKED FOR, grouped as the record groups them, each with the
          reason we need it underneath. "We need your postal code" reads as bureaucracy; "how a
          rural property is found at all in Almería" is a reason somebody acts on — and it is
          the same sentence the staff-side Missing-info dialog shows, from the same list.
        */}
        {groups
          .filter((g) => g.group !== "contacts")
          .map((group) => (
            <Card className="mb-6" key={group.group} data-testid={`update-group-${group.group}`}>
              <CardHeader>
                <CardTitle>
                  {t(REQUIRED_GROUP_LABELS[group.group].key, REQUIRED_GROUP_LABELS[group.group].fallback)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.fields.map((field) => (
                  <UpdateField
                    key={field.key}
                    field={field}
                    value={values[field.key] ?? ""}
                    onChange={(v) => setValue(field.key, v)}
                    label={t(field.field.label.key, field.field.label.fallback)}
                    because={t(field.field.because.key, field.field.because.fallback)}
                    listHint={t("common.commaSeparated", "comma separated")}
                    selectHint={t("common.select", "Select...")}
                  />
                ))}
              </CardContent>
            </Card>
          ))}

        {/* Emergency Contacts Section */}
        {showContacts && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("memberUpdate.contactsSection", "Emergency Contacts")}</CardTitle>
              <CardDescription>
                {t(
                  "memberUpdate.contactsDescription",
                  "Somebody we can ring if you need help. One is enough — a second is better.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {formContacts.map((contact, index) => (
                <div key={contact.id || index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{t("common.contact", "Contact")} #{index + 1}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("common.name", "Name")}</Label>
                      <Input
                        value={contact.contact_name}
                        onChange={e => updateContact(index, "contact_name", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>{t("common.relationship", "Relationship")}</Label>
                      <Input
                        value={contact.relationship}
                        onChange={e => updateContact(index, "relationship", e.target.value)}
                        placeholder={t("common.relationshipPlaceholder", "e.g., Son, Daughter, Friend")}
                      />
                    </div>
                    <div>
                      <Label>{t("common.phone", "Phone")}</Label>
                      <Input
                        value={contact.phone}
                        onChange={e => updateContact(index, "phone", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>{t("common.email", "Email")}</Label>
                      <Input
                        type="email"
                        value={contact.email}
                        onChange={e => updateContact(index, "email", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addContact} className="w-full">
                + {t("common.addContact", "Add Contact")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        <div className="flex justify-center">
          <Button size="lg" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("common.submitting", "Submitting...")}
              </>
            ) : (
              t("memberUpdate.submitUpdate", "Submit Update")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
