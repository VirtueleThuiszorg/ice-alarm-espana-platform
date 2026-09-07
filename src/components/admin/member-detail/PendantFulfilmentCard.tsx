import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, PhoneCall, ShieldCheck, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePendantOrderForMember } from "@/hooks/usePendantOrder";
import { useFulfilmentState } from "@/hooks/useFulfilmentState";
import {
  FULFILMENT_ACTION_LABEL,
  FULFILMENT_BADGE,
  FULFILMENT_LABEL,
  FULFILMENT_MEANING,
  FULFILMENT_SEQUENCE,
  fulfilmentRank,
} from "@/lib/fulfilmentState";

/**
 * WHERE THE TEST CALL IS RECORDED, and therefore where monitoring readiness becomes reachable
 * at all.
 *
 * The brief: *"tested: staff action 'Test call completed' from the SOS screen or member record,
 * records who and when. THIS sets the second half of monitoring readiness."*
 *
 * The member record, not the SOS screen. Two reasons, and the second is the binding one:
 *   1. This is where somebody sits when they phone a member to walk them through a test.
 *   2. `SOSActionPanel` is the SOS path, and CLAUDE.md makes a human gate mandatory before any
 *      merge that touches it. Recorded in PENDING_FOR_LEE.md rather than done quietly.
 *
 * THE THREE ANSWERS THIS CARD MUST KEEP APART. Readiness is a life-safety number, and the
 * failure mode that matters is a false all-clear (READINESS_MODEL.md §1-A):
 *   - loading → say so; "we do not know yet" must never render as "there is nothing"
 *   - a failed read → say so LOUDLY, and never as a state
 *   - a pendant on no order → say so, because that member CANNOT become ready and no amount of
 *     test-calling will change it until an order line exists
 */

export function PendantFulfilmentCard({ memberId }: { memberId: string }) {
  const { t } = useTranslation();
  const { order, linkedToOrder, hasDevice, isLoading, isError, error, refetch } =
    usePendantOrderForMember(memberId);
  const { moveFulfilment } = useFulfilmentState();

  // The member has no pendant at all. DeviceTab already says that in full; a second card
  // repeating it would push the thing they came to read further down the page.
  if (!isLoading && !isError && !hasDevice) return null;

  return (
    <Card data-testid="pendant-fulfilment-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("admin.fulfilment.card.title", "Pendant fulfilment")}
        </CardTitle>
        <CardDescription>
          {t(
            "admin.fulfilment.card.subtitle",
            "Half of this member's monitoring readiness is whether their pendant has been tested in their own home with an operator answering.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("admin.fulfilment.card.loading", "Reading this member's pendant order…")}
          </p>
        )}

        {isError && (
          <div
            role="alert"
            data-testid="pendant-fulfilment-error"
            className="rounded-md border-2 border-destructive bg-destructive/10 p-3"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t(
                "admin.fulfilment.card.loadFailed",
                "This member's fulfilment state could not be read",
              )}
            </p>
            <p className="mt-1 text-sm text-destructive">
              {t(
                "admin.fulfilment.card.loadFailedBody",
                "This is NOT the same as “not tested”. Do not treat it as either state. Retry, and escalate if it persists.",
              )}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
              {t("common.retry", "Retry")}
            </Button>
          </div>
        )}

        {!isLoading && !isError && hasDevice && !linkedToOrder && (
          <div
            role="alert"
            data-testid="pendant-not-on-order"
            className="rounded-md border-2 border-amber-500 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Unlink className="h-4 w-4" aria-hidden="true" />
              {t(
                "admin.fulfilment.card.notOnOrder",
                "This pendant is not on any order",
              )}
            </p>
            <p className="mt-1 text-sm">
              {t(
                "admin.fulfilment.card.notOnOrderBody",
                "Readiness reaches a pendant through the order it was sold on, so this member cannot be recorded as monitoring-ready until the pendant is linked to a pendant line on one of their orders. Test-calling them will not change it.",
              )}
            </p>
          </div>
        )}

        {!isLoading && !isError && order && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={FULFILMENT_BADGE[order.fulfilmentState]}>
                {t(
                  FULFILMENT_LABEL[order.fulfilmentState].key,
                  FULFILMENT_LABEL[order.fulfilmentState].fallback,
                )}
              </Badge>
              {order.orderNumber && (
                <span className="font-mono text-xs text-muted-foreground">
                  {order.orderNumber}
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {t(
                FULFILMENT_MEANING[order.fulfilmentState].key,
                FULFILMENT_MEANING[order.fulfilmentState].fallback,
              )}
            </p>

            {/*
              The ladder, so "delivered" is legible as a position rather than a word. Not a
              progress bar: `cancelled` is not 0% of anything, and a bar would have to invent a
              number for it.
            */}
            <ol className="flex flex-wrap gap-1.5" aria-label={t("admin.fulfilment.card.ladder", "Fulfilment steps")}>
              {FULFILMENT_SEQUENCE.map((s) => {
                const here = fulfilmentRank(order.fulfilmentState);
                const rung = fulfilmentRank(s)!;
                const reached = here !== null && rung <= here;
                return (
                  <li
                    key={s}
                    data-testid={`fulfilment-rung-${s}`}
                    data-reached={reached ? "yes" : "no"}
                    className={
                      reached
                        ? "rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        : "rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {t(FULFILMENT_LABEL[s].key, FULFILMENT_LABEL[s].fallback)}
                  </li>
                );
              })}
            </ol>

            {order.fulfilmentState === "tested" && (
              <p
                data-testid="pendant-tested-evidence"
                className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-alert-resolved"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {order.testedAt
                  ? t(
                      "admin.fulfilment.card.testedOn",
                      "Test call answered on {{date}}{{by}}",
                      {
                        date: new Date(order.testedAt).toLocaleDateString(),
                        by: order.testedByName ? ` by ${order.testedByName}` : "",
                      },
                    )
                  : t("admin.fulfilment.card.tested", "Test call answered")}
              </p>
            )}

            {/*
              The action, offered ONLY from `delivered`. One step at a time is the trigger's
              rule, and this state in particular has to be true: it means the member pressed
              the button in the home they will use it in and a named operator answered.
            */}
            {order.fulfilmentState === "delivered" && (
              <div className="space-y-2">
                <Button
                  data-testid="record-test-call"
                  disabled={moveFulfilment.isPending}
                  onClick={() =>
                    moveFulfilment.mutate({
                      orderId: order.id,
                      memberId: order.memberId,
                      from: "delivered",
                      to: "tested",
                      currentStatus: order.status,
                    })
                  }
                >
                  {moveFulfilment.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PhoneCall className="mr-2 h-4 w-4" />
                  )}
                  {t(
                    FULFILMENT_ACTION_LABEL.tested.key,
                    FULFILMENT_ACTION_LABEL.tested.fallback,
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.fulfilment.card.testedWarning",
                    "Press this only after the member has pressed their pendant at home and you answered it. It is recorded against your name, and it is what tells this system they are protected.",
                  )}
                </p>
              </div>
            )}

            {/*
              Between `paid` and `delivered` there is nothing to press here, and saying so beats
              an empty card: the next move belongs to somebody else, and the card names them.
            */}
            {order.fulfilmentState !== "delivered" && order.fulfilmentState !== "tested" && (
              <p data-testid="pendant-not-yet-testable" className="text-xs text-muted-foreground">
                {t(
                  "admin.fulfilment.card.notYet",
                  "A test call can only be recorded once the pendant is with the member. Move the order along from Orders, or finish the provisioning checklist on the device.",
                )}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
