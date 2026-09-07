import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FULFILMENT_LABEL,
  FULFILMENT_MEANING,
  FULFILMENT_STATES,
  isFulfilmentCorrection,
  type FulfilmentState,
} from "@/lib/fulfilmentState";

/**
 * Correcting a fulfilment state — moving it BACKWARDS, or into or out of `cancelled`.
 *
 * WHY A DIALOG AND NOT A MENU ITEM. Three things have to be true before the database will accept
 * a correction, and two of them are things only the person can supply:
 *
 *   1. their role is one of D9's three (enforced by `may_reverse_fulfilment()`)
 *   2. a reason, non-blank AND different from the reason already on the row
 *   3. the commission on a `delivered` order has not been released or paid
 *
 * A menu item can satisfy none of (2). The trigger would refuse the write and the operator would
 * read a `RAISE EXCEPTION` written for a developer. So the reason is collected BEFORE the write,
 * in the same shape the trigger demands it, and the Save button stays disabled until it exists.
 *
 * THE REASON FIELD IS NOT A FORMALITY. What goes in it is what lands in `activity_logs.reason`,
 * and that log is the only durable record of the correction — `orders.fulfilment_state_reason`
 * holds one sentence and the next correction overwrites it. So the field says what it is for,
 * rather than "Reason".
 */

export interface FulfilmentCorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the order is now. Offered targets are everything else. */
  currentState: FulfilmentState;
  /** The reason already on the row, if any — a new one must differ from it. */
  previousReason: string | null;
  orderNumber: string | null;
  isSaving: boolean;
  onConfirm: (to: FulfilmentState, reason: string) => void;
}

export function FulfilmentCorrectionDialog({
  open,
  onOpenChange,
  currentState,
  previousReason,
  orderNumber,
  isSaving,
  onConfirm,
}: FulfilmentCorrectionDialogProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<FulfilmentState | "">("");
  const [reason, setReason] = useState("");

  // Reopening the dialog must not offer the last correction's answers: a reason left in the box
  // from a previous order is a reason attached to the wrong event.
  useEffect(() => {
    if (open) {
      setTarget("");
      setReason("");
    }
  }, [open]);

  /*
    ONLY corrections are offered. From `paid` that is `cancelled` and nothing else; from
    `delivered` it is every earlier state plus `cancelled`, but NOT `tested` — that is an
    ordinary forward move, needs no reason, and belongs on the order's own action. Filtering
    here rather than warning afterwards means the dialog cannot be used to do something it is
    not for, which is better than a note explaining that it shouldn't be.
  */
  const correctionTargets = FULFILMENT_STATES.filter(
    (s) => s !== currentState && isFulfilmentCorrection(currentState, s),
  );

  const trimmed = reason.trim();
  const reasonIsNew = trimmed.length > 0 && trimmed !== (previousReason ?? "").trim();
  const canSave = target !== "" && reasonIsNew && !isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("admin.fulfilment.correct.title", "Correct the fulfilment state")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "admin.fulfilment.correct.body",
              "Order {{order}} currently reads “{{state}}”. A correction is recorded against your name with the reason you give.",
              {
                order: orderNumber ?? "—",
                state: t(
                  FULFILMENT_LABEL[currentState].key,
                  FULFILMENT_LABEL[currentState].fallback,
                ),
              },
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fulfilment-correction-target">
              {t("admin.fulfilment.correct.target", "Move it to")}
            </Label>
            <Select value={target} onValueChange={(v) => setTarget(v as FulfilmentState)}>
              <SelectTrigger id="fulfilment-correction-target">
                <SelectValue
                  placeholder={t("admin.fulfilment.correct.choose", "Choose a state")}
                />
              </SelectTrigger>
              <SelectContent>
                {correctionTargets.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(FULFILMENT_LABEL[s].key, FULFILMENT_LABEL[s].fallback)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {target !== "" && (
              <p className="text-xs text-muted-foreground">
                {t(FULFILMENT_MEANING[target].key, FULFILMENT_MEANING[target].fallback)}
              </p>
            )}
          </div>

          {/*
            Named for what it does rather than what it is. The forward moves in this list are
            reachable from here too — a supervisor fixing an order that was cancelled by mistake
            is moving it FORWARD out of `cancelled`, which the trigger still counts as a
            correction and still wants a reason for.
          */}
          <div className="space-y-2">
            <Label htmlFor="fulfilment-correction-reason">
              {t("admin.fulfilment.correct.reason", "What happened?")}
            </Label>
            <Textarea
              id="fulfilment-correction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t(
                "admin.fulfilment.correct.reasonPlaceholder",
                "e.g. Marked delivered by mistake — the courier returned it undelivered.",
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "admin.fulfilment.correct.reasonHelp",
                "This is kept in the activity log against your name. It cannot be blank, and it cannot repeat the reason already on this order.",
              )}
            </p>
            {trimmed.length > 0 && !reasonIsNew && (
              <p
                role="alert"
                data-testid="fulfilment-reason-repeated"
                className="flex items-center gap-1.5 text-xs font-semibold text-destructive"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {t(
                  "admin.fulfilment.correct.reasonRepeated",
                  "That is the reason already on this order. Say what happened this time.",
                )}
              </p>
            )}
          </div>

          {/*
            Stated before the click, not after the refusal. The database will cancel a
            pending commission in the same transaction and REFUSE the move outright once the
            commission is approved or paid — so an operator who does not know that reads the
            refusal as the screen being broken.
          */}
          {currentState === "delivered" && target !== "" && (
            <p
              data-testid="fulfilment-commission-warning"
              className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-50"
            >
              {t(
                "admin.fulfilment.correct.commissionWarning",
                "This order is delivered, so a €50 partner commission may exist. Moving it out of delivered cancels a commission that has not been released, and is refused outright once one has been paid.",
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => target !== "" && onConfirm(target, trimmed)}
            disabled={!canSave}
            data-testid="fulfilment-correction-save"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("admin.fulfilment.correct.save", "Record the correction")}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
