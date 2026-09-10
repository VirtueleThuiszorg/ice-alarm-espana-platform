import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Mail, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";
import { dbMessage } from "@/lib/dbMessage";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { logEmail, logInteraction, logSms, logWhatsApp } from "@/lib/communicationLogger";

/**
 * FOUR BUTTONS THAT USED TO BE FOUR TOASTS.
 *
 * `MessagesTab` carried SMS, WhatsApp, Email and Log Call, and each one did this:
 *
 *     onClick={() => toast.info("SMS integration coming soon")}
 *
 * A control that announces its own absence is worse than no control: it occupies the place a
 * working one would, so nobody adds the working one, and an operator who needs to text a member
 * discovers that at the moment they need to.
 *
 * ALL FOUR EXIST TODAY. `twilio-sms` sends the SMS that `send-payment-link` already sends
 * through it, `send-email` is the mail path the rest of the product uses, WhatsApp is a handoff
 * to the operator's own client (wa.me), and a logged call is a row in `member_interactions`.
 *
 * AND THEY FIX A DEAD READER. `communicationLogger.ts` exports ten log functions and, until
 * this change, was imported by NOTHING — while `ActivityTab` and the call-centre's alert panel
 * both READ `member_interactions`. Two screens that could only ever be empty, with no hint that
 * the writer was never wired up (WIRING_REGISTER: "Communication log", dead). These four
 * controls are its first callers.
 *
 * WHAT IS NOT CLAIMED. The WhatsApp button opens the operator's WhatsApp with the text ready;
 * it cannot know whether they pressed send there, so its log row says a handoff happened and
 * not that a message was delivered. A "sent" we cannot see is the failure this whole register
 * exists to name.
 */

export type QuickChannel = "sms" | "whatsapp" | "email" | "call";

const CHANNEL_LABEL: Record<QuickChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "Email",
  call: "Log Call",
};

/** Digits only, with the Spanish country code assumed when a local number was typed. */
export function waNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (digits.length < 9) return null;
  return digits.length === 9 ? `34${digits}` : digits;
}

