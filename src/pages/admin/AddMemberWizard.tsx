import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Staff-initiated member creation — the thing the old ten-step wizard promised and never did.
 *
 * WHAT WAS HERE BEFORE, TWICE OVER. First a ten-step wizard ending in "Member registered
 * successfully" that contained NO DATA ACCESS AT ALL: an operator could take a full set of
 * personal and medical details over the phone, walk every step, be told the member existed, and
 * nothing was written anywhere. Then an honest "not available" notice, because building the real
 * thing was blocked on the payer-vs-member decision (MEMBER_ONBOARDING.md Q1).
 *
 * That decision is made — PAYER_MODEL.md, option B: the payer is a distinct person, linked
 * through the subscription. So this is now buildable, and this is it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   - It does NOT activate anybody. The member is created `inactive`. Activation is the payment
 *     webhook's job and nothing else's (golden rule 4). There is no status control on this form.
 *   - It does NOT collect medical information or emergency contacts. Those belong to the second
 *     stage (ONBOARDING_SPLIT.md), and the operator is handed straight to the member record
 *     where the attributed operator route lives — ContactsTab/MedicalTab, whose writes are
 *     stamped `operator_assisted` with the operator's staff id by the provenance trigger (#160).
 *   - It does NOT send email, and does not claim to. Email is not deliverable (unset secret,
 *     icealarm.es unverified with Resend, SPF/DKIM/DMARC unpublished), so a screen that said
 *     "we've emailed them" would be the same lie as the wizard it replaces.
 *   - It does NOT attach the payer to a subscription, because there is no subscription until
 *     payment. The payer is recorded so it exists on file; the link is made when the
 *     subscription is created. The review step says so rather than implying otherwise.
 *
 * Writes go client-side under the staff policies ("Staff can manage members", "Staff manage
 * payers"). That is deliberate and is not the bug class clientWriteSweep.test.ts guards: that
 * sweep is about NON-staff surfaces writing sensitive tables. This is an admin surface, the
 * operator is already able to read every member's medical record, and routing it through an
 * edge function would add a hop without adding a check.
 */

const STEP_MEMBER = 1;
const STEP_PAYER = 2;
const STEP_REVIEW = 3;
const LAST_STEP = STEP_REVIEW;

interface MemberForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
}

interface PayerForm {
  fullName: string;
  email: string;
  phone: string;
  relationship: string;
}

const emptyMember: MemberForm = {
  firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "",
  addressLine1: "", city: "", province: "", postalCode: "",
};
const emptyPayer: PayerForm = { fullName: "", email: "", phone: "", relationship: "" };

