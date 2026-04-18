import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCreateStaff, useUpdateStaff } from "@/hooks/useStaffMembers";
import type { StaffMember } from "@/types/staff";

const staffFormSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50),
  last_name: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  role: z.enum(["admin", "call_centre_supervisor", "call_centre"], {
    required_error: "Please select a role",
  }),
  preferred_language: z.enum(["en", "es"]).default("en"),
  nie_number: z.string().optional(),
  social_security_number: z.string().optional(),
  date_of_birth: z.string().optional(),
  nationality: z.string().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  emergency_contact_relationship: z.string().optional(),
  hire_date: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  contract_type: z.string().optional(),
  notes: z.string().optional(),
  annual_holiday_days: z.coerce.number().min(0).max(60).optional(),
  personal_mobile: z.string().regex(/^\+?\d[\d\s]{6,18}$/, "Invalid phone number (e.g. +34 6XX XXX XXX)").optional().or(z.literal("")),
  escalation_priority: z.coerce.number().min(1).max(99).optional(),
  is_on_call: z.enum(["yes", "no"]).optional(),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

interface StaffFormPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  staffMember?: StaffMember | null;
}

export function StaffFormPanel({ open, onOpenChange, mode, staffMember }: StaffFormPanelProps) {
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const isSubmitting = createStaff.isPending || updateStaff.isPending;

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role: undefined,
      preferred_language: "en",
      nie_number: "",
      social_security_number: "",
      date_of_birth: "",
      nationality: "",
      address_line1: "",
      address_line2: "",
      city: "",
      province: "",
      postal_code: "",
      country: "Spain",
      emergency_contact_name: "",
      emergency_contact_phone: "",
      emergency_contact_relationship: "",
      hire_date: "",
      department: "operations",
      position: "",
      contract_type: "",
      notes: "",
      annual_holiday_days: 22,
      personal_mobile: "",
      escalation_priority: undefined,
      is_on_call: "no",
    },
  });

  useEffect(() => {
    if (mode === "edit" && staffMember) {
      form.reset({
        first_name: staffMember.first_name || "",
        last_name: staffMember.last_name || "",
        email: staffMember.email || "",
        phone: staffMember.phone || "",
        role: staffMember.role as any,
        preferred_language: (staffMember.preferred_language as "en" | "es") || "en",
        nie_number: staffMember.nie_number || "",
        social_security_number: staffMember.social_security_number || "",
        date_of_birth: staffMember.date_of_birth || "",
        nationality: staffMember.nationality || "",
        address_line1: staffMember.address_line1 || "",
        address_line2: staffMember.address_line2 || "",
        city: staffMember.city || "",
        province: staffMember.province || "",
        postal_code: staffMember.postal_code || "",
        country: staffMember.country || "Spain",
        emergency_contact_name: staffMember.emergency_contact_name || "",
        emergency_contact_phone: staffMember.emergency_contact_phone || "",
        emergency_contact_relationship: staffMember.emergency_contact_relationship || "",
        hire_date: staffMember.hire_date || "",
        department: staffMember.department || "operations",
        position: staffMember.position || "",
        contract_type: staffMember.contract_type || "",
        notes: staffMember.notes || "",
        annual_holiday_days: (staffMember as any).annual_holiday_days ?? 22,
        personal_mobile: staffMember.personal_mobile || "",
        escalation_priority: staffMember.escalation_priority ?? undefined,
        is_on_call: staffMember.is_on_call ? "yes" : "no",
      });
    } else if (mode === "create") {
      form.reset();
    }
  }, [mode, staffMember, form, open]);

  const onSubmit = async (values: StaffFormValues) => {
    if (mode === "create") {
      await createStaff.mutateAsync({
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
        role: values.role,
        phone: values.phone || undefined,
        preferred_language: values.preferred_language,
        // Include all optional fields admin has filled in
        date_of_birth: values.date_of_birth || undefined,
        nationality: values.nationality || undefined,
        nie_number: values.nie_number || undefined,
        social_security_number: values.social_security_number || undefined,
        address_line1: values.address_line1 || undefined,
        address_line2: values.address_line2 || undefined,
        city: values.city || undefined,
        province: values.province || undefined,
        postal_code: values.postal_code || undefined,
        country: values.country || undefined,
        emergency_contact_name: values.emergency_contact_name || undefined,
        emergency_contact_phone: values.emergency_contact_phone || undefined,
        emergency_contact_relationship: values.emergency_contact_relationship || undefined,
        hire_date: values.hire_date || undefined,
        department: values.department || undefined,
        position: values.position || undefined,
        contract_type: values.contract_type || undefined,
        notes: values.notes || undefined,
        personal_mobile: values.personal_mobile || undefined,
        escalation_priority: values.escalation_priority || undefined,
        is_on_call: values.is_on_call === "yes",
        annual_holiday_days: values.annual_holiday_days,
      });
      onOpenChange(false);
    } else if (staffMember) {
      const updates: Record<string, unknown> = {};
      const editableFields = [
        "first_name", "last_name", "phone", "role", "preferred_language",
        "nie_number", "social_security_number", "date_of_birth", "nationality",
        "address_line1", "address_line2", "city", "province", "postal_code", "country",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
        "hire_date", "department", "position", "contract_type", "notes", "annual_holiday_days",
        "personal_mobile", "escalation_priority",
      ] as const;

      for (const field of editableFields) {
        const value = values[field as keyof StaffFormValues];
        if (value !== undefined) {
          updates[field] = value || null;
        }
      }

      // Handle is_on_call boolean conversion
      updates.is_on_call = values.is_on_call === "yes";

      await updateStaff.mutateAsync({ id: staffMember.id, updates });
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {mode === "create" ? "Add Staff Member" : "Edit Staff Member"}
          </SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? "Create a new staff member. You can send them an invitation from their profile page."
              : "Update staff member details."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            {/* Personal Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Personal Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nationality</FormLabel>
                    <FormControl>
                      <Input placeholder="Spanish" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nie_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NIE Number</FormLabel>
                      <FormControl>
                        <Input placeholder="X1234567A" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="social_security_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Social Security No.</FormLabel>
                      <FormControl>
                        <Input placeholder="" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Contact
              </h3>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="john.doe@example.com"
                        disabled={mode === "edit"}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+34 600 000 000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="preferred_language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Language</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select language..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Address
              </h3>
              <FormField
                control={form.control}
                name="address_line1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1</FormLabel>
                    <FormControl>
                      <Input placeholder="Street address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address_line2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2</FormLabel>
                    <FormControl>
                      <Input placeholder="Apt, suite, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="Albox" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Province</FormLabel>
                      <FormControl>
                        <Input placeholder="Almería" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="postal_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Code</FormLabel>
                      <FormControl>
                        <Input placeholder="04800" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input placeholder="Spain" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Employment */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Employment
              </h3>
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="call_centre_supervisor">Call Centre Supervisor</SelectItem>
                        <SelectItem value="call_centre">Call Centre Agent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "operations"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="operations">Operations</SelectItem>
                          <SelectItem value="call_centre">Call Centre</SelectItem>
                          <SelectItem value="administration">Administration</SelectItem>
                          <SelectItem value="management">Management</SelectItem>
                          <SelectItem value="it">IT</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Senior Agent" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contract_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="full_time">Full Time</SelectItem>
                          <SelectItem value="part_time">Part Time</SelectItem>
                          <SelectItem value="contractor">Contractor</SelectItem>
                          <SelectItem value="temporary">Temporary</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hire_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hire Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="annual_holiday_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Holiday Days</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={60} placeholder="22" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Emergency Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Emergency Contact
              </h3>
              <FormField
                control={form.control}
                name="emergency_contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emergency_contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+34 600 000 000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergency_contact_relationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Spouse" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Escalation Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Escalation Settings
              </h3>
              <FormField
                control={form.control}
                name="personal_mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal Mobile</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+34 6XX XXX XXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="escalation_priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Escalation Priority</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={99} placeholder="1 = highest" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_on_call"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>On Call</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "no"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="On call?" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional notes..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === "create" ? "Creating..." : "Saving..."}
                  </>
                ) : mode === "create" ? (
                  "Create Staff Member"
                ) : (
                  "Save Changes"
                )}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
