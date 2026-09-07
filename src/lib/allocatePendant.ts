import { supabase } from "@/integrations/supabase/client";
import {
  FULFILMENT_TO_ORDER_STATUS,
  fulfilmentRank,
  type FulfilmentState,
} from "@/lib/fulfilmentState";
import { notifyTransition } from "@/lib/notifyTransition";

/**
 * ALLOCATION IS THE TRANSITION — `paid → allocated` has no other owner.
 *
 * `FULFILMENT_TRANSITION_OWNER.allocated` says "allocation", and until this module there was no
 * allocation path that wrote it. Two things allocate a pendant:
 *
 *   1. `_shared/post-payment.ts`, on payment. It picks a free EV-07B, sets `devices.status =
 *      'allocated'` and writes `order_items.device_id` — and does NOT move
 *      `orders.fulfilment_state`. That line belongs in the webhook path, which is why it is a
 *      SEPARATE PR that stays open for a human (golden rule 4, and the brief's rule that no PR
 *      touching stripe-webhook merges).
 *   2. `DeviceTab.assignDevice`, when a staff member allocates by hand — the stock-arrived case
 *      and the replacement case. That is this module.
 *
 * WHY THE ORDER ITEM MATTERS MORE THAN IT LOOKS. `assignDevice` used to write only
 * `devices.member_id`. `member_monitoring_readiness` reaches a device through
 * `orders → order_items → devices`, so a pendant allocated by hand was invisible to readiness:
 * that member could never become monitoring-ready however many test calls were made. Linking the
 * order item is not bookkeeping, it is the difference between a readiness number that can move
 * and one that cannot.
 *
 * NOTHING HERE IS BEST-EFFORT SILENT. Every outcome is named and returned, because "the device
 * was assigned but readiness will never work for this member" must not look like success.
 */

export type TransitionOutcome =
  /** Linked where relevant, and the order moved one rung. */
  | { kind: "moved"; orderId: string; orderNumber: string | null }
  /** Linked, but the order was already past `paid`, so there was no transition to make. */
  | { kind: "linked_no_transition"; orderId: string; state: FulfilmentState }
  /** The member has no order with a pendant line. Readiness cannot work until one exists. */
  | { kind: "no_pendant_order" }
  /** The write failed. The caller must surface this, never swallow it. */
  | { kind: "failed"; message: string };

/**
 * Link a freshly assigned device to the member's pendant order line and move that order to
 * `allocated`.
 *
 * Called AFTER the device row is written, deliberately: the device assignment is the thing the
 * staff member asked for and it must not be undone by a failure in the bookkeeping that
 * follows. The outcome says what did and did not happen so the screen can tell them.
 */
