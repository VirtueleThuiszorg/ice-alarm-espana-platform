import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { isActionableGap, readinessGap, type ReadinessGap } from "@/lib/readinessGap";

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
 * TWO CONDITIONS SINCE D4, AND THE BAR NAMES WHICH ONE. Readiness is now (a) somebody to call
 * AND (b) a pendant somebody has proved reaches an operator. "You are not ready" without saying
 * which is a sentence an 80-year-old cannot act on, and the two are not equally actionable:
 *
 *   contacts missing   the member CAN fix it, and there is a button that does
 *   pendant untested   the member CANNOT fix it. Q1 (Lee, 2026-09-07) is operator-confirmed
 *                      only — a member cannot self-report a test — so offering them anything to
 *                      press here would either be a lie or a hole in Q1. The phone number is
 *                      the action, and the sentence says we will call them
 *   both               led by the contacts, because that is the half they can act on today
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
  /**
   * `undefined` is a THIRD state and it is load-bearing: it means "not known yet", and it
   * renders nothing. A bar keyed on a falsy value alone flashes on every page load, and a
   * warning people are trained to ignore is worse than no warning (spec §5.1.2).
   */
  const [gap, setGap] = useState<ReadinessGap | undefined>(undefined);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("member_monitoring_readiness")
        // Both conditions, so the bar can name the one that is missing. `monitoring_ready` is
        // still selected and still the authority on WHETHER — readiness is read, never
        // recomputed here (READINESS_MODEL.md §2) — and the other two columns say WHICH.
        .select("monitoring_ready, emergency_contact_count, device_tested_at")
        .eq("member_id", memberId)
        .maybeSingle();
      if (cancelled || error) return; // unknown, not a false all-clear and not a false alarm
      if (!data) return;
      // A `monitoring_ready` of true settles it regardless of the other two, so a disagreement
      // between the view's own answer and the columns it derives it from can never show the
      // member a warning the view says is not warranted.
      setGap(data.monitoring_ready === true ? "none" : readinessGap(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (gap === undefined || !isActionableGap(gap)) return null;

  const phone = settings.emergency_phone;
  const needsContacts = gap === "contacts" || gap === "both";

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
            <p className="text-base font-semibold" data-testid={`member-readiness-${gap}`}>
              {gap === "contacts"
                ? t("clientDashboard.notReady.title", "We still need your emergency contacts")
                : gap === "pendant"
                  ? t(
                      "clientDashboard.notReady.titlePendant",
                      "We still need to test your pendant with you",
                    )
                  : t(
                      "clientDashboard.notReady.titleBoth",
                      "Two things left before your alarm is fully set up",
                    )}
            </p>
            <p className="text-sm">
              {gap === "contacts"
                ? t(
                    "clientDashboard.notReady.body",
                    "Your alarm works and an operator will always answer it. But we have no one to contact on your behalf yet.",
                  )
                : gap === "pendant"
                  ? t(
                      "clientDashboard.notReady.bodyPendant",
                      "Nobody has pressed your pendant yet to check it reaches us from your home. We will call you to do it together — it takes a minute.",
                    )
                  : t(
                      "clientDashboard.notReady.bodyBoth",
                      "We have no one to contact on your behalf, and nobody has pressed your pendant yet to check it reaches us from your home. Add your contacts below, and we will call you about the pendant.",
                    )}
            </p>
            {phone && (
              <p className="text-sm">
                {/*
                  Two registers for the same number. "Prefer to do it by phone?" is an offer to
                  somebody who has a button they could press instead; for the pendant there is
                  no button, so the same sentence would read as a choice they do not have.
                */}
                {needsContacts
                  ? t("clientDashboard.notReady.orCall", "Prefer to do it by phone? Call us on")
                  : t(
                      "clientDashboard.notReady.callAboutPendant",
                      "Would rather not wait for our call? Reach us on",
                    )}{" "}
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

        {/*
          A button ONLY where there is something for the member to press. Q1 is
          operator-confirmed only: a member cannot record their own pendant test, so a button on
          the pendant-only bar would be either a lie or a hole in that ruling. The phone number
          above is the action there, and it is already a `tel:` link.
        */}
        {needsContacts && (
          <Button asChild className="shrink-0 self-start sm:self-auto">
            <NavLink to="/dashboard/contacts">
              {t("clientDashboard.notReady.action", "Add your emergency contacts")}
            </NavLink>
          </Button>
        )}
      </div>
    </div>
  );
}
