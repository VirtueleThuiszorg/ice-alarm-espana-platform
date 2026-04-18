import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useMemberProfile } from "@/hooks/useMemberProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, User, Mail, Phone, MapPin, Lock, Save } from "lucide-react";
import { GdprSettingsSection } from "@/components/gdpr/GdprSettingsSection";
import { format } from "date-fns";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import i18n from "@/i18n";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { memberId, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMemberProfile();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const profileSchema = z.object({
    first_name: z.string().min(1, t("validation.nameRequired")),
    last_name: z.string().min(1, t("validation.nameRequired")),
    phone: z.string().min(1, t("validation.phoneRequired")),
    address_line_1: z.string().min(1, t("validation.addressRequired")),
    address_line_2: z.string().optional(),
    city: z.string().min(1, t("validation.required")),
    province: z.string().min(1, t("validation.required")),
    postal_code: z.string().min(1, t("validation.required")),
    preferred_language: z.enum(["en", "es"]),
  });

  type ProfileFormData = z.infer<typeof profileSchema>;

  const isLoading = authLoading || profileLoading;

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: profile ? {
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone: profile.phone,
      address_line_1: profile.address_line_1,
      address_line_2: profile.address_line_2 || "",
      city: profile.city,
      province: profile.province,
      postal_code: profile.postal_code,
      preferred_language: profile.preferred_language,
    } : undefined,
  });

  const onSubmit = async (data: ProfileFormData) => {
    if (!memberId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("members")
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
          address_line_1: data.address_line_1,
          address_line_2: data.address_line_2 || null,
          city: data.city,
          province: data.province,
          postal_code: data.postal_code,
          preferred_language: data.preferred_language,
        })
        .eq("id", memberId);

      if (error) throw error;

      // Update the i18n language if changed
      if (data.preferred_language !== profile?.preferred_language) {
        await i18n.changeLanguage(data.preferred_language);
      }

      queryClient.invalidateQueries({ queryKey: ["member-profile"] });
      toast.success(t("profile.updateSuccess") || "Profile updated successfully");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(t("profile.updateFailed") || "Failed to update profile");
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

  if (!profile && !isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("profile.notFound")}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("profile.title") || t("navigation.myAccount")}</h1>
            <p className="text-muted-foreground mt-1">{t("profile.subtitle") || "Manage your personal information and preferences"}</p>
          </div>
          <Button type="submit" disabled={isSaving} className="flex-shrink-0">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("profile.saving") || "Saving..."}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t("profile.saveChanges") || "Save Changes"}
              </>
            )}
          </Button>
        </div>

        {/* Main Grid Layout */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Sidebar - Photo Card */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("profile.profilePhoto")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <Avatar className="h-32 w-32">
                  <AvatarImage src={profile?.photo_url || undefined} />
                  <AvatarFallback className="text-3xl bg-primary/10 text-primary">
                    {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm text-muted-foreground text-center">
                  {t("profile.contactSupportToChange")}
                </p>
              </CardContent>
            </Card>

            {/* Language Preference Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("profile.preferences")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="preferred_language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("profile.preferredLanguage")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                      <SelectTrigger>
                            <SelectValue placeholder={t("profile.selectLanguage")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("profile.languageDesc")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t("profile.personalInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("profile.firstName")}</FormLabel>
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
                        <FormLabel>{t("profile.lastName")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      {t("profile.dateOfBirth")}
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-lg font-medium text-muted-foreground">
                      {profile?.date_of_birth 
                        ? format(new Date(profile.date_of_birth), "dd MMMM yyyy")
                        : "—"
                      }
                    </div>
                    <p className="text-xs text-muted-foreground">{t("profile.dobReadOnly") || "Cannot be changed"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      {t("profile.nieDni")}
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-lg font-medium text-muted-foreground">
                      {profile?.nie_dni || "—"}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("profile.nieReadOnly") || "Cannot be changed"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  {t("profile.contactInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      {t("profile.emailAddress")}
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-lg font-medium text-muted-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {profile?.email || "—"}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("profile.emailChangeNote")}</p>
                  </div>
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("profile.phoneNumber")}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input {...field} className="pl-10" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Address */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {t("profile.address")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="address_line_1"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>{t("profile.addressLine1") || "Street Address"}</FormLabel>
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
                        <FormLabel>{t("profile.addressLine2") || "Address Line 2 (Optional)"}</FormLabel>
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
                        <FormLabel>{t("profile.city")}</FormLabel>
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
                        <FormLabel>{t("profile.province")}</FormLabel>
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
                        <FormLabel>{t("profile.postalCode")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      {t("profile.country")}
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-lg font-medium text-muted-foreground">
                      {profile?.country || t("common.spain")}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">{t("profile.addressEmergencyNote") || "This address is used for emergency response"}</p>
              </CardContent>
            </Card>

            {/* GDPR / Data Privacy */}
            <GdprSettingsSection />
          </div>
        </div>
      </form>
    </Form>
  );
}
