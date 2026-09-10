import { useEffect, useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import { useConfirmLegacyMember } from "@/hooks/useConfirmLegacyMember";

/**
 * "Confirm as legacy member" — the one activation on this platform that is not a payment.
 *
 * WHEN IT RENDERS, AND WHY THAT MATTERS: only for a member who is `pending_review` +
 * `billing_source = 'legacy'`, which is exactly what the CRM import writes. A member who has
 * already been confirmed, or who pays through Stripe, must not see a button offering to activate
 * them — `confirm_legacy_member()` would refuse it, and a control that exists only to be refused
 * teaches staff that the screen is unreliable.
 *
 * A REASON IS DEMANDED HERE, not because the function requires one — it takes NULL — but because
 * this is the row somebody will read in a year when they ask why a member with no payment record
 * is monitored. "Pays Mary by standing order" is the answer; a blank column is not.
 *
 * PERMISSION IS NOT DECIDED HERE. The card renders for any staff member who can see the record;
 * the database decides who may act. An operator who presses it is told no by the same rule the
 * harness asserts. That is deliberate: a client-side role check standing in for the real one is
 * a check that disagrees with the database on the day the roles change, and the disagreement is
 * invisible until somebody is refused for a reason the screen cannot explain.
 */
export function ConfirmLegacyMemberCard({
  memberId,
  memberName,
  status,
  billingSource,
}: {
  memberId: string;
  memberName: string;
  status: string | null;
  billingSource: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const confirm = useConfirmLegacyMember();

  // Reopening must not carry the last attempt's reason: a sentence attached to the wrong event is
  // worse in an audit log than no sentence at all. Same rule as MemberActionsCard.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (status !== "pending_review" || billingSource !== "legacy") return null;

  const canSubmit = reason.trim().length > 0 && !confirm.isPending;

  return (
    <Card data-testid="confirm-legacy-member-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-4 w-4" />
          Waiting to be confirmed
          <Badge variant="outline">Legacy billing</Badge>
        </CardTitle>
        <CardDescription>
          Imported from KarmaCRM. Nobody here has checked this record yet, so{" "}
          <strong>they are not counted as monitored</strong>. Confirming says they are a real
          client who pays outside Stripe — it does not create a subscription and takes no payment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => setOpen(true)} data-testid="confirm-legacy-open">
          Confirm as legacy member
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {memberName} as a legacy member</DialogTitle>
            <DialogDescription>
              They become <strong>active</strong> and monitored, billed outside Stripe. Renewal and
              payment reminders will never fire for them. This is recorded against your name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="legacy-reason">
              How do they pay? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="legacy-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. pays by standing order to the office, €25/month since 2014"
              data-testid="confirm-legacy-reason"
            />
            <p className="text-xs text-muted-foreground">
              Somebody will read this in a year when they ask why a member with no payment record
              is monitored.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={confirm.isPending}>
              Cancel
            </Button>
            <Button
              variant="ink"
              disabled={!canSubmit}
              data-testid="confirm-legacy-submit"
              onClick={() => {
                confirm.mutate(
                  { memberId, reason },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      toast.success(`${memberName} is confirmed — monitored, billed outside Stripe`);
                    },
                    // The database's message, not a generic one: it names the actual refusal
                    // ("admin or supervisor only", "is active, not pending_review"), which is
                    // what tells the operator whether to fetch a supervisor or reload the page.
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : "Could not confirm this member"),
                  },
                );
              }}
            >
              {confirm.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
