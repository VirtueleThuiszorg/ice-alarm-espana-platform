import { useState } from "react";
import { useTranslation } from "react-i18next";
import { JoinWizardData, MedicalDetails } from "@/types/wizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Plus, User, Users, AlertTriangle, Info } from "lucide-react";

interface JoinMedicalStepProps {
  data: JoinWizardData;
  onUpdate: (data: Partial<JoinWizardData>) => void;
}

const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

export function JoinMedicalStep({ data, onUpdate }: JoinMedicalStepProps) {
  const { t } = useTranslation();

  const updateMedicalInfo = (field: string, value: string | string[]) => {
    onUpdate({
      medicalInfo: {
        ...data.medicalInfo,
        [field]: value,
      },
    });
  };

  const updatePartnerMedicalInfo = (field: string, value: string | string[]) => {
    onUpdate({
      partnerMedicalInfo: {
        ...data.partnerMedicalInfo,
        bloodType: data.partnerMedicalInfo?.bloodType || "",
        allergies: data.partnerMedicalInfo?.allergies || [],
        medications: data.partnerMedicalInfo?.medications || [],
        medicalConditions: data.partnerMedicalInfo?.medicalConditions || [],
        doctorName: data.partnerMedicalInfo?.doctorName || "",
        doctorPhone: data.partnerMedicalInfo?.doctorPhone || "",
        hospitalPreference: data.partnerMedicalInfo?.hospitalPreference || "",
        additionalNotes: data.partnerMedicalInfo?.additionalNotes || "",
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">{t("joinWizard.medical.title")}</h2>
        <p className="text-muted-foreground">{t("joinWizard.medical.subtitle")}</p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-sm text-blue-900 dark:text-blue-100">
            {t("joinWizard.medical.optionalTitle")}
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            {t("joinWizard.medical.optionalDesc")}
          </p>
        </div>
      </div>

      {data.membershipType === "couple" ? (
        <Tabs defaultValue="primary" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="primary" className="gap-2">
              <User className="h-4 w-4" />
              {t("joinWizard.medical.primaryMember")}
            </TabsTrigger>
            <TabsTrigger value="partner" className="gap-2">
              <Users className="h-4 w-4" />
              {t("joinWizard.medical.partner")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="primary" className="mt-6">
            <MedicalForm
              values={data.medicalInfo}
              onChange={updateMedicalInfo}
              t={t}
            />
          </TabsContent>
          <TabsContent value="partner" className="mt-6">
            <MedicalForm
              values={
                data.partnerMedicalInfo || {
                  bloodType: "",
                  allergies: [],
                  medications: [],
                  medicalConditions: [],
                  doctorName: "",
                  doctorPhone: "",
                  hospitalPreference: "",
                  additionalNotes: "",
                }
              }
              onChange={updatePartnerMedicalInfo}
              t={t}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <MedicalForm
          values={data.medicalInfo}
          onChange={updateMedicalInfo}
          t={t}
        />
      )}
    </div>
  );
}

function MedicalForm({
  values,
  onChange,
  t,
}: {
  values: MedicalDetails;
  onChange: (field: string, value: string | string[]) => void;
  // deno-lint-ignore no-explicit-any
  t: any;
}) {
  const [newAllergy, setNewAllergy] = useState("");
  const [newMedication, setNewMedication] = useState("");
  const [newCondition, setNewCondition] = useState("");

  const addItem = (field: "allergies" | "medications" | "medicalConditions", value: string) => {
    if (!value.trim()) return;
    const current = values[field] || [];
    onChange(field, [...current, value.trim()]);
  };

  const removeItem = (field: "allergies" | "medications" | "medicalConditions", index: number) => {
    const current = values[field] || [];
    onChange(field, current.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Blood Type */}
      <div className="space-y-2">
        <Label>{t("joinWizard.medical.bloodType")}</Label>
        <Select
          value={values.bloodType}
          onValueChange={(value) => onChange("bloodType", value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("joinWizard.medical.selectBloodType")} />
          </SelectTrigger>
          <SelectContent>
            {bloodTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Allergies */}
      <div className="space-y-2">
        <Label>{t("joinWizard.medical.allergies")}</Label>
        <div className="flex gap-2">
          <Input
            value={newAllergy}
            onChange={(e) => setNewAllergy(e.target.value)}
            placeholder={t("joinWizard.medical.allergiesPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem("allergies", newAllergy);
                setNewAllergy("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addItem("allergies", newAllergy);
              setNewAllergy("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {values.allergies.map((allergy, index) => (
            <Badge key={index} variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {allergy}
              <button
                onClick={() => removeItem("allergies", index)}
                className="ml-1 hover:bg-destructive-foreground/20 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Medications */}
      <div className="space-y-2">
        <Label>{t("joinWizard.medical.medications")}</Label>
        <div className="flex gap-2">
          <Input
            value={newMedication}
            onChange={(e) => setNewMedication(e.target.value)}
            placeholder={t("joinWizard.medical.medicationsPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem("medications", newMedication);
                setNewMedication("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addItem("medications", newMedication);
              setNewMedication("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {values.medications.map((medication, index) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {medication}
              <button
                onClick={() => removeItem("medications", index)}
                className="ml-1 hover:bg-secondary-foreground/20 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Medical Conditions */}
      <div className="space-y-2">
        <Label>{t("joinWizard.medical.conditions")}</Label>
        <div className="flex gap-2">
          <Input
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            placeholder={t("joinWizard.medical.conditionsPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem("medicalConditions", newCondition);
                setNewCondition("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addItem("medicalConditions", newCondition);
              setNewCondition("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {values.medicalConditions.map((condition, index) => (
            <Badge key={index} variant="outline" className="gap-1">
              {condition}
              <button
                onClick={() => removeItem("medicalConditions", index)}
                className="ml-1 hover:bg-muted rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Doctor Information */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("joinWizard.medical.doctorName")}</Label>
          <Input
            value={values.doctorName}
            onChange={(e) => onChange("doctorName", e.target.value)}
            placeholder="Dr. Name"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("joinWizard.medical.doctorPhone")}</Label>
          <Input
            value={values.doctorPhone}
            onChange={(e) => onChange("doctorPhone", e.target.value)}
            placeholder="+34 000 000 000"
          />
        </div>
      </div>

      {/* Hospital Preference */}
      <div className="space-y-2">
        <Label>{t("joinWizard.medical.preferredHospital")}</Label>
        <Input
          value={values.hospitalPreference}
          onChange={(e) => onChange("hospitalPreference", e.target.value)}
          placeholder={t("joinWizard.medical.hospitalPlaceholder")}
        />
      </div>

      {/* Additional Notes */}
      <div className="space-y-2">
        <Label>{t("joinWizard.medical.additionalNotes")}</Label>
        <Textarea
          value={values.additionalNotes}
          onChange={(e) => onChange("additionalNotes", e.target.value)}
          placeholder={t("joinWizard.medical.additionalNotesPlaceholder")}
          rows={3}
        />
      </div>
    </div>
  );
}