export async function linkDeviceToPendantOrder(
  memberId: string,
  deviceId: string,
): Promise<TransitionOutcome> {
  try {
    // The pendant line of this member's most recent order. `item_type = 'pendant'` rather than
    // "any line", because a registration fee or a subscription line is not a thing you can put
    // a device on.
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select(
        "id, order_id, device_id, created_at, orders!inner(id, member_id, fulfilment_state, status, order_number)",
      )
      .eq("item_type", "pendant")
      .eq("orders.member_id", memberId)
      .order("created_at", { ascending: false });

    if (itemsError) return { kind: "failed", message: itemsError.message };

    const rows = (items ?? []) as unknown as {
      id: string;
      order_id: string;
      device_id: string | null;
      orders: {
        id: string;
        fulfilment_state: FulfilmentState;
        status: string | null;
        order_number: string | null;
      };
    }[];

    if (rows.length === 0) return { kind: "no_pendant_order" };

    // Prefer a line with no device on it — that is the one being filled. Falling back to the
    // most recent line covers the replacement case, where the old device is being swapped out.
    const target = rows.find((r) => !r.device_id) ?? rows[0];

    const { error: linkError } = await supabase
      .from("order_items")
      .update({ device_id: deviceId })
      .eq("id", target.id);

    if (linkError) return { kind: "failed", message: linkError.message };

    const state = target.orders.fulfilment_state;
    if (state !== "paid") {
      // One step at a time is the trigger's rule and it is not this module's to bend. An order
      // already at `dispatched` whose device is being replaced does not go back to `allocated`
      // by a side-effect — that is a correction, with a role and a reason.
      return { kind: "linked_no_transition", orderId: target.order_id, state };
    }

    const { error: moveError } = await supabase
      .from("orders")
      .update({ fulfilment_state: "allocated" })
      .eq("id", target.order_id);

    if (moveError) return { kind: "failed", message: moveError.message };

/*
      AND THE CONDITION CLEARS ITSELF — increment 6.

      `awaiting_stock` is a value in `orders.status`: the record of `post-payment.ts` trying to
      allocate and finding no free pendant. Once one IS allocated that record is stale, and
      `fulfilmentCondition()` would keep reading "Awaiting stock" off it forever while the order
      sat at `allocated` — which is exactly the drift the orders row flags.

      So the status is moved to its counterpart in the same breath. Guarded on the stale value
      rather than written unconditionally: an order whose status a human has already corrected
      is not overwritten by a side-effect.
    */
    if (target.orders.status === "awaiting_stock") {
      const { error: statusError } = await supabase
        .from("orders")
        .update({ status: FULFILMENT_TO_ORDER_STATUS.allocated })
        .eq("id", target.order_id);
      // Not fatal: the device IS allocated and the fulfilment state says so. A stale status is
      // visible as drift on the orders row, which is better than refusing an allocation that
      // has already happened.
      if (statusError) {
        console.error("allocated, but orders.status was left stale:", statusError.message);
      }
    }

    // WP3: the state edge rings the dispatcher — LAST, once the row is fully consistent. A
    // member told "a pendant has been reserved for you" by a message that went out before the
    // status was reconciled would be told something the orders screen still contradicted.
    // Never allowed to fail this function: the allocation is the fact, the message is a
    // courtesy about the fact.
    await notifyTransition(target.order_id, "allocated");

    return {
      kind: "moved",
      orderId: target.order_id,
      orderNumber: target.orders.order_number,
    };
  } catch (e) {
    return { kind: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * PROVISIONING IS THE TRANSITION — `allocated → programmed`.
 *
 * The brief: *"the ProvisioningChecklist's steps are all complete — completing the checklist IS
 * the transition, not a separate button."* So this is called from the checklist's last
 * completion, and there is no button anywhere that sets `programmed`.
 *
 * It is attempted only from `allocated`, for the same reason as above: `paid → programmed` is a
 * skip the trigger refuses, and walking the order up two rungs to get around that would assert
 * an allocation this function has not checked.
 */
export async function markOrderProgrammed(deviceId: string): Promise<TransitionOutcome> {
  try {
    const { data: items, error } = await supabase
      .from("order_items")
      .select("order_id, created_at, orders!inner(id, fulfilment_state, order_number)")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false });

    if (error) return { kind: "failed", message: error.message };

    const rows = (items ?? []) as unknown as {
      order_id: string;
      orders: { fulfilment_state: FulfilmentState; order_number: string | null };
    }[];

    if (rows.length === 0) return { kind: "no_pendant_order" };

    const row = rows[0];
    if (row.orders.fulfilment_state !== "allocated") {
      return { kind: "linked_no_transition", orderId: row.order_id, state: row.orders.fulfilment_state };
    }

    const { error: moveError } = await supabase
      .from("orders")
      .update({ fulfilment_state: "programmed" })
      .eq("id", row.order_id);

    if (moveError) return { kind: "failed", message: moveError.message };

    await notifyTransition(row.order_id, "programmed");

    return { kind: "moved", orderId: row.order_id, orderNumber: row.orders.order_number };
  } catch (e) {
    return { kind: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Where an order sits relative to a target state, in words a staff member can act on. Used by
 * the screens to explain a `linked_no_transition` outcome rather than saying nothing.
 */
export function describeStatePosition(state: FulfilmentState, target: FulfilmentState): string {
  // `cancelled` has no rank, so it is answered before any arithmetic — comparing it would mean
  // comparing against null and getting "not far enough along" for an order that is stopped.
  if (state === "cancelled") return "this order is cancelled";
  const here = fulfilmentRank(state);
  const there = fulfilmentRank(target);
  if (here === null || there === null) return "this order is not in the fulfilment sequence";
  return here > there ? "this order is already further along" : "this order is not far enough along yet";
}
