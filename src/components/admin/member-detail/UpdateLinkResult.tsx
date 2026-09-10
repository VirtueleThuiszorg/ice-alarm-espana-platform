import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * THE LINK, ON SCREEN, WHATEVER THE TRANSPORTS DID — one component, two callers.
 *
 * `send-member-update-request` returns the URL and a named outcome per channel precisely so
 * this can be shown: the staff member on the phone to a member who does not use email needs
 * the link itself, not a report that an email was sent. Extracted from
 * `MemberUpdateRequestModal` when the Missing-info dialog needed the same panel — a second
 * copy is how one of them quietly stops showing the link.
 */

export interface UpdateRequestResult {
  updateLink: string;
  expiresAt?: string;
  delivery?: Array<{ channel: string; to: string | null; outcome: string; detail?: string }>;
}

const DELIVERY_TEXT: Record<string, string> = {
  sent: "sent",
  failed: "could not be sent",
  skipped_channel_off: "channel switched off",
  skipped_not_configured: "not set up yet",
  skipped_no_address: "nowhere to send it",
};

export function UpdateLinkResult({ result }: { result: UpdateRequestResult }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(result.updateLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A clipboard refusal must not read as a failure to create the link.
      toast.error(t("crm.copyFailed", "Could not copy — select the link and copy it"));
    }
  };

  return (
    <div className="space-y-4" data-testid="update-request-result">
      <div className="rounded-lg border p-3 space-y-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4" />
          {t("crm.updateLink", "The member's link")}
        </Label>
        <div className="flex gap-2">
          <Input
            readOnly
            value={result.updateLink}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="update-request-link"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={copyLink}
            aria-label={t("common.copy", "Copy")}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "crm.updateLinkHint",
            "Works once, for 7 days. Read it out or send it yourself if nothing below was delivered.",
          )}
        </p>
      </div>
      <div className="space-y-1">
        {(result.delivery ?? []).map((d) => (
          <p key={d.channel} className="text-sm">
            <span className="capitalize">{d.channel}</span>:{" "}
            <span className={d.outcome === "sent" ? "text-alert-resolved" : "text-muted-foreground"}>
              {DELIVERY_TEXT[d.outcome] ?? d.outcome}
            </span>
            {d.to ? <span className="text-muted-foreground"> → {d.to}</span> : null}
          </p>
        ))}
      </div>
    </div>
  );
}
