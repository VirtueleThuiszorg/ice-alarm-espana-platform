import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FULFILMENT_TO_ORDER_STATUS,
  describeFulfilmentError,
  isFulfilmentCorrection,
  type FulfilmentState,
} from "@/lib/fulfilmentState";
import { useOrderActions } from "@/hooks/useOrderActions";
import { notifyTransition } from "@/lib/notifyTransition";
import type { OrderStatus } from "@/lib/orderStatus";

/**
 * The one way the staff surface moves an order's `fulfilment_state`.
 *
 * WHAT THIS DELIBERATELY DOES NOT WRITE
 *
 * Timestamps. `allocated_at`, `programmed_at`, `programmed_by`, `tested_at` and `tested_by` are
 * all stamped by `enforce_fulfilment_state()` from `now()` and `get_staff_id(auth.uid())`. A
 * timestamp written by the client is a timestamp the client can lie about, and `tested_by` is
 * the entire evidence that a NAMED OPERATOR answered a real test call — it is the second half of
 * monitoring readiness (D4), so it is not the browser's to assert. `useOrderActions` still sets
 * `shipped_at` / `delivered_at` alongside `orders.status`, which is why those two columns are
 * COALESCEd in the trigger rather than overwritten.
 *
 * THE RECONCILIATION WITH `orders.status`, WHICH IS EXPLICIT ON PURPOSE
 *
 * FULFILMENT_MODEL.md §3 keeps `orders.status` as its own column because `delivered` there is
 * what creates the €50 partner commission, and overloading it with three new values would give
 * `process-commissions`, the partner pipeline and `post-payment.ts` cases they have never seen.
 *
 * But two ladders on one screen is two ladders a staff member has to remember to climb, and the
 * one they forget is the one that pays a partner or leaves an order invisible to a filter. So
 * §3's "reconciled explicitly and testably" is implemented here: ONE action, which moves
 * `fulfilment_state` and then moves `orders.status` to its counterpart THROUGH THE EXISTING
 * `useOrderActions` PATH. The commission logic is not duplicated, not re-implemented and not
 * touched — it is called.
 *
 * Order matters. Fulfilment goes first because it is the column with the rule: if the trigger
 * refuses (a skip, a missing reason, the wrong role, an already-paid commission), nothing else
 * has happened yet and `orders.status` is untouched.
 */

export interface MoveFulfilmentParams {
  orderId: string;
  memberId: string;
  /** The state the row currently holds. Needed to know whether this move is a correction. */
  from: FulfilmentState;
  to: FulfilmentState;
  /** The order's current `orders.status`, so the reconciliation is a no-op when it already agrees. */
  currentStatus: OrderStatus | null;
  /**
   * Required by the trigger for any correction (backwards, or into/out of `cancelled`), and it
   * must differ from the reason already on the row — otherwise a second correction rides on the
   * first one's sentence and the log records an explanation of a different event.
   */
  reason?: string;
}

export function useFulfilmentState() {
  const queryClient = useQueryClient();
  const { updateOrderStatus } = useOrderActions();

  const moveFulfilment = useMutation({
    mutationFn: async ({
      orderId,
      memberId,
      from,
      to,
      currentStatus,
      reason,
    }: MoveFulfilmentParams) => {
      const correction = isFulfilmentCorrection(from, to);

      const payload: { fulfilment_state: FulfilmentState; fulfilment_state_reason?: string } = {
        fulfilment_state: to,
      };
      // Only on a correction. Sending a reason on an ordinary forward move would leave a
      // sentence on the row explaining a move nobody questioned, and the NEXT correction would
      // then be refused for reusing it.
      if (correction && reason) payload.fulfilment_state_reason = reason;

      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) throw error;

      // Only now, and only if it actually differs.
      const mappedStatus = FULFILMENT_TO_ORDER_STATUS[to];
      if (mappedStatus && mappedStatus !== currentStatus) {
        await updateOrderStatus.mutateAsync({ orderId, status: mappedStatus, memberId });
      }

      /*
        WP3 — ONE DISPATCHER, CALLED ON EVERY STATE EDGE.

        Last, and its failure is swallowed on purpose: a notification that could not be sent
        must never undo a fulfilment state that was. The state is the fact; the message is a
        courtesy about the fact. `notify-fulfilment` itself returns 200 with a decision per
        channel even when every one is skipped, so a non-error response here says nothing about
        whether anything was actually sent — that is in `member_notification_log`, which is the
        only honest place for it.

        The `paid` edge is NOT here. It belongs to the payment webhook, and per the brief no PR
        touching stripe-webhook merges — that hook is a separate PR left open for Lee.
      */
      // `paid` is skipped, and it is the only state that is. Nothing transitions INTO `paid`
      // except the payment webhook — a supervisor CORRECTING an order back to `paid` is the one
      // way it happens from here, and there is deliberately no `fulfilment.paid.*` template: a
      // member told "your pendant is no longer allocated" by an automated SMS, with no
      // explanation and nobody to ask, is worse served than by the phone call that correction
      // should prompt anyway.
      if (to !== "paid") await notifyTransition(orderId, to);

      return { orderId, to, correction };
    },
    onSuccess: ({ orderId }) => {
      // Every surface that reads a fulfilment state, plus readiness: moving an order to `tested`
      // is what makes a member monitoring-ready, and a stale readiness number is the one number
      // on this system that must not be stale.
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-order-detail", orderId] });
      queryClient.invalidateQueries({ queryKey: ["admin-monitoring-readiness-queue"] });
      queryClient.invalidateQueries({ queryKey: ["member-fulfilment"] });
    },
    onError: (error: Error) => {
      // The trigger's refusals are written for a developer reading a log, and three of the five
      // are conditions this UI should have prevented. Translated once, in one place.
      const { title, body } = describeFulfilmentError(error.message);
      toast.error(title, { description: body });
    },
  });

  return { moveFulfilment };
}
