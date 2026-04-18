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
import { toast } from "sonner";
import { Logo } from "@/components/ui/logo";

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

  // Form state
  const [formMember, setFormMember] = useState({ nie_dni: "" });
  const [formMedical, setFormMedical] = useState({
    blood_type: "",
    doctor_name: "",
    doctor_phone: "",
    hospital_preference: "",
    allergies: "",
    medications: "",
  });
  const [formContacts, setFormContacts] = useState<EmergencyContact[]>([]);

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

      if (error) throw error;

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

      // Pre-fill forms
      setFormMember({ nie_dni: data.member?.nie_dni || "" });
      setFormMedical({
        blood_type: data.medical?.blood_type || "",
        doctor_name: data.medical?.doctor_name || "",
        doctor_phone: data.medical?.doctor_phone || "",
        hospital_preference: data.medical?.hospital_preference || "",
        allergies: data.medical?.allergies?.join(", ") || "",
        medications: data.medical?.medications?.join(", ") || "",
      });
      setFormContacts(
        data.emergencyContacts?.map((c: any) => ({
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
      // Build update payload
      const memberUpdates: Record<string, string> = {};
      if (formMember.nie_dni && formMember.nie_dni !== member?.nie_dni) {
        memberUpdates.nie_dni = formMember.nie_dni;
      }

      const medicalUpdates: Record<string, any> = {};
      if (formMedical.blood_type) medicalUpdates.blood_type = formMedical.blood_type;
      if (formMedical.doctor_name) medicalUpdates.doctor_name = formMedical.doctor_name;
      if (formMedical.doctor_phone) medicalUpdates.doctor_phone = formMedical.doctor_phone;
      if (formMedical.hospital_preference) medicalUpdates.hospital_preference = formMedical.hospital_preference;
      if (formMedical.allergies) medicalUpdates.allergies = formMedical.allergies.split(",").map(s => s.trim()).filter(Boolean);
      if (formMedical.medications) medicalUpdates.medications = formMedical.medications.split(",").map(s => s.trim()).filter(Boolean);

      const { data, error } = await supabase.functions.invoke("submit-member-update", {
        body: {
          token,
          member: memberUpdates,
          medical: medicalUpdates,
          emergencyContacts: formContacts.filter(c => c.contact_name && c.phone),
        },
      });

      if (error) throw error;

      if (!data.success) {
        if (data.error === "token_expired") setStatus("expired");
        else if (data.error === "token_used") setStatus("used");
        else throw new Error(data.error);
        return;
      }

      setStatus("submitted");
      toast.success(t("memberUpdate.updateSuccess", "Thank you! Your information has been updated."));
    } catch (error: any) {
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

  const updateContact = (index: number, field: keyof EmergencyContact, value: any) => {
    setFormContacts(prev => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  // Render status screens
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">{t("common.loading", "Loading...")}</p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
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

        {/* Profile Section */}
        {(requestedFields.includes("nie_dni")) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("memberUpdate.profileSection", "Personal Information")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {requestedFields.includes("nie_dni") && (
                <div>
                  <Label htmlFor="nie_dni">{t("common.nieDni", "NIE/DNI")}</Label>
                  <Input
                    id="nie_dni"
                    value={formMember.nie_dni}
                    onChange={e => setFormMember(prev => ({ ...prev, nie_dni: e.target.value }))}
                    placeholder="X1234567A"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Medical Section */}
        {requestedFields.some(f => ["blood_type", "doctor_name", "doctor_phone", "hospital_preference", "allergies", "medications"].includes(f)) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("memberUpdate.medicalSection", "Medical Information")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {requestedFields.includes("blood_type") && (
                <div>
                  <Label htmlFor="blood_type">{t("medical.bloodType", "Blood Type")}</Label>
                  <Select value={formMedical.blood_type} onValueChange={v => setFormMedical(prev => ({ ...prev, blood_type: v }))}>
                    <SelectTrigger id="blood_type">
                      <SelectValue placeholder={t("common.select", "Select...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {requestedFields.includes("doctor_name") && (
                <div>
                  <Label htmlFor="doctor_name">{t("medical.doctorName", "Doctor Name")}</Label>
                  <Input
                    id="doctor_name"
                    value={formMedical.doctor_name}
                    onChange={e => setFormMedical(prev => ({ ...prev, doctor_name: e.target.value }))}
                  />
                </div>
              )}

              {requestedFields.includes("doctor_phone") && (
                <div>
                  <Label htmlFor="doctor_phone">{t("medical.doctorPhone", "Doctor Phone")}</Label>
                  <Input
                    id="doctor_phone"
                    value={formMedical.doctor_phone}
                    onChange={e => setFormMedical(prev => ({ ...prev, doctor_phone: e.target.value }))}
                  />
                </div>
              )}

              {requestedFields.includes("hospital_preference") && (
                <div>
                  <Label htmlFor="hospital_preference">{t("medical.hospitalPreference", "Preferred Hospital")}</Label>
                  <Input
                    id="hospital_preference"
                    value={formMedical.hospital_preference}
                    onChange={e => setFormMedical(prev => ({ ...prev, hospital_preference: e.target.value }))}
                  />
                </div>
              )}

              {requestedFields.includes("allergies") && (
                <div>
                  <Label htmlFor="allergies">{t("medical.allergies", "Allergies")} ({t("common.commaSeparated", "comma separated")})</Label>
                  <Textarea
                    id="allergies"
                    value={formMedical.allergies}
                    onChange={e => setFormMedical(prev => ({ ...prev, allergies: e.target.value }))}
                    placeholder={t("medical.allergiesPlaceholder", "e.g., Penicillin, Shellfish, Peanuts")}
                  />
                </div>
              )}

              {requestedFields.includes("medications") && (
                <div>
                  <Label htmlFor="medications">{t("medical.medications", "Current Medications")} ({t("common.commaSeparated", "comma separated")})</Label>
                  <Textarea
                    id="medications"
                    value={formMedical.medications}
                    onChange={e => setFormMedical(prev => ({ ...prev, medications: e.target.value }))}
                    placeholder={t("medical.medicationsPlaceholder", "e.g., Aspirin 100mg, Metformin 500mg")}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Emergency Contacts Section */}
        {requestedFields.some(f => ["contacts_count", "contacts_email"].includes(f)) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("memberUpdate.contactsSection", "Emergency Contacts")}</CardTitle>
              <CardDescription>
                {t("memberUpdate.contactsDescription", "Please ensure you have at least 2 emergency contacts with valid information.")}
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
