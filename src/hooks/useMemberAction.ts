import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { functionError } from "@/lib/functionError";
import {
  buildMemberActionLog,
  memberActionSpec,
  type MemberAction,
} from "@/lib/memberActions";

/**
 * Perform and record one staff action on a member's subscription — WP7.
 *
 * TWO STEPS, IN THIS ORDER, AND THE ORDER IS THE DESIGN:
 *
 *   1. the Stripe action, where one exists (`admin-subscription-action`)
 *   2. the `activity_logs` row
 *
 * Stripe first, because a log of a cancellation that did not happen is a lie about a member's
 * protection, and the next person to read it would believe them uncovered. The existing
 * `performSubscriptionAction` takes the same order for the same reason: "Stripe FIRST — DB is
 * not touched if this throws."
 *
 * IF THE LOG WRITE FAILS AFTER THE ACTION SUCCEEDED, THAT IS SAID OUT LOUD. The change is real
 * and unrecorded, which is the one state this feature exists to prevent — so the toast names
 * it and tells the staff member to record it by hand, in the same shape `billing.ts` uses for
 * its own half-applied case ("RECONCILE MANUALLY"). It is not swallowed and it is not retried
 * silently.
 *
 * GOLDEN RULE 4 IS NOT TOUCHED. Nothing here writes `members.status`, a `subscriptions` row, a
 * plan or a tier. The two automated actions go through the admin edge function that has driven
 * Stripe since #16x; the other four are recorded, not performed. `src/lib/memberActions.ts`
 * explains why those four are offered rather than hidden.
 */

export interface MemberActionParams {
  memberId: string;
  action: MemberAction;
  reason: string;
  /** Needed only for the automated actions; the recorded-only ones do not use it. */
  subscriptionId?: string;
  /**
   * Which gateway holds this subscription, so the right server path is used.
   *
   * `admin-subscription-action` REFUSES Mollie by design ("Mollie billing actions not
   * implemented — refusing to change subscription status"), and `cancel-mollie-subscription`
   * exists for the one Mollie action there is.
   */
  gateway?: "stripe" | "mollie" | null;
}

export function useMemberAction() {
  const queryClient = useQueryClient();
  const { data: staff } = useCurrentStaff();

  const perform = useMutation({
    mutationFn: async ({
      memberId,
      action,
      reason,
      subscriptionId,
      gateway,
    }: MemberActionParams) => {
      const spec = memberActionSpec(action);

      if (!staff?.id) {
        // The trigger would refuse the row anyway; refusing here means the Stripe call has not
        // happened yet, so nothing is left half-done.
        throw new Error(
          "Your account is not linked to an active staff record, so this action cannot be attributed to anybody.",
        );
      }
      if (!reason.trim()) {
        throw new Error("A reason is required.");
      }

      // ── 1. the gateway, for the actions that have a server path ─────────
      if (spec.automation === "automated" && spec.serverAction) {
        if (!subscriptionId) {
          throw new Error("This member has no subscription to action.");
        }

        /*
          THE CLIENT NEVER WRITES `subscriptions.status`. Both functions below mirror the DB
          THEMSELVES, and only after the gateway has accepted the change.

          What was here before did the opposite: `SubscriptionTab.updateStatus` wrote
          `subscriptions.status` straight from the browser, and for Stripe it called nothing at
          all — the comment said "Stripe cancellation would be handled via Stripe Dashboard or
          API if needed". So pressing Cancel left the database saying cancelled while STRIPE
          KEPT CHARGING THE MEMBER'S CARD, and pressing Resume wrote status='active' from the
          client, which golden rule 4 reserves for the webhook.
        */
        if (gateway === "mollie") {
          if (spec.serverAction !== "cancel") {
            // The old code "paused" a Mollie subscription by writing the DB and leaving Mollie
            // charging. Refusing is not a lost capability; it is a removed trap.
            throw new Error(
              "This subscription is billed through Mollie, and only cancellation can be actioned there. Pause it in the Mollie dashboard, then record it here.",
            );
          }
          const { data, error } = await supabase.functions.invoke("cancel-mollie-subscription", {
            body: { subscriptionId },
          });
          if (error) throw await functionError(error, "The Mollie cancellation failed");
          if (data?.error) throw new Error(data.error);
        } else {
          const { data, error } = await supabase.functions.invoke("admin-subscription-action", {
            body: { subscriptionId, action: spec.serverAction },
          });
          if (error) throw await functionError(error, `The ${spec.serverAction} failed`);
          if (data?.error) throw new Error(data.error);
        }
      }

      // ── 2. the record ───────────────────────────────────────────────────
      const { error: logError } = await supabase
        .from("activity_logs")
        .insert(
          buildMemberActionLog({
            staffId: staff.id,
            memberId,
            action,
            reason,
            automation: spec.automation,
          }),
        );

      if (logError) {
        // Deliberately a distinct failure from the one above: the action DID happen.
        return {
          action,
          performed: spec.automation === "automated",
          logged: false,
          logError: logError.message,
        };
      }

      return { action, performed: spec.automation === "automated", logged: true };
    },
    onSuccess: (result, { memberId }) => {
      const spec = memberActionSpec(result.action);
      const label = spec.label.fallback;

      if (!result.logged) {
        toast.error("The change was made but NOT recorded", {
          description: `${label} went through, and the audit row failed: ${result.logError}. Record it by hand — an unattributed subscription change is the one thing this is meant to prevent.`,
          duration: 20_000,
        });
      } else if (result.performed) {
        toast.success(`${label} — done and recorded`);
      } else {
        toast.success(`${label} — recorded`, {
          description:
            "Now make the change in Stripe. This system has not touched the member's billing.",
          duration: 12_000,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["admin-member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["member-subscription", memberId] });
      queryClient.invalidateQueries({ queryKey: ["admin-activity-logs", memberId] });
    },
    onError: (error: Error) => {
      toast.error("Nothing was changed", { description: error.message });
    },
  });

  return { perform, staffId: staff?.id ?? null };
}
