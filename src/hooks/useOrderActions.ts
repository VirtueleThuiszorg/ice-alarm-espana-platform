import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logCommissionActivity } from "@/lib/auditLog";
import { logCrmEvent } from "@/lib/crmEvents";
import type { OrderStatus } from "@/lib/orderStatus";

interface UpdateOrderStatusParams {
  orderId: string;
  /**
   * Derived from the database enum, never hand-listed. The five values written here previously
   * were the enum as it stood in January; `confirmed` and `awaiting_stock` were added in
   * 20260228170000 and this signature made them unrepresentable. See src/lib/orderStatus.ts.
   */
  status: OrderStatus;
  memberId: string;
}

export function useOrderActions() {
  const queryClient = useQueryClient();

  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status, memberId }: UpdateOrderStatusParams) => {
      const now = new Date().toISOString();
      const updateData: Record<string, unknown> = { status };

      // Set appropriate timestamp based on status
      if (status === "shipped") {
        updateData.shipped_at = now;
      } else if (status === "delivered") {
        updateData.delivered_at = now;
      }

      // Update order status
      const { error: orderError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId);

      if (orderError) throw orderError;

      // If delivered, check for partner attribution and create commission
      if (status === "delivered") {
        await createCommissionIfAttributed(orderId, memberId, now);
        
        // Log CRM event for pendant delivered
        await logCrmEvent("pendant_delivered", {
          order_id: orderId,
          member_id: memberId,
          delivered_at: now,
        });
      }

      return { orderId, status };
    },
    onSuccess: (data) => {
      toast.success(`Order marked as ${data.status}`);
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["partner-commissions"] });
    },
    onError: (error) => {
      console.error("Failed to update order status:", error);
      toast.error("Failed to update order status");
    },
  });

  return { updateOrderStatus };
}

/**
 * €50 FLAT, once per member, ever (Lee, 2026-07-24, re-confirmed 2026-09-08).
 *
 * No volume tiers, no discounts for more, and the same €50 whatever the partner
 * type — a `care` or `residential` partner earns exactly what a `referral`
 * partner earns. The signed agreement says "€50 gross for each successful
 * referral"; pendant delivery is the *trigger*, not the unit.
 *
 * It was called COMMISSION_PER_PENDANT_EUR, which invited the reading that a
 * couple ordering two pendants earns €100. It does not, and must not — the
 * contract pays per referred member. Renamed so the next person cannot
 * "fix" it into breaching the agreement.
 *
 * partnerFlatTerms.test.ts pins this against the public page and the portal copy.
 */
const COMMISSION_PER_MEMBER_EUR = 50;

async function createCommissionIfAttributed(
  orderId: string,
  memberId: string,
  deliveredAt: string
): Promise<void> {
  try {
    // Check if member has a partner attribution
    const { data: attribution, error: attrError } = await supabase
      .from("partner_attributions")
      .select("partner_id")
      .eq("member_id", memberId)
      .maybeSingle();

    if (attrError) {
      console.error("Error checking attribution:", attrError);
      return;
    }

    if (!attribution) {
      // No partner attribution, nothing to do
      return;
    }

    // ─── ONE MEMBER, ONE COMMISSION, EVER. ─────────────────────────────────
    // This used to key on `order_id`, which pays per delivered order. A member
    // who is later sent a replacement pendant — a second order, marked
    // delivered — earned the referrer another €50, silently. Commission is
    // payable on joining only (Lee, 2026-09-08), so the question is whether
    // THIS MEMBER has ever earned one, not whether this order has.
    //
    // `cancelled` rows are excluded deliberately. Correcting an order out of
    // `delivered` cancels its commission; if the pendant is then genuinely
    // delivered, the partner must still be paid. A cancelled row is not a
    // payment, so it must not act like one.
    //
    // The database enforces the same rule as a partial unique index
    // (20260911140200), because this check and the insert are two round trips
    // and two people can mark delivered at the same moment.
    const { data: existing, error: checkError } = await supabase
      .from("partner_commissions")
      .select("id")
      .eq("member_id", memberId)
      .neq("status", "cancelled")
      .limit(1);

    if (checkError) {
      console.error("Error checking existing commission:", checkError);
      return;
    }

    if (existing && existing.length > 0) {
      // This member has already earned their one commission.
      return;
    }

    const amountEur = COMMISSION_PER_MEMBER_EUR;

    // Calculate release date (7 days from delivery)
    const releaseAt = new Date(deliveredAt);
    releaseAt.setDate(releaseAt.getDate() + 7);

    // Create the commission
    const { data: commission, error: commError } = await supabase
      .from("partner_commissions")
      .insert({
        partner_id: attribution.partner_id,
        member_id: memberId,
        order_id: orderId,
        amount_eur: amountEur,
        status: "pending_release",
        trigger_event: "device_delivered",
        trigger_at: deliveredAt,
        release_at: releaseAt.toISOString(),
      })
      .select("id")
      .single();

    if (commError) {
      console.error("Error creating commission:", commError);
      return;
    }

    // Update partner invite to "converted" if it exists
    await supabase
      .from("partner_invites")
      .update({ status: "converted" })
      .eq("partner_id", attribution.partner_id)
      .eq("converted_member_id", memberId)
      .eq("status", "registered");

    // Log audit event
    await logCommissionActivity("commission_created", commission.id, undefined, {
      partner_id: attribution.partner_id,
      member_id: memberId,
      order_id: orderId,
      amount_eur: amountEur,
      trigger_event: "device_delivered",
    });

    // Log CRM event
    await logCrmEvent("commission_created", {
      commission_id: commission.id,
      partner_id: attribution.partner_id,
      member_id: memberId,
      order_id: orderId,
      amount_eur: amountEur,
      trigger_event: "device_delivered",
      release_at: releaseAt.toISOString(),
    });

    toast.success(`Partner commission created (€${amountEur})`);
  } catch (error) {
    console.error("Error in commission creation:", error);
  }
}
