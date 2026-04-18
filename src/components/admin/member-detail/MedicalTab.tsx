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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        setLastUpdated(data.updated_at);
      }
    } catch (error) {
      console.error("Error fetching medical info:", error);
      toast.error("Failed to load medical information");
    } finally {
      setIsFetching(false);
    }
  };

  const onSubmit = async (data: MedicalFormValues) => {
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

      toast.success("Medical information saved successfully");
      fetchMedicalInfo();
    } catch (error) {
      console.error("Error saving medical info:", error);
      toast.error("Failed to save medical information");
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
    <Card>
      <CardHeader>
        <CardTitle>Medical Information</CardTitle>
        <CardDescription>
          Manage medical conditions, medications, and emergency medical details.
          {lastUpdated && (
            <span className="block mt-1 text-xs">
              Last updated: {format(new Date(lastUpdated), "PPpp")}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Medical Conditions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Medical Conditions</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {conditions.map((condition, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {condition}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => removeItem("condition", index)}
                    />
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
                <Button type="button" variant="outline" size="icon" onClick={() => addItem("condition")}>
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
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => removeItem("medication", index)}
                    />
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
                <Button type="button" variant="outline" size="icon" onClick={() => addItem("medication")}>
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
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => removeItem("allergy", index)}
                    />
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
                <Button type="button" variant="outline" size="icon" onClick={() => addItem("allergy")}>
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

            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Medical Information
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
