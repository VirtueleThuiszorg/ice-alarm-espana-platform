import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useMemberProfile } from "@/hooks/useMemberProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, User, Mail, Phone, MapPin, Plane } from "lucide-react";
import { NotificationPreferences } from "@/components/client/NotificationPreferences";
import { GdprSettingsSection } from "@/components/gdpr/GdprSettingsSection";
import { format } from "date-fns";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import i18n from "@/i18n";
import { PageHeader } from "@/components/client/PageHeader";
import { LockedIdentityField } from "@/components/client/LockedIdentityField";
import { EditableCard } from "@/components/EditableCard";
import { FieldControl, FieldLabel } from "@/components/FieldControl";
import { HomeLocationRow } from "@/components/client/HomeLocationRow";
import {
  MEMBER_LANGUAGES,
  MEMBER_LANGUAGE_CODES,
  memberLanguage,
} from "@/lib/memberLanguages";

/**
 * THE MEMBER'S OWN RECORD, LOCKED UNTIL THEY SAY OTHERWISE — MEMBER_UX_RULES R6.
 *
 * *"Read-only by default. Edit per section, then Save."*
 *
 * WHAT WAS WRONG. Every field on this page was a live input from the moment it loaded, inside
 * ONE form with ONE Save button in the header. A member who opened their own account to check
 * the address we hold was one stray keypress from changing it, and nothing on the screen marked
 * the moment they had decided to change anything. On the page that holds the address an
 * ambulance is sent to, read-by-default is not a nicety.
 *
 * It was also the whole page or nothing: correcting a phone number meant every other field —
 * the address, the away dates, the language — was live at the same time, and Save wrote all of
 * them. So a validation error anywhere blocked a change everywhere, and `zodResolver` requires
 * six fields, which means a member with an incomplete imported record could not save the ONE
 * field they came to fix.
 *
 * WHAT IT IS NOW. Five `EditableCard`s, each with its own Edit / Save / Cancel and its own
 * unsaved-changes guard, all sharing the same shell as the staff CRM record so the lock is one
 * component rather than two. Locked, a field is its label and its value as plain text; unlocked,
 * it is the input. `FieldControl` is where that switch lives.
 *
 * WHY EACH CARD WRITES ONLY ITS OWN COLUMNS. `CARD_COLUMNS` below is the whole reason this is
 * safe: with two cards open at once, a save that posted the form's every value would carry the
 * other card's unsaved draft with it — a member who typed a new address and then saved their
 * language would have silently saved the address too. Each `saveCard` reads the RECORD for
 * everything outside its own list.
 *
 * WHAT DID NOT CHANGE. The write itself. This page updates `members` directly, as it always
 * has, under the "Members can update own profile" policy — the route `clientWriteSweep.test.ts`
 * pins as allowed self-service. No new column became writable, and `status` is still refused by
 * the guard trigger rather than by anything here.
 */

/** The five cards, and exactly which columns each one may write. */
const CARD_COLUMNS = {
  personal: ["first_name", "last_name"],
  contact: ["phone"],
  address: [
    "address_line_1",
    "address_line_2",
    "city",
    "province",
    "postal_code",
    "urbanizacion",
    "bloque",
    "portal",
    "escalera",
  ],
  preferences: ["preferred_language"],
  away: ["away_from", "away_until", "pendant_with_member"],
} as const;

type CardKey = keyof typeof CARD_COLUMNS;

