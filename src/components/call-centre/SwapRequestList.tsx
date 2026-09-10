import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ArrowLeftRight, Check, Clock, HandHeart, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SHIFT_TYPES } from "@/config/shifts";
import type { ShiftType } from "@/config/shifts";
import { staffName } from "@/hooks/useRotaStaff";
import { useShiftSwapMutations, swapAwaits, type ShiftSwap } from "@/hooks/useShiftSwaps";
import type { StaffShift } from "@/hooks/useStaffShifts";

/**
 * SWAP REQUESTS — one list, three readers, and the buttons are the difference.
 *
 * The same rows appear on My shifts (both people) and on the rota (the supervisor who approves
 * them), so this renders both rather than two components drifting apart. `mode` says which side
 * is looking:
 *
 *   "mine"      My shifts → Requests. Answer what you were asked; withdraw what you asked for.
 *   "approvals" Rota → Requests. Approve what two people have already agreed.
 *
 * WHOSE TURN IT IS comes from `swapAwaits`, which is the same rule the RLS enforces: the
 * counterparty answers a 'requested' swap and nobody else can, and approval is the supervisor's
 * and only hers. A button this list offers to the wrong person would be refused by the database —
 * so it does not offer it, rather than letting somebody press it and read an error.
 *
 * WHAT APPROVE DOES. It calls `apply_shift_swap`, which moves the shifts, writes the cover rows
 * and the audit row in one transaction. This list never writes `staff_shifts` itself.
 */

interface Props {
  swaps: ShiftSwap[];
  staffId: string | undefined;
  mode: "mine" | "approvals";
  /**
   * The viewer's own upcoming shifts, for nominating one back on a swap they were asked for.
   * Only needed in "mine" mode, and only used where `wants_exchange` is true.
   */
  myShifts?: StaffShift[];
}

const atNoon = (date: string) => new Date(`${date}T12:00:00`);

/** "Thu 10 Sep — Morning", from the shift's own type config. Never a hardcoded time. */
function ShiftLine({ date, type }: { date: string; type: ShiftType }) {
  const { t } = useTranslation();
  const config = SHIFT_TYPES[type];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-medium">{format(atNoon(date), "EEE d MMM")}</span>
      <Badge className={`${config.bgClass} ${config.textClass} border-0`}>
        {t(config.labelKey, config.label)}
      </Badge>
    </span>
  );
}

