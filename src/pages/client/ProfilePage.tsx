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
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, User, Mail, Phone, MapPin, Plane, Save } from "lucide-react";
import { NotificationPreferences } from "@/components/client/NotificationPreferences";
import { GdprSettingsSection } from "@/components/gdpr/GdprSettingsSection";
import { format } from "date-fns";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import i18n from "@/i18n";
import { PageHeader } from "@/components/client/PageHeader";
import { LockedIdentityField } from "@/components/client/LockedIdentityField";
import { HomeLocationRow } from "@/components/client/HomeLocationRow";
import {
  MEMBER_LANGUAGES,
  MEMBER_LANGUAGE_CODES,
  memberLanguage,
} from "@/lib/memberLanguages";

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
    /*
      ALL THREE, from the database enum. It was `z.enum(["en", "es"])` for a column whose values
      are `en | es | nl`, so a member whose row says `nl` — set by staff, or by the CRM import —
      could not be loaded into this form at all. See `memberLanguages.ts`.
    */
    preferred_language: z.enum(MEMBER_LANGUAGE_CODES),
    /*
      THE STRUCTURED SPANISH ADDRESS — WP5, and the migration says why in one sentence:
      "An ambulance crew with the street but not the portal is standing outside a gated
      development at night. This is where the minutes go."
    */
    urbanizacion: z.string().max(120).optional(),
    bloque: z.string().max(40).optional(),
    portal: z.string().max(40).optional(),
    escalera: z.string().max(40).optional(),
    // Away status. Member-writable by design: "someone going to the UK for a month should be
    // able to say so without ringing the office."
    away_from: z.string().optional(),
    away_until: z.string().optional(),
    pendant_with_member: z.boolean(),
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
      // `memberLanguage()` because the column is nullable: a NULL must resolve to a real code
      // rather than leaving the select with no value and silently writing one on the next Save.
      preferred_language: memberLanguage(profile.preferred_language),
      urbanizacion: profile.urbanizacion ?? "",
      bloque: profile.bloque ?? "",
      portal: profile.portal ?? "",
      escalera: profile.escalera ?? "",
      away_from: profile.away_from ?? "",
      away_until: profile.away_until ?? "",
      // NULL means "we have never asked", and the honest default is that a pendant IS with its
      // member — that is the normal case, and the question only matters while they are away.
      pendant_with_member: profile.pendant_with_member ?? true,
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
          urbanizacion: data.urbanizacion?.trim() || null,
          bloque: data.bloque?.trim() || null,
          portal: data.portal?.trim() || null,
          escalera: data.escalera?.trim() || null,
          /*
            EMPTY DATES ARE NULL, NOT "".

            `away_from`/`away_until` are `date` columns; posting an empty string is a Postgres
            error, so a member who typed a date and then cleared it could not save at all.
          */
          away_from: data.away_from || null,
          away_until: data.away_until || null,
          pendant_with_member: data.pendant_with_member,
        })
        .eq("id", memberId);

      if (error) throw error;

      // Update the i18n language if changed
      if (data.preferred_language !== profile?.preferred_language) {
        await i18n.changeLanguage(data.preferred_language);
      }

      queryClient.invalidateQueries({ queryKey: ["member-profile"] });
      toast.success(t("profile.updateSuccess"));
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(t("profile.updateFailed"));
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
        <PageHeader
          title={t("profile.title") || t("navigation.myAccount")}
          subtitle={t("profile.subtitle")}
          action={
            <Button type="submit" disabled={isSaving} className="flex-shrink-0">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("profile.saving")}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t("profile.saveChanges")}
                </>
              )}
            </Button>
          }
        />

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
                          {/* From the one list, so a language the database allows cannot be
                              missing here — which is how Dutch became unreachable. */}
                          {MEMBER_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.code} value={lang.code}>
                              {lang.flag} {lang.label}
                            </SelectItem>
                          ))}
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
                  {/*
                    R7 — DOB and NIE stay locked, WITH A REASON, and the reason is the brief's
                    own sentence. Both said "Cannot be changed", which tells a member what they
                    cannot do and nothing about what they can. See LockedIdentityField.
                  */}
                  <LockedIdentityField
                    label={t("profile.dateOfBirth")}
                    value={
                      profile?.date_of_birth
                        ? format(new Date(profile.date_of_birth), "dd MMMM yyyy")
                        : null
                    }
                    reason={t("profile.identityLockedReason")}
                    testId="profile-locked-dob"
                  />
                  <LockedIdentityField
                    label={t("profile.nieDni")}
                    value={profile?.nie_dni || null}
                    reason={t("profile.identityLockedReason")}
                    testId="profile-locked-nie"
                  />
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
                  <LockedIdentityField
                    label={t("profile.emailAddress")}
                    value={profile?.email || null}
                    icon={<Mail className="h-4 w-4" aria-hidden="true" />}
                    reason={t("profile.emailChangeNote")}
                    testId="profile-locked-email"
                  />
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
                        <FormLabel>{t("profile.addressLine1")}</FormLabel>
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
                        <FormLabel>{t("profile.addressLine2")}</FormLabel>
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
                  <LockedIdentityField
                    label={t("profile.country")}
                    value={profile?.country || t("common.spain")}
                    reason={t("profile.countryLockedReason")}
                    testId="profile-locked-country"
                  />
                </div>
                {/*
                  THE PART OF A SPANISH ADDRESS AN AMBULANCE ACTUALLY NEEDS — WP5.

                  The migration says it in one sentence: "An ambulance crew with the street but
                  not the portal is standing outside a gated development at night. This is where
                  the minutes go." All four are optional, because plenty of members live on an
                  ordinary street and asking them to fill in a bloque they do not have is how a
                  form teaches people to put "n/a" in things.
                */}
                <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="structured-address">
                  {(
                    [
                      ["urbanizacion", t("profile.urbanizacion", "Urbanización"), "Los Naranjos"],
                      ["bloque", t("profile.bloque", "Bloque"), "3"],
                      ["portal", t("profile.portal", "Portal"), "B"],
                      ["escalera", t("profile.escalera", "Escalera"), "2"],
                    ] as const
                  ).map(([name, label, placeholder]) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {label} ({t("common.optional")})
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={placeholder} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>

                <p className="text-xs text-muted-foreground mt-4">{t("profile.addressEmergencyNote")}</p>

                {/*
                  THE MAP PIN, BELOW THE TYPED ADDRESS AND SEPARATE FROM IT.

                  It belongs in this card because it is the same question — where do you live —
                  but it is deliberately NOT a form field: it saves on its own, through
                  member-self-service, and it must not be swept up by this page's Save button.
                  A typed address in rural Almería is regularly a property a driver cannot find
                  at night; the pin is the member's answer to that, and only they can give it.
                */}
                <div className="mt-6 border-t pt-6">
                  <HomeLocationRow
                    profile={profile}
                    onSaved={() => queryClient.invalidateQueries({ queryKey: ["member-profile"] })}
                  />
                </div>
              </CardContent>
            </Card>

            {/*
              AWAY — and the pendant is a separate question from the person.

              The migration: "A device gone quiet and a device in a drawer in Birmingham are
              different problems." An operator seeing a pendant that has not checked in for four
              days needs to know which of those it is before deciding whether to send anybody.

              Member-writable by design: "someone going to the UK for a month should be able to
              say so without ringing the office."
            */}
            <Card data-testid="away-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plane className="h-5 w-5" />
                  {t("profile.awayTitle", "Going away?")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-base text-muted-foreground">
                  {t(
                    "profile.awayHelp",
                    "Tell us the dates and we will know your alarm is quiet because you are away, not because something is wrong.",
                  )}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="away_from"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("profile.awayFrom", "Away from")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="away-from" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="away_until"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("profile.awayUntil", "Back on")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="away-until" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="pendant_with_member">
                      {t("profile.pendantWithMe", "I am taking my pendant with me")}
                    </Label>
                    <p className="text-[0.8125rem] text-muted-foreground">
                      {t(
                        "profile.pendantWithMeHelp",
                        "If you leave it at home we will not expect it to move.",
                      )}
                    </p>
                  </div>
                  <Switch
                    id="pendant_with_member"
                    data-testid="pendant-with-member"
                    checked={form.watch("pendant_with_member")}
                    onCheckedChange={(v) => form.setValue("pendant_with_member", v)}
                  />
                </div>
              </CardContent>
            </Card>

            {/*
              WP3 N9 — the writer `member_notification_optin` never had. The dispatcher has
              refused every send since it shipped because "absent row means no permission" and
              no screen created one.

              `profile`, not the form draft: consent applies to the number we actually hold, and
              a member who has typed a new phone but not saved it has not given us one yet.
            */}
            <NotificationPreferences
              contact={{ phone: profile?.phone, email: profile?.email }}
            />

            {/* GDPR / Data Privacy */}
            <GdprSettingsSection />
          </div>
        </div>
      </form>
    </Form>
  );
}
