import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MEMBER_ACTIONS, type MemberActionSpec } from "@/lib/memberActions";
import { useMemberAction } from "@/hooks/useMemberAction";

/**
 * THE FIVE THINGS STAFF DO TO A MEMBER'S SUBSCRIPTION, on the member's own record — WP7.
 *
 * Every one demands a reason before it will submit, because
 * `enforce_member_action_attribution()` demands one too — and a form that lets a staff member
 * get as far as the database refusing them has wasted their work and taught them the screen is
 * unreliable.
 *
 * TWO OF THE SIX ARE AUTOMATED. The other four are RECORDED here and performed by a human in
 * Stripe, and the card says which is which rather than looking uniform. `src/lib/memberActions.ts`
 * carries the reasoning: those four are new Stripe money-movement code against a real card,
 * which nothing here can test, and they have to be done either way — so the audit trail, which
 * is the part that was missing, works for all six today.
 */
export function MemberActionsCard({
  memberId,
  subscriptionId,
  gateway,
}: {
  memberId: string;
  /** Null when the member has no subscription — the automated actions then have nothing to act on. */
  subscriptionId: string | null;
  /** Which gateway holds it. Mollie can only be cancelled; the hook says so rather than guessing. */
  gateway: "stripe" | "mollie" | null;
}) {
  const { t } = useTranslation();
  const { perform, staffId } = useMemberAction();
  const [open, setOpen] = useState<MemberActionSpec | null>(null);
  const [reason, setReason] = useState("");

  // Reopening must not carry the last action's reason: a sentence attached to the wrong event
  // is worse in an audit log than no sentence at all.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const canSubmit = reason.trim().length > 0 && !perform.isPending;

  return (
    <Card data-testid="member-actions-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("admin.memberActions.title", "Subscription actions")}
        </CardTitle>
        <CardDescription>
          {t(
            "admin.memberActions.subtitle",
            "Every one of these is recorded against your name with the reason you give. The database refuses an unattributed change.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!staffId && (
          <p
            role="alert"
            data-testid="member-actions-no-staff"
            className="rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {t(
              "admin.memberActions.noStaffRecord",
              "Your account is not linked to an active staff record, so none of these can be attributed to anybody. They are disabled until it is.",
            )}
          </p>
        )}

        {MEMBER_ACTIONS.map((spec) => {
          const needsSubscription = spec.automation === "automated";
          const blocked = !staffId || (needsSubscription && !subscriptionId);
          return (
            <div
              key={spec.action}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {t(spec.label.key, spec.label.fallback)}
                  </span>
                  {/*
                    Which half of the job this system does. Uniform buttons would imply the
                    system takes the money for all six, and the first person to trust that would
                    leave a renewal uncharged.
                  */}
                  {spec.automation === "manual_in_stripe" && (
                    <Badge
                      variant="outline"
                      data-testid={`member-action-manual-${spec.action}`}
                      className="gap-1 text-xs"
                    >
                      <Info className="h-3 w-3" aria-hidden="true" />
                      {t("admin.memberActions.manualBadge", "You do it in Stripe")}
                    </Badge>
                  )}
                </div>
                <p className="max-w-prose text-sm text-muted-foreground">
                  {t(spec.description.key, spec.description.fallback)}
                </p>
                {needsSubscription && !subscriptionId && (
                  <p className="text-sm font-medium text-muted-foreground">
                    {t(
                      "admin.memberActions.noSubscription",
                      "This member has no subscription, so there is nothing to action.",
                    )}
                  </p>
                )}
              </div>
              <Button
                variant={spec.destructive ? "destructive" : "outline"}
                size="sm"
                className="shrink-0"
                disabled={blocked}
                data-testid={`member-action-${spec.action}`}
                onClick={() => setOpen(spec)}
              >
                {t(spec.label.key, spec.label.fallback)}
              </Button>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {open ? t(open.label.key, open.label.fallback) : ""}
            </DialogTitle>
            <DialogDescription>
              {open ? t(open.description.key, open.description.fallback) : ""}
            </DialogDescription>
          </DialogHeader>

          {open?.destructive && (
            <p
              data-testid="member-action-destructive-warning"
              className="rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm font-semibold text-destructive"
            >
              {t(
                "admin.memberActions.destructiveWarning",
                "This stops their monitoring. Their pendant will not reach an operator afterwards — make sure they have been told, on this call, before you do it.",
              )}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="member-action-reason">
              {t("admin.memberActions.reasonLabel", "Why are you doing this?")}
            </Label>
            <Textarea
              id="member-action-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                "admin.memberActions.reasonPlaceholder",
                "e.g. Member called — moving into residential care on the 30th, wants to stop from the end of the month.",
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "admin.memberActions.reasonHelp",
                "This is the answer to “who did this, and why?” six months from now. The database will not accept the change without it.",
              )}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={perform.isPending}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              variant={open?.destructive ? "destructive" : "default"}
              disabled={!canSubmit}
              data-testid="member-action-confirm"
              onClick={() => {
                if (!open) return;
                perform.mutate(
                  {
                    memberId,
                    action: open.action,
                    reason,
                    subscriptionId: subscriptionId ?? undefined,
                    gateway,
                  },
                  // Closed only on success. A refusal keeps the reason on screen rather than
                  // making somebody retype the sentence they just composed.
                  { onSuccess: () => setOpen(null) },
                );
              }}
            >
              {perform.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {open?.automation === "automated"
                ? t("admin.memberActions.confirmDo", "Do it and record it")
                : t("admin.memberActions.confirmRecord", "Record it")}
            </Button>
          </DialogFooter>

          {open?.automation === "manual_in_stripe" && (
            <p
              data-testid="member-action-manual-note"
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t(
                "admin.memberActions.manualNote",
                "This records the action. It does NOT change the member's billing — do that in Stripe.",
              )}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
