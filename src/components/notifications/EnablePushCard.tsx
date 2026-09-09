import { BellRing, Loader2, Smartphone, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * "Enable notifications on this phone" — the one control that turns a browser into a pager.
 *
 * EVERY STATE SAYS WHAT TO DO NEXT. A card that renders a dead button when push is not
 * configured, or when iOS needs the installed app first, is how somebody concludes the feature
 * is broken and stops trying — and the whole point of this work is that an alert reaches a
 * human. So `not_configured` names the missing variables, `ios_needs_install` gives the Share →
 * Add to Home Screen instruction, and `denied` says the browser is the only place that can undo
 * it.
 */
export function EnablePushCard() {
  const { t } = useTranslation();
  const { state, missingEnv, devices, isBusy, enable, disable } = usePushNotifications();

  const heading = t("push.title", "Notifications on this phone");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5" aria-hidden="true" />
          {heading}
          {state === "enabled" && (
            <Badge variant="secondary">{t("push.badgeOn", "On")}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t(
            "push.description",
            "Sales, enquiries and alerts arrive as a notification even when this page is closed. Enable it on every phone you carry — a token belongs to one device, not to your account.",
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {state === "not_configured" && (
          <div
            role="status"
            className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">
                {t("push.notConfigured", "Push is not set up on this deployment yet.")}
              </p>
              <p>
                {t(
                  "push.notConfiguredDetail",
                  "A Firebase project and these environment variables are needed first:",
                )}
              </p>
              {/* Named, because "not configured" sends somebody hunting through six settings
                  pages — and the VAPID key lives on a different one from the other five. */}
              <ul className="list-inside list-disc font-mono text-xs">
                {missingEnv.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {state === "unsupported" && (
          <p role="status" className="text-sm text-muted-foreground">
            {t(
              "push.unsupported",
              "This browser cannot receive push notifications. Chrome, Edge, Firefox, or Safari on an installed iPhone app can.",
            )}
          </p>
        )}

        {state === "ios_needs_install" && (
          <div role="status" className="flex gap-3 rounded-md border bg-muted/40 p-3 text-sm">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">
                {t("push.iosTitle", "On iPhone and iPad, install the app first.")}
              </p>
              {/* Apple grants the notification permission only to a home-screen web app (since
                  iOS 16.4). In a normal Safari tab the request is refused with no explanation,
                  so this has to be said BEFORE the tap, not after it. */}
              <p>
                {t(
                  "push.iosSteps",
                  "In Safari, tap Share, then \"Add to Home Screen\". Open the app from your Home Screen and enable notifications there. Apple does not allow it from a Safari tab.",
                )}
              </p>
            </div>
          </div>
        )}

        {state === "denied" && (
          <p role="status" className="text-sm text-muted-foreground">
            {t(
              "push.denied",
              "Notifications are blocked for this site. Only your browser's site settings can undo that — look for the padlock or the bell in the address bar.",
            )}
          </p>
        )}

        {(state === "available" || state === "enabled") && (
          <div className="flex flex-wrap items-center gap-2">
            {state === "available" ? (
              <Button onClick={() => void enable()} disabled={isBusy}>
                {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t("push.enable", "Enable notifications on this phone")}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void disable()} disabled={isBusy}>
                {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t("push.disable", "Turn off on this phone")}
              </Button>
            )}
          </div>
        )}

        {devices.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t("push.devices", "Your registered devices")}</p>
            <ul className="space-y-1 text-muted-foreground">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center gap-2">
                  <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{device.label ?? device.platform}</span>
                  <span className="text-xs">
                    {t("push.lastSeen", "last seen")} {new Date(device.last_seen_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EnablePushCard;
