import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditableCard } from "@/components/EditableCard";
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
import { logMemberActivity } from "@/lib/auditLog";
import { dbMessage } from "@/lib/dbMessage";
import { PartnerAttributionCard } from "./PartnerAttributionCard";
import { StaffHomeLocationCard } from "./StaffHomeLocationCard";
import { FieldGrid, FieldSection, FIELD_LABEL_CLASS } from "@/components/FieldGrid";

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(9, "Phone number is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  nie_dni: z.string().optional(),
  address_line_1: z.string().min(1, "Address is required"),
  address_line_2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  province: z.string().min(1, "Province is required"),
  postal_code: z.string().min(1, "Postal code is required"),
  country: z.string().default("Spain"),
  preferred_language: z.enum(["en", "es"]),
  status: z.enum(["active", "inactive", "suspended"]),
  special_instructions: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileTabMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  preferred_language: string | null;
  date_of_birth: string | null;
  nie_dni: string | null;
  special_instructions: string | null;
}

interface ProfileTabProps {
  member: ProfileTabMember;
  onUpdate: () => void;
  /**
   * Bumped by the member header's Edit button, which switches to this tab. Without it that
   * button lands the operator on a locked card — a control labelled Edit that produces a
   * read-only view, which is the lie this whole lock was meant to remove.
   */
  editSignal?: number;
}

export function ProfileTab({ member, onUpdate, editSignal }: ProfileTabProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: member.first_name || "",
      last_name: member.last_name || "",
      email: member.email || "",
      phone: member.phone || "",
      date_of_birth: member.date_of_birth || "",
      nie_dni: member.nie_dni || "",
      address_line_1: member.address_line_1 || "",
      address_line_2: member.address_line_2 || "",
      city: member.city || "",
      province: member.province || "",
      postal_code: member.postal_code || "",
      country: member.country || "Spain",
      preferred_language: (member.preferred_language as ProfileFormValues["preferred_language"]) || "en",
      status: (member.status as ProfileFormValues["status"]) || "active",
      special_instructions: member.special_instructions || "",
    },
  });

  /*
    RETURNS whether the write actually happened. `EditableCard` closes on true and stays open
    on false: the guard trigger refuses `status = active` for an unpaid member, and closing the
    card on that refusal would show the old value back and imply it had been saved.
  */
  const onSubmit = async (data: ProfileFormValues): Promise<boolean> => {
    setIsLoading(true);
    try {
      const oldValues = {
        first_name: member.first_name,
        last_name: member.last_name,
        email: member.email,
        phone: member.phone,
        status: member.status,
      };

      const { error } = await supabase
        .from("members")
        .update(data)
        .eq("id", member.id);

      if (error) throw error;

      await logMemberActivity("update", member.id, oldValues, {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        status: data.status,
      });

      toast.success("Profile updated successfully");
      onUpdate();
      form.reset(data);
      return true;
    } catch (error) {
      console.error("Error updating profile:", error);
      /*
        The database's own sentence, not a generic failure. This form has a `status` dropdown
        containing `active`, and since 20260909110000 the guard trigger refuses that for a member
        with no active or past_due subscription — naming the remedy ("send them a payment link").
        A staff member who reads "Failed to update profile" instead goes looking for a bug.
      */
      toast.error(dbMessage(error, "Failed to update profile"));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Partner Attribution Card */}
      <PartnerAttributionCard memberId={member.id} />

      <EditableCard
        testId="profile-card"
        editSignal={editSignal}
        title="Member Profile"
        description="Read-only until you press Edit."
        isDirty={form.formState.isDirty}
        saving={isLoading}
        onSave={() => new Promise<boolean>((resolve) => {
          // handleSubmit resolves nothing on a validation failure, so the card is told `false`
          // and stays open with the errors visible.
          void form.handleSubmit(
            async (values) => resolve(await onSubmit(values)),
            () => resolve(false),
          )();
        })}
        onCancel={() => form.reset()}
      >
        <Form {...form}>
          <div className="space-y-6">
            {/* Personal Info */}
            <FieldGrid>
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FIELD_LABEL_CLASS}>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel className={FIELD_LABEL_CLASS}>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FIELD_LABEL_CLASS}>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
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
                    <FormLabel className={FIELD_LABEL_CLASS}>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FIELD_LABEL_CLASS}>Date of Birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nie_dni"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FIELD_LABEL_CLASS}>NIE/DNI</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FieldGrid>

            {/* Address */}
            <FieldSection title="Address">
              <FieldGrid>
                <FormField
                  control={form.control}
                  name="address_line_1"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel className={FIELD_LABEL_CLASS}>Address Line 1</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address_line_2"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel className={FIELD_LABEL_CLASS}>Address Line 2</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={FIELD_LABEL_CLASS}>City</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                      <FormLabel className={FIELD_LABEL_CLASS}>Province</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="postal_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={FIELD_LABEL_CLASS}>Postal Code</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                      <FormLabel className={FIELD_LABEL_CLASS}>Country</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FieldGrid>
            </FieldSection>

            {/* Preferences */}
            <FieldGrid>
              <FormField
                control={form.control}
                name="preferred_language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FIELD_LABEL_CLASS}>Preferred Language</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
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
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={FIELD_LABEL_CLASS}>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FieldGrid>

            {/* Special Instructions */}
            <FormField
              control={form.control}
              name="special_instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={FIELD_LABEL_CLASS}>Special Instructions</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any special instructions for handling alerts or contacting this member..."
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

      {/*
        THE HOME PIN, ON ITS OWN CARD AND OUTSIDE THE FORM.

        Not a field of this form on purpose. The pin saves itself the moment staff press Save in
        the picker, and `guard_member_home_location()` stamps who set it — folding it into a form
        whose Save also writes `status` would make one press two unrelated audit events. It is
        also read-only-until-Edit for the wrong reason: correcting a pin over the phone is a
        thirty-second job, and burying it behind the profile card's Edit is how staff stop doing
        it.
      */}
      <StaffHomeLocationCard
        memberId={member.id}
        address={{
          line1: member.address_line_1,
          city: member.city,
          province: member.province,
          postalCode: member.postal_code,
        }}
        onUpdate={onUpdate}
      />
    </div>
  );
}
