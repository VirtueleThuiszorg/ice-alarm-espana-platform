import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CreditCard, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supportActionPath } from "@/lib/supportActions";
import { Link } from "react-router-dom";

/**
 * THE MEMBER'S OWN COPY OF THEIR SWITCH LINK.
 *
 * They were sent it by text and by email. Both of those are a message an 82-year-old has to
 * find again a week later, and "I've lost the link" is the commonest reason a migration stalls.
 * Their own account page is the one place it cannot get lost.
 *
 * ── WHY THERE ARE TWO EXPIRY DATES, AND WHY THAT MATTERS HERE ────────────────
 *
 * Stripe caps a Checkout Session at 24 hours. The switch window is 14 days. So for most of the
 * time this card is on screen the stored URL is DEAD — and a dead Stripe link does not say it
 * is dead in any way an elderly person will read: it shows an expired-session page that many
 * will take for "something went wrong at the bank", or worse, believe they have paid.
 *
 * So the card shows the link only while the session is live, and otherwise says plainly that it
 * has expired and offers a person. Showing a link that cannot work is worse than showing none.
 *
 * NOTHING HERE CHANGES THEIR ALARM, and the card says so first, because a message about money
 * from the company that holds somebody's emergency button reads as a threat to the button.
 */
export function SwitchToStripeCard({
  checkoutUrl,
  sessionExpiresAt,
  switchExpiresAt,
  now = new Date(),
}: {
  checkoutUrl: string | null;
  sessionExpiresAt: string | null;
  switchExpiresAt: string | null;
  /** Injectable so the two branches are testable without waiting a day. */
  now?: Date;
}) {
  const { t } = useTranslation();

  const sessionLive =
    Boolean(checkoutUrl) &&
    (!sessionExpiresAt || new Date(sessionExpiresAt).getTime() > now.getTime());

  return (
    <Card data-testid="member-switch-card">
      <CardHeader>
        <CardTitle className="text-lg">
          {t("subscription.switch.title", "Moving your payment across")}
        </CardTitle>
        <CardDescription className="text-base">
          {t(
            "subscription.switch.unchanged",
            "Your alarm, your pendant and the number we call are not changing. This is only about how your payment is taken.",
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {sessionLive ? (
          <>
            <p className="text-base">
              {t(
                "subscription.switch.ready",
                "You can pay by card, or give your bank details so it is taken automatically each time.",
              )}
            </p>
            {/* A real anchor, not a router link: it leaves the app for Stripe. */}
            <Button asChild size="lg" data-testid="member-switch-pay">
              <a href={checkoutUrl!} rel="noreferrer">
                <CreditCard className="h-5 w-5" />
                {t("subscription.switch.pay", "Set up my payment")}
              </a>
            </Button>
            {switchExpiresAt && (
              <p className="text-sm text-muted-foreground">
                {t("subscription.switch.until", "Your usual bank payment continues until this is done.")}{" "}
                {format(new Date(switchExpiresAt), "PPP")}
              </p>
            )}
          </>
        ) : (
          <>
            {/* NO DEAD LINK. See the header: an expired Stripe page reads to many people as a
                failed payment, or as a successful one. */}
            <p className="text-base" data-testid="member-switch-expired">
              {t(
                "subscription.switch.expired",
                "The link we sent you has expired — they only last a day for security. Ask us and we will send you a fresh one; nothing has changed in the meantime and your alarm is working as normal.",
              )}
            </p>
            <Button asChild size="lg" data-testid="member-switch-ask">
              <Link to={supportActionPath("update_payment")}>
                <Phone className="h-5 w-5" />
                {t("subscription.switch.ask", "Ask us for a new link")}
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
