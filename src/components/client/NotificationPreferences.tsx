import { ExternalLink, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useMemberNotificationOptin } from "@/hooks/useMemberNotificationOptin";
import { waNumber } from "@/lib/phone";
import {
  canReachOn,
  isOptedIn,
  NOTIFICATION_CHANNELS,
  type MemberContactDetails,
} from "@/lib/notificationChannels";

interface NotificationPreferencesProps {
  contact: MemberContactDetails;
}

/**
 * HOW A MEMBER SAYS WE MAY CONTACT THEM — WP3 N9.
 *
 * The dispatcher has refused every send since it shipped, because `member_notification_optin`
 * had no writer anywhere: *"absent row means no permission"*, and no screen created one. This is
 * that writer, and it belongs to the member rather than to staff.
 *
 * WHAT IT PROMISES, and what it must not. It records permission; it does not promise delivery.
 * A channel is also gated on a global flag that only Lee can turn on (D7) and that a member
 * cannot read — so the copy is about permission (*"you are telling us we may"*) and never about
 * when a message will arrive. Saying "you will now receive texts" would be false today and
 * nobody would know until they noticed the silence.
 *
 * THE SOS PATH IS NOT THIS. An emergency call reaches a member whatever is set here. Somebody
 * turning everything off must not be left wondering whether they have switched off their alarm,
 * so the card says so in as many words.
 *
 * WITHDRAWING IS THE SAME CONTROL, one press, no dialog, no reason asked for. Anything else is a
 * dark pattern with a compliance department attached.
 *
 * A CHANNEL WE CANNOT REACH THEM ON IS OFF AND DISABLED, naming the missing detail. Recording
 * `true` for a channel with no address would be a row that reads as permission and can never be
 * honoured — and it is the member's own profile page that fixes it, one card away.
 */
export function NotificationPreferences({ contact }: NotificationPreferencesProps) {
  const { t } = useTranslation();
  const { settings } = useCompanySettings();
  const { data: rows, isLoading, setChannel } = useMemberNotificationOptin();

  // Same source every other WhatsApp link on this product uses, and it is null-safe: with no
  // number configured the handshake line is not rendered at all rather than linking to nowhere.
  const whatsapp = waNumber(settings.emergency_phone);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t("notifications.title", "How we may contact you")}
        </CardTitle>
        <CardDescription>
          {t(
            "notifications.subtitle",
            "For updates about your pendant and your order. Your emergency calls reach us whatever you choose here — this does not switch anything off.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("notifications.loading", "Loading your choices…")}
          </p>
        ) : (
          NOTIFICATION_CHANNELS.map((spec) => {
            const reachable = canReachOn(spec, contact);
            const on = reachable && isOptedIn(rows, spec.channel);
            const inputId = `notify-${spec.channel}`;

            return (
              <div key={spec.channel} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <label htmlFor={inputId} className="text-sm font-medium">
                    {t(spec.label.key, spec.label.fallback)}
                  </label>
                  <p className="text-sm text-muted-foreground">
                    {t(spec.description.key, spec.description.fallback)}
                  </p>

                  {!reachable && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {spec.requires === "phone"
                        ? t(
                            "notifications.needPhone",
                            "We do not have a mobile number for you. Add one above and this can be turned on.",
                          )
                        : t(
                            "notifications.needEmail",
                            "We do not have an email address for you. Add one above and this can be turned on.",
                          )}
                    </p>
                  )}

                  {spec.needsHandshake && on && whatsapp && (
                    <a
                      className="inline-flex items-center gap-1 text-sm underline mt-1"
                      href={`https://wa.me/${whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("notifications.whatsappHandshake", "Send us a WhatsApp message to finish")}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                <Switch
                  id={inputId}
                  checked={on}
                  disabled={!reachable || setChannel.isPending}
                  onCheckedChange={(next) =>
                    setChannel.mutate(
                      { channel: spec.channel, optedIn: next },
                      {
                        onError: (error) =>
                          toast.error(
                            t("notifications.saveFailed", "That choice was not saved: {{message}}", {
                              message: error instanceof Error ? error.message : "unknown error",
                            }),
                          ),
                      },
                    )
                  }
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