export function waLink(phone: string | null | undefined, message: string): string | null {
  const number = waNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

interface MemberQuickContactProps {
  memberId: string;
  memberName: string;
  phone: string | null | undefined;
  email: string | null | undefined;
  /** Prefilled from whatever the operator has typed in the reply box. */
  draft: string;
  onLogged?: () => void;
}

export function MemberQuickContact({
  memberId,
  memberName,
  phone,
  email,
  draft,
  onLogged,
}: MemberQuickContactProps) {
  const { t } = useTranslation();
  const { data: staff } = useCurrentStaff();
  const [channel, setChannel] = useState<QuickChannel | null>(null);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);

  const openChannel = (next: QuickChannel) => {
    setChannel(next);
    setBody(draft);
    setSubject(t("adminMemberDetail.quick.defaultSubject", "About your ICE Alarm membership"));
  };

  const close = () => {
    setChannel(null);
    setBody("");
    setBusy(false);
  };

  const missingAddress =
    (channel === "sms" || channel === "whatsapp" || channel === "call") && !phone
      ? t("adminMemberDetail.quick.noPhone", "We have no phone number for this member.")
      : channel === "email" && !email
        ? t("adminMemberDetail.quick.noEmail", "We have no email address for this member.")
        : null;

  const send = async () => {
    if (!channel || missingAddress) return;
    setBusy(true);
    try {
      if (channel === "sms") {
        const { error } = await supabase.functions.invoke("twilio-sms", {
          body: { to: phone, message: body, recipientType: "member" },
        });
        if (error) throw await functionError(error);
        await logSms({ memberId, staffId: staff?.id ?? "", phoneNumber: phone!, messageContent: body });
        toast.success(t("adminMemberDetail.quick.smsSent", "Text message sent"));
      } else if (channel === "email") {
        const { error } = await supabase.functions.invoke("send-email", {
          body: {
            to: email,
            subject,
            html_body: `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
            text_body: body,
            module: "member",
            related_entity_id: memberId,
            related_entity_type: "member",
          },
        });
        if (error) throw await functionError(error);
        await logEmail({
          memberId,
          staffId: staff?.id,
          emailAddress: email!,
          subject,
          content: body,
        });
        toast.success(t("adminMemberDetail.quick.emailSent", "Email sent"));
      } else if (channel === "whatsapp") {
        const link = waLink(phone, body);
        if (!link) throw new Error(t("adminMemberDetail.quick.noPhone", "We have no phone number for this member."));
        window.open(link, "_blank", "noopener,noreferrer");
        await logWhatsApp({
          memberId,
          staffId: staff?.id ?? "",
          phoneNumber: phone!,
          messageContent: body,
        });
        // Deliberately not "sent": WhatsApp opened with the text ready, and what happens in
        // that window is not something this app can see.
        toast.success(t("adminMemberDetail.quick.whatsappOpened", "WhatsApp opened with your message"));
      } else {
        /*
          ONE ROW, WITH THE OPERATOR'S NOTE ON IT. `logCallStart` writes "Call to <number>" and
          nothing else, which answers "did anybody ring her" but not "what was said" — and the
          second question is the one somebody reading the record at 3am is asking.
        */
        await logInteraction({
          memberId,
          staffId: staff?.id,
          interactionType: "call_outbound",
          description: body.trim() || `Call to ${phone}`,
          metadata: { phone: phone!, direction: "outbound", logged_manually: true },
        });
        toast.success(t("adminMemberDetail.quick.callLogged", "Call logged"));
      }
      onLogged?.();
      close();
    } catch (error) {
      // The transport's own sentence — "Twilio not configured" is an action, "Failed" is not.
      toast.error(dbMessage(error, t("adminMemberDetail.quick.failed", "That did not go through")));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button variant="outline" size="sm" onClick={() => openChannel("sms")} data-testid="quick-sms">
          <MessageSquare className="mr-1 h-3 w-3" />
          SMS
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openChannel("whatsapp")}
          data-testid="quick-whatsapp"
        >
          <MessageSquare className="mr-1 h-3 w-3" />
          WhatsApp
        </Button>
        <Button variant="outline" size="sm" onClick={() => openChannel("email")} data-testid="quick-email">
          <Mail className="mr-1 h-3 w-3" />
          Email
        </Button>
        <Button variant="outline" size="sm" onClick={() => openChannel("call")} data-testid="quick-call">
          <Phone className="mr-1 h-3 w-3" />
          {t("adminMemberDetail.quick.logCall", "Log Call")}
        </Button>
      </div>

      <Dialog open={channel !== null} onOpenChange={(next) => (next ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {channel ? CHANNEL_LABEL[channel] : ""} — {memberName}
            </DialogTitle>
            <DialogDescription>
              {channel === "call"
                ? t(
                    "adminMemberDetail.quick.callBody",
                    "Records that you rang them, on their record and in the activity log. It does not place the call.",
                  )
                : channel === "whatsapp"
                  ? t(
                      "adminMemberDetail.quick.whatsappBody",
                      "Opens WhatsApp with this text ready to send. We record that you did — not that it arrived.",
                    )
                  : t(
                      "adminMemberDetail.quick.sendBody",
                      "Goes to the member and is recorded on their record.",
                    )}
            </DialogDescription>
          </DialogHeader>

          {missingAddress ? (
            <p className="text-sm text-destructive" data-testid="quick-missing-address">
              {missingAddress}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground" data-testid="quick-destination">
                {channel === "email" ? email : phone}
              </p>
              {channel === "email" ? (
                <div>
                  <Label htmlFor="quick-subject">{t("common.subject", "Subject")}</Label>
                  <Input
                    id="quick-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
              ) : null}
              <div>
                <Label htmlFor="quick-body">
                  {channel === "call"
                    ? t("adminMemberDetail.quick.callNote", "What was the call about?")
                    : t("common.message", "Message")}
                </Label>
                <Textarea
                  id="quick-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={send}
              disabled={busy || !!missingAddress || (channel !== "call" && !body.trim())}
              data-testid="quick-confirm"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {channel === "call"
                ? t("adminMemberDetail.quick.logIt", "Log it")
                : channel === "whatsapp"
                  ? t("adminMemberDetail.quick.openWhatsapp", "Open WhatsApp")
                  : t("common.send", "Send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
