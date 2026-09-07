import { supabase } from "@/integrations/supabase/client";
import type { FulfilmentState } from "@/lib/fulfilmentState";

/**
 * Ring WP3's dispatcher for one fulfilment state edge.
 *
 * ONE CALL SITE HELPER RATHER THAN THREE COPIES. Three places move a fulfilment state —
 * `useFulfilmentState` (the staff actions), `linkDeviceToPendantOrder` (allocation) and
 * `markOrderProgrammed` (the checklist) — and each of them would otherwise decide for itself
 * how to handle a dispatcher that is unreachable.
 *
 * IT NEVER THROWS AND NEVER REPORTS. Both are deliberate:
 *
 *   never throws   a notification that could not be sent must not undo a fulfilment state that
 *                  was. The state is the fact; the message is a courtesy about the fact.
 *   never toasts   the dispatcher returns 200 with a decision per channel even when every one
 *                  is skipped, so there is nothing truthful to tell a staff member here. All
 *                  three channels are OFF in production today, which means the honest message
 *                  would be "nothing was sent" on every single transition — a notice that is
 *                  always shown is a notice nobody reads. What was and was not sent lives in
 *                  `member_notification_log`, which is the only place that can be relied on.
 *
 * `paid` is absent from the parameter type on purpose: nothing transitions INTO `paid` from the
 * client — the payment webhook puts an order there, and that hook is a separate PR held for a
 * human.
 */
export async function notifyTransition(
  orderId: string,
  transition: Exclude<FulfilmentState, "paid">,
): Promise<void> {
  try {
    await supabase.functions.invoke("notify-fulfilment", {
      body: { order_id: orderId, transition },
    });
  } catch {
    // Intentionally ignored — see above.
  }
}
