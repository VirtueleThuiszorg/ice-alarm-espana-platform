import { useState } from "react";
import { WizardData } from "@/pages/admin/AddMemberWizard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Plus, User, Users, AlertTriangle } from "lucide-react";

interface MedicalInfoStepProps {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

export function MedicalInfoStep({ data, onUpdate }: MedicalInfoStepProps) {
  const [newAllergy, setNewAllergy] = useState("");
  const [newMedication, setNewMedication] = useState("");
  const [newCondition, setNewCondition] = useState("");

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

  const addItem = (
    field: "allergies" | "medications" | "medicalConditions",
    value: string,
    isPartner: boolean = false
  ) => {
    if (!value.trim()) return;
    const currentData = isPartner ? data.partnerMedicalInfo : data.medicalInfo;
    const currentList = currentData?.[field] || [];
    if (isPartner) {
      updatePartnerMedicalInfo(field, [...currentList, value.trim()]);
    } else {
      updateMedicalInfo(field, [...currentList, value.trim()]);
    }
  };

  const removeItem = (
    field: "allergies" | "medications" | "medicalConditions",
    index: number,
    isPartner: boolean = false
  ) => {
    const currentData = isPartner ? data.partnerMedicalInfo : data.medicalInfo;
    const currentList = currentData?.[field] || [];
    const newList = currentList.filter((_, i) => i !== index);
    if (isPartner) {
      updatePartnerMedicalInfo(field, newList);
    } else {
      updateMedicalInfo(field, newList);
    }
  };

  const MedicalForm = ({
    values,
    onChange,
    isPartner = false,
  }: {
    values: {
      bloodType: string;
      allergies: string[];
      medications: string[];
      medicalConditions: string[];
      doctorName: string;
      doctorPhone: string;
      hospitalPreference: string;
      additionalNotes: string;
    };
    onChange: (field: string, value: string | string[]) => void;
    isPartner?: boolean;
  }) => (
    <div className="space-y-6">
      {/* Blood Type */}
      <div className="space-y-2">
        <Label>Blood Type</Label>
        <Select
          value={values.bloodType}
          onValueChange={(value) => onChange("bloodType", value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select blood type" />
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
        <Label>Allergies</Label>
        <div className="flex gap-2">
          <Input
            value={newAllergy}
            onChange={(e) => setNewAllergy(e.target.value)}
            placeholder="Enter allergy"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem("allergies", newAllergy, isPartner);
                setNewAllergy("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addItem("allergies", newAllergy, isPartner);
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
                onClick={() => removeItem("allergies", index, isPartner)}
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
        <Label>Current Medications</Label>
        <div className="flex gap-2">
          <Input
            value={newMedication}
            onChange={(e) => setNewMedication(e.target.value)}
            placeholder="Enter medication"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem("medications", newMedication, isPartner);
                setNewMedication("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addItem("medications", newMedication, isPartner);
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
                onClick={() => removeItem("medications", index, isPartner)}
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
        <Label>Medical Conditions</Label>
        <div className="flex gap-2">
          <Input
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            placeholder="Enter condition"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem("medicalConditions", newCondition, isPartner);
                setNewCondition("");
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              addItem("medicalConditions", newCondition, isPartner);
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
                onClick={() => removeItem("medicalConditions", index, isPartner)}
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
          <Label>Doctor's Name</Label>
          <Input
            value={values.doctorName}
            onChange={(e) => onChange("doctorName", e.target.value)}
            placeholder="Dr. Name"
          />
        </div>
        <div className="space-y-2">
          <Label>Doctor's Phone</Label>
          <Input
            value={values.doctorPhone}
            onChange={(e) => onChange("doctorPhone", e.target.value)}
            placeholder="+34 000 000 000"
          />
        </div>
      </div>

      {/* Hospital Preference */}
      <div className="space-y-2">
        <Label>Preferred Hospital</Label>
        <Input
          value={values.hospitalPreference}
          onChange={(e) => onChange("hospitalPreference", e.target.value)}
          placeholder="Hospital name"
        />
      </div>

      {/* Additional Notes */}
      <div className="space-y-2">
        <Label>Additional Notes</Label>
        <Textarea
          value={values.additionalNotes}
          onChange={(e) => onChange("additionalNotes", e.target.value)}
          placeholder="Any other important medical information..."
          rows={3}
        />
      </div>
    </div>
  );

  if (data.membershipType === "single") {
    return <MedicalForm values={data.medicalInfo} onChange={updateMedicalInfo} />;
  }

  return (
    <Tabs defaultValue="primary" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="primary" className="gap-2">
          <User className="h-4 w-4" />
          Primary Member
        </TabsTrigger>
        <TabsTrigger value="partner" className="gap-2">
          <Users className="h-4 w-4" />
          Partner
        </TabsTrigger>
      </TabsList>
      <TabsContent value="primary" className="mt-6">
        <MedicalForm values={data.medicalInfo} onChange={updateMedicalInfo} />
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
          isPartner
        />
      </TabsContent>
    </Tabs>
  );
}