export default function AddMemberWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isStaff } = useAuth();

  const [step, setStep] = useState(STEP_MEMBER);
  const [member, setMember] = useState<MemberForm>(emptyMember);
  const [hasSeparatePayer, setHasSeparatePayer] = useState(false);
  const [payer, setPayer] = useState<PayerForm>(emptyPayer);
  const [submitting, setSubmitting] = useState(false);

  const memberValid = !!(
    member.firstName && member.lastName && member.email && member.phone &&
    member.dateOfBirth && member.addressLine1 && member.city && member.province &&
    member.postalCode
  );
  const payerValid = !hasSeparatePayer || !!(payer.fullName && payer.email);
  const canAdvance = step === STEP_MEMBER ? memberValid : step === STEP_PAYER ? payerValid : true;

  const handleCreate = async () => {
    if (!memberValid || !payerValid) return;
    setSubmitting(true);
    try {
      // The payer FIRST, so a payer failure never leaves an orphaned member. There is no
      // transaction across two client calls, so the order is the mitigation: a payer with no
      // member is harmless and reusable, a member whose payer silently vanished is not.
      let payerId: string | null = null;
      if (hasSeparatePayer) {
        const { data, error } = await supabase
          .from("payers")
          .insert({
            full_name: payer.fullName,
            email: payer.email,
            phone: payer.phone || null,
            relationship: payer.relationship || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        payerId = data.id;
      }

      const { data: created, error: memberError } = await supabase
        .from("members")
        .insert({
          first_name: member.firstName,
          last_name: member.lastName,
          email: member.email,
          phone: member.phone,
          date_of_birth: member.dateOfBirth,
          address_line_1: member.addressLine1,
          city: member.city,
          province: member.province,
          postal_code: member.postalCode,
          // NOT 'active'. The payment webhook activates a member and nothing else does.
          status: "inactive",
        })
        .select("id")
        .single();

      if (memberError) throw memberError;

      // The record of who created this and why, so a member that appears from nowhere can be
      // traced to the call that produced it.
      await supabase.from("activity_logs").insert({
        entity_type: "member",
        entity_id: created.id,
        action: "member_created_by_staff",
        new_values: {
          created_via: "admin_add_member",
          payer_recorded: payerId !== null,
          payer_id: payerId,
        },
      });

      toast.success(
        t("addMember.created", "Member record created. They are NOT yet active — payment activates them."),
      );
      // Straight to the member record: the next thing on the call is their emergency contacts,
      // and that is where the attributed operator route lives.
      navigate(`/admin/members/${created.id}?tab=contacts`);
    } catch (err) {
      // Loud, and specific. The failure mode this page exists to end is a success message with
      // no row behind it.
      console.error("Failed to create member:", err);
      toast.error(
        t("addMember.createFailed", "Nothing was saved. {{reason}}", {
          reason: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("addMember.staffOnly", "Staff only")}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const field = (
    id: keyof MemberForm,
    label: string,
    type = "text",
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={member[id]}
        onChange={(e) => setMember({ ...member, [id]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Button variant="ghost" onClick={() => navigate("/admin/members")} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        {t("addMember.back", "Back to Members")}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t("addMember.title", "Add a member")}
          </CardTitle>
          <CardDescription>
            {t(
              "addMember.subtitle",
              "Step {{step}} of {{total}}. The member is created inactive — taking payment is what activates them.",
              { step, total: LAST_STEP },
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === STEP_MEMBER && (
            <div className="grid gap-4 sm:grid-cols-2">
              {field("firstName", t("addMember.firstName", "First name"))}
              {field("lastName", t("addMember.lastName", "Last name"))}
              {field("email", t("addMember.email", "Email"), "email")}
              {field("phone", t("addMember.phone", "Phone"), "tel")}
              {field("dateOfBirth", t("addMember.dob", "Date of birth"), "date")}
              {field("addressLine1", t("addMember.address", "Address"))}
              {field("city", t("addMember.city", "City"))}
              {field("province", t("addMember.province", "Province"))}
              {field("postalCode", t("addMember.postalCode", "Postal code"))}
            </div>
          )}

          {step === STEP_PAYER && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3">
                <Checkbox
                  id="separate-payer"
                  checked={hasSeparatePayer}
                  onCheckedChange={(v) => setHasSeparatePayer(v === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="separate-payer" className="font-medium">
                    {t("addMember.someoneElsePays", "Somebody else pays for this member")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "addMember.payerExplainer",
                      "A billing relationship only. Paying for someone gives no access to their medical information, location or alerts — that needs the member's own consent.",
                    )}
                  </p>
                </div>
              </div>

              {hasSeparatePayer && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="payer-name">{t("addMember.payerName", "Payer's full name")}</Label>
                    <Input id="payer-name" value={payer.fullName}
                      onChange={(e) => setPayer({ ...payer, fullName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="payer-email">{t("addMember.payerEmail", "Payer's email")}</Label>
                    <Input id="payer-email" type="email" value={payer.email}
                      onChange={(e) => setPayer({ ...payer, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="payer-phone">{t("addMember.payerPhone", "Payer's phone")}</Label>
                    <Input id="payer-phone" type="tel" value={payer.phone}
                      onChange={(e) => setPayer({ ...payer, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="payer-rel">{t("addMember.payerRelationship", "Relationship to member")}</Label>
                    <Input id="payer-rel" value={payer.relationship}
                      onChange={(e) => setPayer({ ...payer, relationship: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === STEP_REVIEW && (
            <div className="space-y-3" data-testid="add-member-review">
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">
                  {member.firstName} {member.lastName}
                </p>
                <p className="text-muted-foreground">{member.email} · {member.phone}</p>
                <p className="text-muted-foreground">
                  {member.addressLine1}, {member.city}, {member.province} {member.postalCode}
                </p>
              </div>

              {hasSeparatePayer && (
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium">
                    {t("addMember.payerHeading", "Paid for by")}: {payer.fullName}
                  </p>
                  <p className="text-muted-foreground">{payer.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "addMember.payerNotAttachedYet",
                      "Recorded now, and linked to the subscription when payment is taken.",
                    )}
                  </p>
                </div>
              )}

              {/*
                What this does NOT do, said on the screen. The wizard this replaces claimed to
                have registered a member and wrote nothing; the way to not repeat that is to be
                explicit about what has and has not happened.
              */}
              <div
                role="note"
                className="space-y-1 rounded-md border-2 border-amber-500/60 bg-amber-500/10 p-3 text-sm"
              >
                <p className="font-semibold">{t("addMember.whatHappensTitle", "What this does")}</p>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  <li>{t("addMember.whatHappens1", "Creates the member record as INACTIVE. Payment is what activates them.")}</li>
                  <li>{t("addMember.whatHappens2", "Records the payer, if there is one. No subscription is created.")}</li>
                  <li>{t("addMember.whatHappens3", "Sends nothing. No email goes out — take their emergency contacts on this call.")}</li>
                  <li>{t("addMember.whatHappens4", "Takes you to their record so you can add contacts now.")}</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={step === STEP_MEMBER || submitting}
          onClick={() => setStep(step - 1)}
        >
          {t("addMember.previous", "Back")}
        </Button>

        {step < LAST_STEP ? (
          <Button disabled={!canAdvance} onClick={() => setStep(step + 1)} className="gap-2">
            {t("addMember.next", "Next")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={submitting || !memberValid} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("addMember.create", "Create member record")}
          </Button>
        )}
      </div>
    </div>
  );
}
