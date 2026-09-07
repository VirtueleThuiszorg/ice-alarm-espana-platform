import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MEMBER_NOTICE_TONE } from "@/lib/memberNoticeTone";
import { membershipConditionSpec, type MembershipCondition } from "@/lib/membershipCondition";
import { supportActionPath } from "@/lib/supportActions";
import { MembershipPlans } from "@/components/client/MembershipPlans";

/**
 * WHAT THE MEMBERSHIP PAGE SHOWS WHEN THERE IS NO ACTIVE SUBSCRIPTION.
 *
 * The page said one thing — *"contact support"* — to all seven of the states that produce no
 * active subscription, which R6 forbids in as many words and R8 contradicts. The reasoning for
 * each state, and for why only one of them shows the plans, is in `membershipCondition.ts`.
 *
 * THE FIRST LINE IS ABOUT MONITORING, NOT MONEY. Every condition here except `active` means
 * nobody is watching. "Your membership is paused" is a billing sentence; a member can read it
 * and still believe somebody answers if they press the button. So the notice says so plainly,
 * above the billing detail, in the amber R2 reserves for a status.
 *
 * ONE BUTTON, and it is the page's only red one (R1). It opens a prefilled support request —
 * a real route to a human, not a placeholder — because there is no member-initiated checkout for
 * an existing account and `/join` would create a SECOND member record for the same person.
 */
export function MembershipConditionCard({ condition }: { condition: MembershipCondition }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spec = membershipConditionSpec(condition);
  // Bound to a const so the callback below needs no non-null assertion.
  const action = spec.action;

  return (
    <div className="space-y-6" data-testid="membership-condition" data-condition={condition}>
      {!spec.monitored && (
        <div
          role="status"
          data-testid="membership-not-monitored"
          className={`flex items-start gap-2 rounded-md border px-4 py-3 text-base ${MEMBER_NOTICE_TONE}`}
        >
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            {t(
              "subscription.notMonitored",
              "Nobody is monitoring your alarm at the moment. If you press your pendant, no operator will answer.",
            )}
          </span>
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">{t(spec.title.key, spec.title.fallback)}</h2>
          <p className="text-base text-muted-foreground">{t(spec.body.key, spec.body.fallback)}</p>
          {action && (
            <Button
              data-testid="membership-condition-action"
              onClick={() => navigate(supportActionPath(action))}
            >
              {t("subscription.talkToUs", "Send us a message")}
            </Button>
          )}
        </CardContent>
      </Card>

      {spec.showsPlans && <MembershipPlans />}
    </div>
  );
}
