import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SHIFT_TYPES } from "@/config/shifts";
import { colleaguesOf, useRotaStaff } from "@/hooks/useRotaStaff";
import { useShiftSwapMutations } from "@/hooks/useShiftSwaps";
import type { StaffShift } from "@/hooks/useStaffShifts";

/**
 * "Can somebody take this shift?" — asked from the shift itself.
 *
 * TWO QUESTIONS, NOT ONE, which is what the brief asked for and what the two modes below are:
 *
 *   COVER  please take this one. Nothing comes back to me.
 *   SWAP   please take this one and give me one of yours in exchange.
 *
 * WHY THE PERSON ASKING CANNOT PICK THE SHIFT THEY WOULD TAKE, which is the obvious thing to
 * want here: RLS gives an operator their OWN shift rows and nobody else's, so this screen
 * genuinely cannot see the other person's rota to offer it. The nomination therefore happens on
 * the other side, when they answer — and `wants_exchange` is how their answer screen knows to
 * ask for one. Faking it by widening who can read `staff_shifts` would be a rota-wide privacy
 * change to save one click.
 *
 * Nothing moves when this is submitted. It writes a request; the counterparty answers it and a
 * supervisor approves it, and only `apply_shift_swap` moves the rota.
 */

interface Props {
  shift: StaffShift;
  staffId: string;
}

export function RequestSwapDialog({ shift, staffId }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"cover" | "swap">("cover");
  const [counterparty, setCounterparty] = useState("");
  const [reason, setReason] = useState("");
  const { data: staff = [] } = useRotaStaff();
  const { requestSwap } = useShiftSwapMutations();

  const colleagues = colleaguesOf(staff, staffId);
  const config = SHIFT_TYPES[shift.shift_type];
  const when = `${format(new Date(`${shift.shift_date}T12:00:00`), "EEE d MMM")} — ${t(
    config.labelKey,
    config.label,
  )}`;

  const submit = () => {
    if (!counterparty) return;
    requestSwap.mutate(
      {
        requested_shift_id: shift.id,
        requested_by: staffId,
        counterparty_id: counterparty,
        // NULL on both paths: the counterparty nominates what comes back, if anything.
        offered_shift_id: null,
        wants_exchange: mode === "swap",
        reason: reason.trim() || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setCounterparty("");
          setReason("");
          setMode("cover");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="ask-swap-or-cover"
        aria-label={t("swaps.askAbout", "Ask somebody to take your {{shift}}", { shift: when })}
      >
        <Repeat className="mr-1 h-3 w-3" aria-hidden="true" />
        {t("swaps.askShort", "Swap or cover")}
      </Button>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("swaps.dialogTitle", "Ask somebody to take this shift")}</DialogTitle>
          <DialogDescription>{when}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("swaps.whatAreYouAsking", "What are you asking for?")}
            </legend>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "cover" | "swap")}
              className="space-y-2"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="cover" id="swap-mode-cover" className="mt-1" />
                <Label htmlFor="swap-mode-cover" className="font-normal">
                  <span className="font-medium">{t("swaps.modeCover", "Cover")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("swaps.modeCoverHelp", "They take this shift. Nothing comes back to you.")}
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="swap" id="swap-mode-swap" className="mt-1" />
                <Label htmlFor="swap-mode-swap" className="font-normal">
                  <span className="font-medium">{t("swaps.modeSwap", "Swap")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "swaps.modeSwapHelp",
                      "They take this shift and choose one of theirs for you. They pick which — you cannot see their rota.",
                    )}
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="swap-counterparty">{t("swaps.whoAreYouAsking", "Who?")}</Label>
            <Select value={counterparty} onValueChange={setCounterparty}>
              <SelectTrigger id="swap-counterparty" aria-label={t("swaps.whoAreYouAsking", "Who?")}>
                <SelectValue placeholder={t("swaps.pickPerson", "Choose somebody")} />
              </SelectTrigger>
              <SelectContent>
                {colleagues.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="swap-reason">
              {t("swaps.reasonLabel", "Anything they should know (optional)")}
            </Label>
            <Textarea
              id="swap-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={t("swaps.reasonPlaceholder", "Dentist that morning")}
            />
          </div>

          {/* Said on the screen: asking is not arranging. */}
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {t(
              "swaps.approvalNote",
              "Nothing changes on the rota yet. They answer first, and then a supervisor approves it — you will both be told.",
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={!counterparty || requestSwap.isPending}
            data-testid="submit-swap-request"
          >
            {t("swaps.send", "Send request")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