export default function ProfilePage() {
  const { t } = useTranslation();
  const { memberId, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMemberProfile();
  const queryClient = useQueryClient();
  /** Which card is mid-save. One at a time, and only that card shows a spinner. */
  const [savingCard, setSavingCard] = useState<CardKey | null>(null);

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

  /**
   * The record as form values — the thing every card's Cancel resets to, and every dirty check
   * compares against.
   *
   * It was inline in `values={profile ? {…} : undefined}`, which made it unreachable: with no
   * name for "what the record says", Cancel had nothing to put back and a per-card dirty check
   * had nothing to diff.
   */
  const recordValues = useMemo<ProfileFormData | undefined>(() => {
    if (!profile) return undefined;
    return {
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
    };
  }, [profile]);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: recordValues,
  });

  /*
    `watch()` rather than `formState.dirtyFields`.

    The form is driven by the `values` prop, which react-hook-form treats as an external source
    of truth — so `dirtyFields` is measured against the ORIGINAL defaultValues (`undefined`
    here) and reports fields dirty that nobody has touched. Comparing the live values against
    the record is the same comparison the Cancel button makes, which is the point: the discard
    dialog appears exactly when Cancel would actually lose something.
  */
  const live = form.watch();

  const cardIsDirty = (card: CardKey): boolean => {
    if (!recordValues) return false;
    return CARD_COLUMNS[card].some((col) => {
      const a = live[col as keyof ProfileFormData];
      const b = recordValues[col as keyof ProfileFormData];
      return (a ?? "") !== (b ?? "");
    });
  };

  const cancelCard = (card: CardKey) => {
    if (!recordValues) return;
    // Only this card's fields. `form.reset()` would put back every card, discarding a draft
    // somebody else's Cancel never asked about.
    for (const col of CARD_COLUMNS[card]) {
      const name = col as keyof ProfileFormData;
      form.setValue(name, recordValues[name], { shouldValidate: false });
    }
    form.clearErrors(CARD_COLUMNS[card] as unknown as (keyof ProfileFormData)[]);
  };

  /**
   * The column values this page writes, from one place, so a card's payload and the record it
   * compares against cannot disagree about how a field maps to a column.
   *
   * EMPTY DATES ARE NULL, NOT "". `away_from`/`away_until` are `date` columns; posting an empty
   * string is a Postgres error, so a member who typed a date and then cleared it could not save
   * at all. The optional text columns are the same story with a different symptom: `""` in
   * `urbanizacion` is a value we would then read back and render as present-but-blank.
   */
  const columnValue = (col: string, data: ProfileFormData): unknown => {
    switch (col) {
      case "address_line_2":
        return data.address_line_2 || null;
      case "urbanizacion":
        return data.urbanizacion?.trim() || null;
      case "bloque":
        return data.bloque?.trim() || null;
      case "portal":
        return data.portal?.trim() || null;
      case "escalera":
        return data.escalera?.trim() || null;
      case "away_from":
        return data.away_from || null;
      case "away_until":
        return data.away_until || null;
      default:
        return data[col as keyof ProfileFormData];
    }
  };

  /**
   * Save ONE card.
   *
   * Returns whether the write happened: `EditableCard` re-locks on true and stays open on
   * false, so a member whose save was refused still has what they typed in front of them.
   *
   * VALIDATION IS SCOPED TOO. `form.trigger(fields)` checks only this card's fields. The whole
   * form would refuse to save a corrected phone number because an imported record has no
   * province — a member cannot fix the province from the phone card, so failing there is
   * failing at something they were not asked to do.
   */
  const saveCard = async (card: CardKey): Promise<boolean> => {
    if (!memberId) return false;
    const columns = CARD_COLUMNS[card] as unknown as (keyof ProfileFormData)[];

    const valid = await form.trigger(columns);
    if (!valid) return false;

    setSavingCard(card);
    try {
      const data = form.getValues();
      const payload: Record<string, unknown> = {};
      for (const col of CARD_COLUMNS[card]) payload[col] = columnValue(col, data);

      const { error } = await supabase.from("members").update(payload).eq("id", memberId);
      if (error) throw error;

      // Only the card that owns the language may change the app's language.
      if (card === "preferences" && data.preferred_language !== profile?.preferred_language) {
        await i18n.changeLanguage(data.preferred_language);
      }

      queryClient.invalidateQueries({ queryKey: ["member-profile"] });
      toast.success(t("profile.updateSuccess"));
      return true;
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(t("profile.updateFailed"));
      return false;
    } finally {
      setSavingCard(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-base text-muted-foreground">{t("profile.notFound")}</p>
      </div>
    );
  }

  /** A card's Edit/Save/Cancel wiring, so five cards do not repeat five identical prop sets. */
  const cardProps = (card: CardKey) => ({
    isDirty: cardIsDirty(card),
    saving: savingCard === card,
    onSave: () => saveCard(card),
    onCancel: () => cancelCard(card),
    /*
      NO `fieldset disabled` ON THESE CARDS. Their fields render as plain text when locked
      (`FieldControl`), and a disabled fieldset wrapped around text is a group assistive
      technology announces as unavailable for no reason. The staff record, whose fields stay
      as greyed inputs, keeps the fieldset.
    */
    disableFieldsWhenLocked: false,
  });

  return (
    <Form {...form}>
      {/*
        NO `<form onSubmit>` ANY MORE, and no page-level Save.

        There were both: one form around every field, and one Save in the header that wrote all
        of them. Each card now owns its own write, so a page-level submit would be a second way
        to save that no button points at — and an Enter keypress in any field would fire it,
        writing every card at once, which is the accident this whole change exists to prevent.
      */}
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title={t("profile.title") || t("navigation.myAccount")}
          subtitle={t("profile.subtitle")}
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
                  <AvatarImage src={profile.photo_url || undefined} />
                  <AvatarFallback className="text-3xl bg-primary/10 text-primary">
                    {profile.first_name?.[0]}
                    {profile.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm text-muted-foreground text-center">
                  {t("profile.contactSupportToChange")}
                </p>
              </CardContent>
            </Card>

            {/* Language Preference Card */}
            <EditableCard
              testId="profile-card-preferences"
              title={<span className="text-lg">{t("profile.preferences")}</span>}
              {...cardProps("preferences")}
            >
              <FormField
                control={form.control}
                name="preferred_language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <FieldLabel>{t("profile.preferredLanguage")}</FieldLabel>
                    </FormLabel>
                    <FieldControl
                      testId="profile-field-language"
                      read={
                        MEMBER_LANGUAGES.find((l) => l.code === field.value)
                          ? `${MEMBER_LANGUAGES.find((l) => l.code === field.value)!.flag} ${
                              MEMBER_LANGUAGES.find((l) => l.code === field.value)!.label
                            }`
                          : null
                      }
                    >
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
                    </FieldControl>
                    <p className="text-[0.8125rem] text-muted-foreground">
                      {t("profile.languageDesc")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </EditableCard>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <EditableCard
              testId="profile-card-personal"
              title={
                <span className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5" aria-hidden="true" />
                  {t("profile.personalInfo")}
                </span>
              }
              {...cardProps("personal")}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <FieldLabel>{t("profile.firstName")}</FieldLabel>
                      </FormLabel>
                      <FieldControl testId="profile-field-first-name" read={profile.first_name}>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FieldControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <FieldLabel>{t("profile.lastName")}</FieldLabel>
                      </FormLabel>
                      <FieldControl testId="profile-field-last-name" read={profile.last_name}>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FieldControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/*
                  R7 — DOB and NIE stay locked, WITH A REASON, and the reason is the brief's
                  own sentence. Both said "Cannot be changed", which tells a member what they
                  cannot do and nothing about what they can. See LockedIdentityField.

                  AND THEY STAY LOCKED IN EDIT MODE. `LockedIdentityField` renders no input at
                  all, so pressing Edit on this card unlocks the name fields beside them and
                  leaves these two exactly as they were — which is the point of R7's lock, and
                  is asserted in `memberLockedCards.test.tsx` rather than left to inspection.
                */}
                <LockedIdentityField
                  label={t("profile.dateOfBirth")}
                  value={
                    profile.date_of_birth
                      ? format(new Date(profile.date_of_birth), "dd MMMM yyyy")
                      : null
                  }
                  reason={t("profile.identityLockedReason")}
                  testId="profile-locked-dob"
                />
                <LockedIdentityField
                  label={t("profile.nieDni")}
                  value={profile.nie_dni || null}
                  reason={t("profile.identityLockedReason")}
                  testId="profile-locked-nie"
                />
              </div>
            </EditableCard>

            {/* Contact Information */}
            <EditableCard
              testId="profile-card-contact"
              title={
                <span className="flex items-center gap-2 text-lg">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                  {t("profile.contactInfo")}
                </span>
              }
              {...cardProps("contact")}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <LockedIdentityField
                  label={t("profile.emailAddress")}
                  value={profile.email || null}
                  icon={<Mail className="h-4 w-4" aria-hidden="true" />}
                  reason={t("profile.emailChangeNote")}
                  testId="profile-locked-email"
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <FieldLabel>{t("profile.phoneNumber")}</FieldLabel>
                      </FormLabel>
                      <FieldControl
                        testId="profile-field-phone"
                        /* A number a member can press, not text to retype off their own screen. */
                        read={
                          profile.phone ? (
                            <a
                              href={`tel:${profile.phone.replace(/\s/g, "")}`}
                              className="underline underline-offset-2"
                            >
                              {profile.phone}
                            </a>
                          ) : null
                        }
                      >
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input {...field} className="pl-10" />
                          </div>
                        </FormControl>
                      </FieldControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </EditableCard>

            {/* Address */}
            <EditableCard
              testId="profile-card-address"
              title={
                <span className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                  {t("profile.address")}
                </span>
              }
              {...cardProps("address")}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {(
                  [
                    ["address_line_1", t("profile.addressLine1"), true],
                    ["address_line_2", t("profile.addressLine2"), true],
                    ["city", t("profile.city"), false],
                    ["province", t("profile.province"), false],
                    ["postal_code", t("profile.postalCode"), false],
                  ] as const
                ).map(([name, label, wide]) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem className={wide ? "md:col-span-2" : undefined}>
                        <FormLabel>
                          <FieldLabel>{label}</FieldLabel>
                        </FormLabel>
                        <FieldControl
                          testId={`profile-field-${name}`}
                          read={(profile[name] as string | null) ?? null}
                        >
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FieldControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <LockedIdentityField
                  label={t("profile.country")}
                  value={profile.country || t("common.spain")}
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
                          <FieldLabel>
                            {label} ({t("common.optional")})
                          </FieldLabel>
                        </FormLabel>
                        <FieldControl
                          testId={`profile-field-${name}`}
                          read={(profile[name] as string | null) ?? null}
                        >
                          <FormControl>
                            <Input {...field} placeholder={placeholder} />
                          </FormControl>
                        </FieldControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>

              <p className="mt-4 text-[0.8125rem] text-muted-foreground">
                {t("profile.addressEmergencyNote")}
              </p>

              {/*
                THE MAP PIN, BELOW THE TYPED ADDRESS AND SEPARATE FROM IT (#323).

                It belongs in this card because it is the same question — where do you live —
                but it is deliberately NOT a form field: it saves on its own, through
                member-self-service, and it must not be swept up by a Save button. A typed
                address in rural Almería is regularly a property a driver cannot find at night;
                the pin is the member's answer to that, and only they can give it.

                STILL NOT SWEPT UP, now that the card saves per-card: `CARD_COLUMNS.address`
                names the nine columns this card writes and the location columns are not among
                them, so Save cannot touch the pin either way.

                It sits INSIDE the card and therefore outside the lock only when the card is
                unlocked — the same arrangement the staff record's `manage` cards use for Add
                and Delete: Edit arms the controls, and a control that writes on its own is
                exactly the kind a stray click should not reach on a page somebody is reading
                down the phone.
              */}
              <div className="mt-6 border-t pt-6">
                <HomeLocationRow
                  profile={profile}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["member-profile"] })}
                />
              </div>
            </EditableCard>

            {/*
              AWAY — and the pendant is a separate question from the person.

              The migration: "A device gone quiet and a device in a drawer in Birmingham are
              different problems." An operator seeing a pendant that has not checked in for four
              days needs to know which of those it is before deciding whether to send anybody.

              Member-writable by design: "someone going to the UK for a month should be able to
              say so without ringing the office."
            */}
            <EditableCard
              testId="away-card"
              title={
                <span className="flex items-center gap-2 text-lg">
                  <Plane className="h-5 w-5" aria-hidden="true" />
                  {t("profile.awayTitle", "Going away?")}
                </span>
              }
              description={t(
                "profile.awayHelp",
                "Tell us the dates and we will know your alarm is quiet because you are away, not because something is wrong.",
              )}
              {...cardProps("away")}
            >
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {(
                    [
                      ["away_from", t("profile.awayFrom", "Away from"), "away-from"],
                      ["away_until", t("profile.awayUntil", "Back on"), "away-until"],
                    ] as const
                  ).map(([name, label, testId]) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <FieldLabel>{label}</FieldLabel>
                          </FormLabel>
                          <FieldControl
                            testId={`profile-field-${name}`}
                            read={
                              profile[name]
                                ? format(new Date(profile[name] as string), "dd MMMM yyyy")
                                : null
                            }
                          >
                            <FormControl>
                              <Input type="date" {...field} data-testid={testId} />
                            </FormControl>
                          </FieldControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
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
                  {/*
                    THE SWITCH IS A CONTROL, so it is locked the same way as the inputs beside
                    it — read-only it states the answer in words, because a greyed switch tells
                    a member what they cannot do and a sentence tells them what we hold.
                  */}
                  <FieldControl
                    testId="profile-field-pendant-with-member"
                    read={
                      profile.pendant_with_member ?? true
                        ? t("common.yes", "Yes")
                        : t("common.no", "No")
                    }
                  >
                    <Switch
                      id="pendant_with_member"
                      data-testid="pendant-with-member"
                      checked={live.pendant_with_member}
                      onCheckedChange={(v) => form.setValue("pendant_with_member", v)}
                    />
                  </FieldControl>
                </div>
              </div>
            </EditableCard>

            {/*
              WP3 N9 — the writer `member_notification_optin` never had. The dispatcher has
              refused every send since it shipped because "absent row means no permission" and
              no screen created one.

              `profile`, not the form draft: consent applies to the number we actually hold, and
              a member who has typed a new phone but not saved it has not given us one yet.
            */}
            <NotificationPreferences contact={{ phone: profile.phone, email: profile.email }} />

            {/* GDPR / Data Privacy */}
            <GdprSettingsSection />
          </div>
        </div>
      </div>
    </Form>
  );
}