export function SwapRequestList({ swaps, staffId, mode, myShifts = [] }: Props) {
  const { t } = useTranslation();
  const { respondToSwap, cancelSwap, approveSwap } = useShiftSwapMutations();
  /** swap id -> the shift this viewer is offering back. Per row: two can be open at once. */
  const [offered, setOffered] = useState<Record<string, string>>({});

  if (swaps.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground" data-testid="no-swap-requests">
        {mode === "mine"
          ? t("swaps.noneMine", "No swap or cover requests")
          : t("swaps.noneToApprove", "Nothing waiting for approval")}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {swaps.map((swap) => {
        const turn = swapAwaits(swap, staffId);
        const iAmCounterparty = swap.counterparty_id === staffId;
        const iRequested = swap.requested_by === staffId;
        const askedFor = swap.wants_exchange
          ? t("swaps.aSwap", "a swap")
          : t("swaps.cover", "cover");

        return (
          <li
            key={swap.id}
            className="space-y-2 rounded-lg border p-3"
            data-testid="swap-request-row"
            data-swap-id={swap.id}
            data-status={swap.status}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {swap.wants_exchange ? (
                <ArrowLeftRight className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <HandHeart className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
              <span>
                {iAmCounterparty
                  ? t("swaps.theyAskedYou", "{{name}} asked you for {{what}}", {
                      name: staffName(swap.requester),
                      what: askedFor,
                    })
                  : iRequested
                    ? t("swaps.youAsked", "You asked {{name}} for {{what}}", {
                        name: staffName(swap.counterparty),
                        what: askedFor,
                      })
                    : t("swaps.betweenTwo", "{{a}} asked {{b}} for {{what}}", {
                        a: staffName(swap.requester),
                        b: staffName(swap.counterparty),
                        what: askedFor,
                      })}
              </span>
              <Badge variant="outline" data-testid="swap-status">
                {t(`swaps.status.${swap.status}`, swap.status)}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                {t("swaps.theShift", "The shift")}:{" "}
                {swap.requested_shift && (
                  <ShiftLine
                    date={swap.requested_shift.shift_date}
                    type={swap.requested_shift.shift_type}
                  />
                )}
              </span>
              {swap.offered_shift && (
                <span className="text-muted-foreground" data-testid="swap-offered-shift">
                  {t("swaps.inExchangeFor", "In exchange")}:{" "}
                  <ShiftLine
                    date={swap.offered_shift.shift_date}
                    type={swap.offered_shift.shift_type}
                  />
                </span>
              )}
            </div>

            {swap.reason && <p className="text-sm text-muted-foreground">“{swap.reason}”</p>}

            {/* ── the counterparty's answer ──────────────────────────────── */}
            {mode === "mine" && turn === "you" && (
              <div className="flex flex-wrap items-end gap-2">
                {swap.wants_exchange && (
                  <div className="space-y-1">
                    <label
                      className="block text-xs text-muted-foreground"
                      htmlFor={`offer-${swap.id}`}
                    >
                      {t("swaps.giveBack", "One of yours in exchange (optional)")}
                    </label>
                    <Select
                      value={offered[swap.id] ?? ""}
                      onValueChange={(v) => setOffered((prev) => ({ ...prev, [swap.id]: v }))}
                    >
                      <SelectTrigger
                        id={`offer-${swap.id}`}
                        className="w-[16rem]"
                        aria-label={t("swaps.giveBack", "One of yours in exchange (optional)")}
                      >
                        <SelectValue placeholder={t("swaps.pickYourShift", "Choose a shift")} />
                      </SelectTrigger>
                      <SelectContent>
                        {myShifts.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {format(atNoon(s.shift_date), "EEE d MMM")} —{" "}
                            {t(SHIFT_TYPES[s.shift_type].labelKey, SHIFT_TYPES[s.shift_type].label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={() =>
                    respondToSwap.mutate({
                      id: swap.id,
                      status: "accepted",
                      offered_shift_id: offered[swap.id] || null,
                    })
                  }
                  disabled={respondToSwap.isPending}
                  data-testid="accept-swap"
                >
                  <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                  {t("swaps.accept", "Accept")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => respondToSwap.mutate({ id: swap.id, status: "declined" })}
                  disabled={respondToSwap.isPending}
                  data-testid="decline-swap"
                >
                  <X className="mr-1 h-3 w-3" aria-hidden="true" />
                  {t("swaps.decline", "Decline")}
                </Button>
              </div>
            )}

            {/* ── waiting on the other person, or on a supervisor ────────── */}
            {mode === "mine" && iRequested && turn !== "done" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {turn === "supervisor"
                    ? t("swaps.waitingSupervisor", "Accepted — waiting for a supervisor to approve")
                    : t("swaps.waitingThem", "Waiting for {{name}} to answer", {
                        name: staffName(swap.counterparty),
                      })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => cancelSwap.mutate(swap.id)}
                  disabled={cancelSwap.isPending}
                  data-testid="withdraw-swap"
                >
                  {t("swaps.withdraw", "Withdraw")}
                </Button>
              </div>
            )}

            {/* ── the supervisor's approval ──────────────────────────────── */}
            {mode === "approvals" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => approveSwap.mutate(swap.id)}
                  disabled={approveSwap.isPending}
                  data-testid="approve-swap"
                  aria-label={t("swaps.approveFor", "Approve the swap between {{a}} and {{b}}", {
                    a: staffName(swap.requester),
                    b: staffName(swap.counterparty),
                  })}
                >
                  <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                  {t("swaps.approve", "Approve and move the rota")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {swap.wants_exchange && !swap.offered_shift
                    ? t(
                        "swaps.approveCoverOnly",
                        "A swap was asked for and no shift was offered back — approving this moves one shift, as cover.",
                      )
                    : t(
                        "swaps.approveMoves",
                        "Both people have agreed. Approving moves the rota and tells them.",
                      )}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
