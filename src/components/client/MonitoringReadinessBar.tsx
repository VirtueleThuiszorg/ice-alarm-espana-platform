import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";

/**
 * The member-facing "we still need your emergency contacts" bar.
 *
 * TWO SURFACES, TWO REGISTERS, ONE FACT. The operator card's version of this state shouts
 * (ICE_OPERATOR_CARD_SPEC.md §5.1.4): NO EMERGENCY CONTACTS, red, uppercase, addressed to a
 * professional mid-alert who needs to know in one glance that level 5 of the ladder will do
 * nothing. This one is addressed to an elderly person who has just bought a personal alarm and
 * is sitting at home. Red capitals read to that reader as reproach or emergency — which produces
 * anxiety or shame, not action. See §6 of the spec for the full contract.
 *
 * WHAT DOES NOT CHANGE, because §0.1 is still binding — a fact that changes what the reader does
 * must be impossible to miss:
 *   - prominent, full width, above the page content, on EVERY member page
 *   - not dismissible, not collapsible. A member who dismisses it is a member who stays
 *     unreachable, and the dismissal would be the last thing anyone heard about it
 *   - renders ONLY on a settled zero (§5.1.2). `undefined` means "not known yet" and renders
 *     nothing: a bar keyed on a falsy value alone flashes on every page load, and a warning
 *     people are trained to ignore is worse than no warning
 *   - a failed read stays unknown rather than becoming either a false all-clear or a false alarm
 *   - never a blocker. It informs; it does not gate a single route or control
 *
 * NO EMAIL SENTENCE. This used to say "Use the link we emailed you". No such email was sent:
 * GMAIL_APP_PASSWORD is unset, icealarm.es is unverified with Resend, and SPF/DKIM/DMARC are
 * unpublished. Telling a member to look for a message that was never sent sends them to an empty
 * inbox and teaches them the product lies. The two routes offered are the two that work: the
 * in-app button, and the phone.
 *
 * ONE READ, MOVED — NOT ADDED. This read used to sit in ClientDashboard alongside the banner.
 * Both moved here together, so the total number of reads is unchanged; the dashboard no longer
 * performs it. Readiness is DERIVED and read, never recomputed (READINESS_MODEL.md §2), and a
 * member reads exactly their own row (proven in the #123 harness).
 */
export function MonitoringReadinessBar({ memberId }: { memberId: string | null }) {
  const { t } = useTranslation();
  const { settings } = useCompanySettings();
  const [monitoringReady, setMonitoringReady] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("member_monitoring_readiness")
        .select("monitoring_ready")
        .eq("member_id", memberId)
        .maybeSingle();
      if (cancelled || error) return; // unknown, not a false all-clear and not a false alarm
      setMonitoringReady(data?.monitoring_ready ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (monitoringReady !== false) return null;

  const phone = settings.emergency_phone;

  return (
    <div
      role="status"
      data-testid="member-readiness-bar"
      /*
        Amber, not alarm-red: this is a task, not an emergency. The member's alarm is working.
        amber-950 on amber-50 (and amber-50 on amber-950 in dark) is far above the 4.5:1 floor,
        and the border carries the prominence that the colour no longer shouts.
      */
      className="w-full border-b-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950 dark:bg-amber-950 dark:text-amber-50 md:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {/* Not colour alone: the icon and the sentences carry the meaning without it. */}
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-base font-semibold">
              {t("clientDashboard.notReady.title", "We still need your emergency contacts")}
            </p>
            <p className="text-sm">
              {t(
                "clientDashboard.notReady.body",
                "Your alarm works and an operator will always answer it. But we have no one to contact on your behalf yet.",
              )}
            </p>
            {phone && (
              <p className="text-sm">
                {t("clientDashboard.notReady.orCall", "Prefer to do it by phone? Call us on")}{" "}
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  className="font-semibold underline underline-offset-2"
                >
                  {phone}
                </a>
              </p>
            )}
          </div>
        </div>

        <Button asChild className="shrink-0 self-start sm:self-auto">
          <NavLink to="/dashboard/contacts">
            {t("clientDashboard.notReady.action", "Add your emergency contacts")}
          </NavLink>
        </Button>
      </div>
    </div>
  );
}
