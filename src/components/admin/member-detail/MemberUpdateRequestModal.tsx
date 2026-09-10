import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Loader2, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { functionError } from "@/lib/functionError";
import { useMemberMissingInfo } from "@/hooks/useMemberMissingInfo";
import {
  REQUIRED_REASON_LABELS,
  requestableFields,
  requiredFieldByKey,
} from "@/lib/memberRequiredFields";
import {
  UpdateLinkResult,
  type UpdateRequestResult,
} from "@/components/admin/member-detail/UpdateLinkResult";

/**
 * ASK THE MEMBER FOR WHAT IS MISSING — off ONE definition of missing.
 *
 * THIS COMPONENT USED TO CARRY THE FIFTH OPINION. It had its own inline list — NIE/DNI, six
 * medical fields, "fewer than two emergency contacts", "contacts missing email" — written
 * nowhere else and reconciled with nothing, while the readiness queue, the protection
 * checklist, the registration schema and `medicalFields.ts` each had their own. It now reads
 * `memberRequiredFields.ts` like every other surface, so the number here, the badge in the
 * header and the column in the members list cannot disagree.
 *
 * Only what a MEMBER can supply is offered. Asking somebody for their pendant's IMEI, to test
 * their own pendant, or to activate their own subscription is asking for something they cannot
 * give on a link whose whole promise is "fill this in and you are done".
 */
interface MemberData {
  id: string;
  first_name: string;
  last_name: string;
  /* Nullable since 20260910170000. The link this modal sends is how an address is COLLECTED, so
     a member with none is exactly who it is for — see the guard on the send below. */
  email: string | null;
  phone: string;
  nie_dni: string | null;
  address_line_2: string | null;
  preferred_language: string | null;
}

interface EmergencyContact {
  id: string;
  contact_name: string;
  email: string | null;
}

interface MemberUpdateRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberData;
  /**
   * A selection made elsewhere — the Missing-info dialog ticks the items with the reasons in
   * front of it and hands them over. Absent, this modal offers everything currently missing.
   */
  preselectedFields?: string[];
  /** Called after a link is created, so a badge showing the count can re-read. */
  onSent?: () => void;
}

export function MemberUpdateRequestModal({
  open,
  onOpenChange,
  member,
  preselectedFields,
  onSent,
}: MemberUpdateRequestModalProps) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  /* `?? ""`, because members.email is nullable since 20260910170000. An empty string is the
     honest starting point: the guard on send already refuses it, so a member with no address of
     their own cannot send to nowhere — they must pick a contact's, which is exactly how an
     address gets collected for somebody who has none. */
  const [recipientEmail, setRecipientEmail] = useState(member.email ?? "");
  const [result, setResult] = useState<UpdateRequestResult | null>(null);

  const { data, isLoading } = useMemberMissingInfo(member.id, open && !preselectedFields);

  // Only the askable ones, and only while there is no selection handed in.
  const askable = requestableFields(data?.missing ?? []);
  const offered = preselectedFields
    ? preselectedFields
        .map((key) => requiredFieldByKey(key))
        .filter((f): f is NonNullable<typeof f> => !!f && f.memberCanSupply)
    : askable;

  useEffect(() => {
    if (!open) return;
    setSelectedFields(offered.map((f) => f.key));
    // Re-tick when the offer changes, not on every render: `offered` is rebuilt each pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offered.map((f) => f.key).join(",")]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: contactsData } = await supabase
        .from("emergency_contacts")
        .select("id, contact_name, email")
        .eq("member_id", member.id)
        .order("priority_order");
      if (!cancelled) setContacts(contactsData ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, member.id]);

  const handleSend = async () => {
    if (!recipientEmail || selectedFields.length === 0) {
      toast.error(t("crm.selectFieldsAndEmail", "Please select at least one field and an email"));
      return;
    }

    setSending(true);
    try {
      const { data: sendData, error } = await supabase.functions.invoke(
        "send-member-update-request",
        {
          body: {
            memberId: member.id,
            recipientEmail,
            requestedFields: selectedFields,
            memberName: `${member.first_name} ${member.last_name}`,
            preferredLanguage: member.preferred_language || "en",
          },
        },
      );

      if (error) throw await functionError(error);

      // The dialog deliberately STAYS OPEN. Closing it on success would throw away the link,
      // which is the one thing a staff member ringing the member actually needs.
      setResult(sendData as UpdateRequestResult);
      onSent?.();
      toast.success(t("crm.updateRequestSent", "Update link created"));
    } catch (error) {
      console.error("Error sending update request:", error);
      toast.error(t("crm.updateRequestFailed", "Failed to send update request"));
    } finally {
      setSending(false);
    }
  };

  const close = (next: boolean) => {
    if (!next) setResult(null);
    onOpenChange(next);
  };

  const toggleField = (key: string) =>
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {t("crm.requestMemberUpdate", "Ask the member for what is missing")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "crm.requestUpdateDescription",
              "Creates a one-time link. We send it, and you also get it here to read out or send yourself.",
            )}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <UpdateLinkResult result={result} />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : offered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Check className="h-12 w-12 text-alert-resolved mb-4" />
            <p className="font-medium">
              {t("crm.noMissingFields", "There is nothing to ask them for")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "crm.allFieldsComplete",
                "Everything a member can supply is already on their record.",
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-alert-battery" />
                {t("crm.missingFields", "We will ask for")} ({offered.length})
              </Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {offered.map((field) => (
                  <div key={field.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`ask-${field.key}`}
                      checked={selectedFields.includes(field.key)}
                      onCheckedChange={() => toggleField(field.key)}
                    />
                    <label htmlFor={`ask-${field.key}`} className="text-sm flex-1 cursor-pointer">
                      {t(field.label.key, field.label.fallback)}
                    </label>
                    <Badge variant="secondary" className="text-xs">
                      {t(
                        REQUIRED_REASON_LABELS[field.why].key,
                        REQUIRED_REASON_LABELS[field.why].fallback,
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="recipient">{t("crm.selectRecipient", "Send the email to")}</Label>
              <Select value={recipientEmail} onValueChange={setRecipientEmail}>
                <SelectTrigger id="recipient" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Offered only when there IS one. A SelectItem with an empty value is an
                      option that looks selectable and sends nowhere. */}
                  {member.email && (
                    <SelectItem value={member.email}>
                      {member.email} ({t("common.primary", "Primary")})
                    </SelectItem>
                  )}
                  {contacts
                    .filter((c) => c.email)
                    .map((contact) => (
                      <SelectItem key={contact.id} value={contact.email!}>
                        {contact.email} ({contact.contact_name})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => close(false)}>{t("common.done", "Done")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || isLoading || selectedFields.length === 0}
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("common.sending", "Sending...")}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {t("crm.sendUpdateRequest", "Send Update Request")}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
