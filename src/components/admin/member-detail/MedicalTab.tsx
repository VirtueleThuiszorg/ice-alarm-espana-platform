import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EditableCard } from "@/components/admin/member-detail/EditableCard";
import { logMemberActivity } from "@/lib/auditLog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

const medicalSchema = z.object({
  blood_type: z.string().optional(),
  doctor_name: z.string().optional(),
  doctor_phone: z.string().optional(),
  hospital_preference: z.string().optional(),
  additional_notes: z.string().optional(),
});

type MedicalFormValues = z.infer<typeof medicalSchema>;

interface MedicalTabProps {
  memberId: string;
}

export function MedicalTab({ memberId }: MedicalTabProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [medicalId, setMedicalId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState("");
  const [newMedication, setNewMedication] = useState("");
  const [newAllergy, setNewAllergy] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  /*
    THE CHIP LISTS ARE STATE, NOT FORM FIELDS, so react-hook-form's `isDirty` cannot see them.
    Without this baseline, adding an allergy and pressing Cancel would discard it with no
    warning at all — the one field on this tab where losing an edit is dangerous.
  */
  const [baseline, setBaseline] = useState<{ c: string[]; m: string[]; a: string[] }>({
    c: [],
    m: [],
    a: [],
  });
  const listsDirty =
    JSON.stringify({ c: conditions, m: medications, a: allergies }) !== JSON.stringify(baseline);

  const form = useForm<MedicalFormValues>({
    resolver: zodResolver(medicalSchema),
    defaultValues: {
      blood_type: "",
      doctor_name: "",
      doctor_phone: "",
      hospital_preference: "",
      additional_notes: "",
    },
  });

  useEffect(() => {
    fetchMedicalInfo();
  }, [memberId]);

  const fetchMedicalInfo = async () => {
    try {
      const { data, error } = await supabase
        .from("medical_information")
        .select("*")
        .eq("member_id", memberId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setMedicalId(data.id);
        form.reset({
          blood_type: data.blood_type || "",
          doctor_name: data.doctor_name || "",
          doctor_phone: data.doctor_phone || "",
          hospital_preference: data.hospital_preference || "",
          additional_notes: data.additional_notes || "",
        });
        setConditions(data.medical_conditions || []);
        setMedications(data.medications || []);
        setAllergies(data.allergies || []);
        setBaseline({
          c: data.medical_conditions || [],
          m: data.medications || [],
          a: data.allergies || [],
        });
        setLastUpdated(data.updated_at);
      }
    } catch (error) {
      console.error("Error fetching medical info:", error);
      toast.error("Failed to load medical information");
    } finally {
      setIsFetching(false);
    }
  };

  const onSubmit = async (data: MedicalFormValues): Promise<boolean> => {
    setIsLoading(true);
    try {
      const medicalData = {
        ...data,
        medical_conditions: conditions,
        medications: medications,
        allergies: allergies,
        member_id: memberId,
      };

      if (medicalId) {
        const { error } = await supabase
          .from("medical_information")
          .update(medicalData)
          .eq("id", medicalId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("medical_information")
          .insert(medicalData);
        if (error) throw error;
      }

      /*
        WHO CHANGED A MEDICAL RECORD AND WHEN. This tab wrote to `medical_information` and left
        no audit row at all — so an allergy that changed between one alert and the next had no
        answer to "who did that". Values are NOT copied into the log: activity_logs is read by
        more people than the medical tab is, and a list of somebody's conditions does not
        belong in it. What changed is named; what it changed to lives on the record.
      */
      await logMemberActivity("update", memberId, undefined, {
        table: "medical_information",
        fields: [
          ...Object.keys(data),
          ...(conditions.length ? ["medical_conditions"] : []),
          ...(medications.length ? ["medications"] : []),
          ...(allergies.length ? ["allergies"] : []),
        ],
      });

      toast.success("Medical information saved successfully");
      fetchMedicalInfo();
      form.reset(data);
      return true;
    } catch (error) {
      console.error("Error saving medical info:", error);
      toast.error("Failed to save medical information");
      return false;
    } finally {
      setIsLoading(false);
    }
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

  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <EditableCard
      testId="medical-card"
      title="Medical Information"
      description="Read-only until you press Edit."
      headerExtra={
        lastUpdated ? (
          <p className="text-xs text-muted-foreground">
            Last updated: {format(new Date(lastUpdated), "PPpp")}
          </p>
        ) : null
      }
      isDirty={form.formState.isDirty || listsDirty}
      saving={isLoading}
      onSave={() => new Promise<boolean>((resolve) => {
        void form.handleSubmit(
          async (values) => resolve(await onSubmit(values)),
          () => resolve(false),
        )();
      })}
      onCancel={() => {
        form.reset();
        setConditions(baseline.c);
        setMedications(baseline.m);
        setAllergies(baseline.a);
        setNewCondition("");
        setNewMedication("");
        setNewAllergy("");
      }}
    >
        <Form {...form}>
          <div className="space-y-6">
            {/* Medical Conditions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Medical Conditions</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {conditions.map((condition, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {condition}
                    {/*
                      A REAL BUTTON, not a click handler on an icon. A disabled fieldset makes
                      buttons inert; it does nothing to an <svg onClick>, so in read-only mode
                      the old version still removed the chip on a stray click. It is also the
                      only version a keyboard can reach.
                    */}
                    <button
                      type="button"
                      aria-label={`Remove ${condition}`}
                      className="rounded-sm disabled:cursor-not-allowed"
                      onClick={() => removeItem("condition", index)}
                    >
                      <X className="h-3 w-3 cursor-pointer" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add condition..."
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem("condition"))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Add condition"
                  onClick={() => addItem("condition")}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Medications */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Medications</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {medications.map((medication, index) => (
                  <Badge key={index} variant="outline" className="gap-1">
                    {medication}
                    {/*
                      A REAL BUTTON, not a click handler on an icon. A disabled fieldset makes
                      buttons inert; it does nothing to an <svg onClick>, so in read-only mode
                      the old version still removed the chip on a stray click. It is also the
                      only version a keyboard can reach.
                    */}
                    <button
                      type="button"
                      aria-label={`Remove ${medication}`}
                      className="rounded-sm disabled:cursor-not-allowed"
                      onClick={() => removeItem("medication", index)}
                    >
                      <X className="h-3 w-3 cursor-pointer" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add medication..."
                  value={newMedication}
                  onChange={(e) => setNewMedication(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem("medication"))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Add medication"
                  onClick={() => addItem("medication")}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Allergies */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Allergies</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {allergies.map((allergy, index) => (
                  <Badge key={index} variant="destructive" className="gap-1">
                    {allergy}
                    {/*
                      A REAL BUTTON, not a click handler on an icon. A disabled fieldset makes
                      buttons inert; it does nothing to an <svg onClick>, so in read-only mode
                      the old version still removed the chip on a stray click. It is also the
                      only version a keyboard can reach.
                    */}
                    <button
                      type="button"
                      aria-label={`Remove ${allergy}`}
                      className="rounded-sm disabled:cursor-not-allowed"
                      onClick={() => removeItem("allergy", index)}
                    >
                      <X className="h-3 w-3 cursor-pointer" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add allergy..."
                  value={newAllergy}
                  onChange={(e) => setNewAllergy(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem("allergy"))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Add allergy"
                  onClick={() => addItem("allergy")}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Blood Type & Doctor Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="blood_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blood Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select blood type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                        <SelectItem value="Unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hospital_preference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hospital Preference</FormLabel>
                    <FormControl>
                      <Input placeholder="Preferred hospital..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="doctor_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Doctor Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Dr. Name..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="doctor_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Doctor Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+34 XXX XXX XXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Additional Notes */}
            <FormField
              control={form.control}
              name="additional_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any additional medical notes..."
                      className="min-h-[100px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </div>
        </Form>
    </EditableCard>
  );
}
