import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMedicalInfo } from "@/hooks/useMemberProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import { 
  Loader2, 
  Heart, 
  Droplet, 
  Pill, 
  AlertTriangle,
  Building2,
  User,
  Phone,
  Activity,
  FileText,
  Plus,
  Edit,
  X,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const medicalSchema = z.object({
  blood_type: z.string().optional(),
  doctor_name: z.string().max(100).optional(),
  doctor_phone: z.string().max(20).optional(),
  hospital_preference: z.string().max(200).optional(),
  additional_notes: z.string().max(1000).optional(),
});

type MedicalFormData = z.infer<typeof medicalSchema>;

export default function MedicalInfoPage() {
  const { t } = useTranslation();
  const { memberId } = useAuth();
  const { data: medicalInfo, isLoading } = useMedicalInfo();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Arrays management
  const [conditions, setConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState("");
  const [newMedication, setNewMedication] = useState("");
  const [newAllergy, setNewAllergy] = useState("");

  const form = useForm<MedicalFormData>({
    resolver: zodResolver(medicalSchema),
    defaultValues: {
      blood_type: "",
      doctor_name: "",
      doctor_phone: "",
      hospital_preference: "",
      additional_notes: "",
    },
  });

  // Reset form when data loads or editing starts
  useEffect(() => {
    if (medicalInfo && isEditing) {
      form.reset({
        blood_type: medicalInfo.blood_type || "",
        doctor_name: medicalInfo.doctor_name || "",
        doctor_phone: medicalInfo.doctor_phone || "",
        hospital_preference: medicalInfo.hospital_preference || "",
        additional_notes: medicalInfo.additional_notes || "",
      });
      setConditions(medicalInfo.medical_conditions || []);
      setMedications(medicalInfo.medications || []);
      setAllergies(medicalInfo.allergies || []);
    }
  }, [medicalInfo, isEditing]);

  const startEditing = () => {
    if (medicalInfo) {
      form.reset({
        blood_type: medicalInfo.blood_type || "",
        doctor_name: medicalInfo.doctor_name || "",
        doctor_phone: medicalInfo.doctor_phone || "",
        hospital_preference: medicalInfo.hospital_preference || "",
        additional_notes: medicalInfo.additional_notes || "",
      });
      setConditions(medicalInfo.medical_conditions || []);
      setMedications(medicalInfo.medications || []);
      setAllergies(medicalInfo.allergies || []);
    } else {
      form.reset({
        blood_type: "",
        doctor_name: "",
        doctor_phone: "",
        hospital_preference: "",
        additional_notes: "",
      });
      setConditions([]);
      setMedications([]);
      setAllergies([]);
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setNewCondition("");
    setNewMedication("");
    setNewAllergy("");
  };

  const addItem = (type: "condition" | "medication" | "allergy") => {
    if (type === "condition" && newCondition.trim()) {
      setConditions([...conditions, newCondition.trim()]);
      setNewCondition("");
    } else if (type === "medication" && newMedication.trim()) {
      setMedications([...medications, newMedication.trim()]);
      setNewMedication("");
    } else if (type === "allergy" && newAllergy.trim()) {
      setAllergies([...allergies, newAllergy.trim()]);
      setNewAllergy("");
    }
  };

  const removeItem = (type: "condition" | "medication" | "allergy", index: number) => {
    if (type === "condition") {
      setConditions(conditions.filter((_, i) => i !== index));
    } else if (type === "medication") {
      setMedications(medications.filter((_, i) => i !== index));
    } else if (type === "allergy") {
      setAllergies(allergies.filter((_, i) => i !== index));
    }
  };

  const onSubmit = async (data: MedicalFormData) => {
    if (!memberId) return;

    setIsSaving(true);
    try {
      const medicalData = {
        blood_type: data.blood_type || null,
        doctor_name: data.doctor_name || null,
        doctor_phone: data.doctor_phone || null,
        hospital_preference: data.hospital_preference || null,
        additional_notes: data.additional_notes || null,
        medical_conditions: conditions.length > 0 ? conditions : null,
        medications: medications.length > 0 ? medications : null,
        allergies: allergies.length > 0 ? allergies : null,
      };

      if (medicalInfo) {
        // Update existing
        const { error } = await supabase
          .from("medical_information")
          .update(medicalData)
          .eq("member_id", memberId);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("medical_information")
          .insert({
            member_id: memberId,
            ...medicalData,
          });

        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["medical-info"] });
      toast.success(t("common.success"));
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving medical info:", error);
      toast.error(t("common.error"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {t("clientNav.medicalInfo", "Medical Information")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("medical.subtitle", "Important health details for emergencies")}
          </p>
        </div>
        {!isEditing && (
          <Button onClick={startEditing} className="gap-2">
            {medicalInfo ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {medicalInfo ? t("common.edit") : t("common.add")}
          </Button>
        )}
      </div>

      {/* Important Notice */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">{t("medical.emergencyTitle", "Emergency Medical Data")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("medical.emergencyDesc", "This information is shared with emergency services when you need help. Keep it up to date for your safety.")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isEditing ? (
        /* Edit Form */
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Allergies Section - Important! */}
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                {t("medical.allergies", "Allergies")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {allergies.map((allergy, i) => (
                  <Badge key={i} variant="destructive" className="text-sm py-1 px-3 gap-1">
                    {allergy}
                    <button type="button" onClick={() => removeItem("allergy", i)} className="ml-1 hover:bg-red-700 rounded">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={t("medical.addAllergy")}
                  value={newAllergy}
                  onChange={(e) => setNewAllergy(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem("allergy"))}
                  className="bg-white dark:bg-background"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => addItem("allergy")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Main Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Blood Type */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Droplet className="h-4 w-4 text-red-500" />
                  {t("medical.bloodType", "Blood Type")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={form.watch("blood_type") || ""}
                  onValueChange={(value) => form.setValue("blood_type", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("medical.selectBloodType", "Select blood type")} />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Doctor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {t("medical.doctor", "Doctor")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("common.name")}</Label>
                  <Input {...form.register("doctor_name")} placeholder={t("medical.doctorName")} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("common.phone")}</Label>
                  <Input {...form.register("doctor_phone")} placeholder={t("common.phonePlaceholder")} />
                </div>
              </CardContent>
            </Card>

            {/* Hospital */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {t("medical.hospital", "Preferred Hospital")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input {...form.register("hospital_preference")} placeholder={t("medical.hospitalName")} />
              </CardContent>
            </Card>

            {/* Medical Conditions */}
            <Card className="md:col-span-2 lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {t("medical.conditions", "Medical Conditions")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {conditions.map((condition, i) => (
                    <Badge key={i} variant="secondary" className="py-1 gap-1">
                      {condition}
                      <button type="button" onClick={() => removeItem("condition", i)} className="ml-1 hover:bg-muted rounded">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("medical.addCondition")}
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem("condition"))}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => addItem("condition")}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Medications */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pill className="h-4 w-4" />
                  {t("medical.medications", "Current Medications")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {medications.map((med, i) => (
                    <Badge key={i} variant="outline" className="py-1 gap-1">
                      {med}
                      <button type="button" onClick={() => removeItem("medication", i)} className="ml-1 hover:bg-muted rounded">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("medical.addMedication")}
                    value={newMedication}
                    onChange={(e) => setNewMedication(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem("medication"))}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => addItem("medication")}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t("medical.additionalNotes", "Additional Notes")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                {...form.register("additional_notes")}
                placeholder={t("medical.notesPlaceholder")}
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={cancelEditing} disabled={isSaving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? t("profile.saving", "Saving...") : t("profile.saveChanges", "Save Changes")}
            </Button>
          </div>
        </form>
      ) : !medicalInfo ? (
        /* Empty State */
        <Card>
          <CardContent className="py-12 text-center">
            <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">{t("medical.noData", "No Medical Information")}</h3>
            <p className="text-muted-foreground mb-4">
              {t("medical.addPrompt", "Add your medical details so we can provide better emergency care.")}
            </p>
            <Button onClick={startEditing} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("medical.addInfo", "Add Medical Information")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Display Mode */
        <>
          {/* Allergies - Full Width Alert */}
          {medicalInfo.allergies && medicalInfo.allergies.length > 0 && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                  {t("medical.allergies", "Allergies")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {medicalInfo.allergies.map((allergy, i) => (
                    <Badge key={i} variant="destructive" className="text-sm py-1 px-3">
                      {allergy}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Blood Type */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Droplet className="h-4 w-4 text-red-500" />
                  {t("medical.bloodType", "Blood Type")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-center py-4">
                  {medicalInfo.blood_type || "—"}
                </p>
              </CardContent>
            </Card>

            {/* Doctor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {t("medical.doctor", "Doctor")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-medium">{medicalInfo.doctor_name || t("common.notSpecified", "Not specified")}</p>
                {medicalInfo.doctor_phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Phone className="h-3 w-3" />
                    {medicalInfo.doctor_phone}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Hospital */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {t("medical.hospital", "Preferred Hospital")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">
                  {medicalInfo.hospital_preference || t("common.notSpecified", "Not specified")}
                </p>
              </CardContent>
            </Card>

            {/* Medical Conditions */}
            <Card className="md:col-span-2 lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {t("medical.conditions", "Medical Conditions")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {medicalInfo.medical_conditions && medicalInfo.medical_conditions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {medicalInfo.medical_conditions.map((condition, i) => (
                      <Badge key={i} variant="secondary" className="py-1">
                        {condition}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t("medical.noneRecorded", "None recorded")}</p>
                )}
              </CardContent>
            </Card>

            {/* Medications */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pill className="h-4 w-4" />
                  {t("medical.medications", "Current Medications")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {medicalInfo.medications && medicalInfo.medications.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {medicalInfo.medications.map((med, i) => (
                      <Badge key={i} variant="outline" className="py-1">
                        {med}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t("medical.noneRecorded", "None recorded")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Additional Notes */}
          {medicalInfo.additional_notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t("medical.additionalNotes", "Additional Notes")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {medicalInfo.additional_notes}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
