import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "./email.ts";
import { buildMemberWelcomeEmail, memberWelcomeSubject } from "./welcome-email.ts";

interface PostPaymentParams {
  orderId: string;
  paymentId: string;
  memberId: string;
  subscriptionId?: string;
  partnerMemberId?: string;
  partnerSubscriptionId?: string;
  amountPaid: number;
  gatewayPaymentId: string;
  gateway: "stripe" | "mollie";
}

/**
 * Shared post-payment processing used by both stripe-webhook and mollie-webhook.
 *
 * Handles: order confirmation, payment completion, member activation,
 * device allocation, CRM/AI events, admin notification, and welcome email.
 */
export async function handleSuccessfulPayment(
  supabase: SupabaseClient,
  params: PostPaymentParams
) {
  const {
    orderId,
    paymentId,
    memberId,
    subscriptionId,
    partnerMemberId,
    partnerSubscriptionId,
    amountPaid,
    gatewayPaymentId,
    gateway,
  } = params;

  // 1. Update order status to confirmed, and move it out of `awaiting_payment`
  //
  // `fulfilment_state` is the PHYSICAL sequence (20260908120400) and it started at
  // `awaiting_payment`, because an order exists from the moment the wizard is submitted —
  // before anybody has paid. Nothing was moving it, so every paid order still read
  // "awaiting payment" on the fulfilment board and no pendant was ever picked from it.
  //
  // Moving INTO `paid` is the one forward step the trigger treats as privileged, because it is
  // the one that asserts something about MONEY, and it demands a NEW reason distinct from the
  // old one. The service role satisfies `may_reverse_fulfilment()` (no JWT); the reason names
  // the gateway payment so the claim is auditable back to Stripe or Mollie.
  const { error: orderError } = await supabase
    .from("orders")
    .update({
      status: "confirmed",
      fulfilment_state: "paid",
      fulfilment_state_reason: `${gateway} payment ${gatewayPaymentId} confirmed by webhook`,
    })
    .eq("id", orderId);
  if (orderError) {
    // Checked, because a silent failure here is an order that is paid and looks unpaid.
    console.error("Error confirming order:", orderError);
  }

  // 2. Update payment status to completed
  const paymentUpdate: Record<string, unknown> = {
    status: "completed",
    paid_at: new Date().toISOString(),
  };
  if (gateway === "stripe") {
    paymentUpdate.stripe_payment_id = gatewayPaymentId;
  } else {
    paymentUpdate.mollie_payment_id = gatewayPaymentId;
  }
  await supabase.from("payments").update(paymentUpdate).eq("id", paymentId);

  // 3. Activate member
  const { error: activateError } = await supabase
    .from("members")
    .update({ status: "active" })
    .eq("id", memberId);
  if (activateError) {
    console.error("Error activating member:", activateError);
  } else {
    console.log("Member activated:", memberId);
  }

  // 4. Activate partner member if applicable
  if (partnerMemberId) {
    const { error: partnerErr } = await supabase
      .from("members")
      .update({ status: "active" })
      .eq("id", partnerMemberId);
    if (partnerErr) {
      console.error("Error activating partner member:", partnerErr);
    } else {
      console.log("Partner member activated:", partnerMemberId);
    }
  }

  // 5. Auto-allocate EV-07B devices from stock, then move fulfilment_state paid → allocated
  //
  // The move is CONDITIONAL on the allocation having actually happened, for every pendant the
  // order is for. `allocated` on the fulfilment board means "a device is set aside for this
  // person", and claiming it when stock ran out would hide the one case that needs a human.
  // An order with no pendant stays at `paid`: there is no device to allocate, and there is
  // nothing to dispatch, so pretending otherwise would put it in a queue it does not belong in.
  let pendantsNeeded = 0;
  let pendantsAllocated = 0;

  try {
    const { data: pendantItems, error: itemsError } = await supabase
      .from("order_items")
      .select("id, quantity, device_id")
      .eq("order_id", orderId)
      .eq("item_type", "pendant");

    if (itemsError) {
      console.error("Error fetching pendant items:", itemsError);
    } else if (pendantItems && pendantItems.length > 0) {
      console.log(`Found ${pendantItems.length} pendant order items to allocate`);

      for (const item of pendantItems) {
        const quantityNeeded = item.quantity || 1;
        pendantsNeeded += quantityNeeded;

        if (item.device_id) {
          console.log(`Order item ${item.id} already has device ${item.device_id} allocated`);
          // A re-delivered webhook must not re-allocate, and must not read as short of stock
          // either: this item is already served.
          pendantsAllocated += quantityNeeded;
          continue;
        }

        for (let i = 0; i < quantityNeeded; i++) {
          const { data: availableDevice, error: pickError } = await supabase
            .from("devices")
            .select("id")
            .eq("model", "EV-07B")
            .eq("status", "in_stock")
            .is("member_id", null)
            .limit(1)
            .single();

          if (pickError || !availableDevice) {
            console.warn("No EV-07B devices available in stock for allocation");
            await supabase
              .from("orders")
              .update({ status: "awaiting_stock" })
              .eq("id", orderId);
            break;
          }

          const { error: updateDeviceError } = await supabase
            .from("devices")
            .update({
              status: "allocated",
              member_id: memberId,
              assigned_at: new Date().toISOString(),
              reserved_order_id: orderId,
              reserved_at: new Date().toISOString(),
            })
            .eq("id", availableDevice.id)
            .eq("status", "in_stock");

          if (updateDeviceError) {
            console.error(`Error allocating device ${availableDevice.id}:`, updateDeviceError);
            continue;
          }

          // NOTE for a couple (quantity 2): `order_items.device_id` holds ONE device id, so the
          // second write overwrites the first and the item points at only one of the two
          // devices. The link is not lost — both devices carry `reserved_order_id` — but the
          // column cannot express two. Fixing it properly is a schema decision (one row per
          // pendant, or a join table) and is recorded in REVIEW_JOIN_PATH.md for the held
          // schema PR rather than papered over here.
          await supabase
            .from("order_items")
            .update({ device_id: availableDevice.id })
            .eq("id", item.id);

          pendantsAllocated += 1;
          console.log(`Allocated device ${availableDevice.id} to order item ${item.id}`);
        }
      }
    }
  } catch (allocError) {
    console.error("Device allocation error:", allocError);
  }

  // 5b. paid → allocated, only if every pendant on the order actually has a device
  if (pendantsNeeded > 0 && pendantsAllocated >= pendantsNeeded) {
    // A single forward step, so the trigger needs no reason for it — unlike the move into
    // `paid` above, this claim is about a device somebody can go and look at.
    const { error: allocStateError } = await supabase
      .from("orders")
      .update({ fulfilment_state: "allocated" })
      .eq("id", orderId)
      .eq("fulfilment_state", "paid");
    if (allocStateError) {
      console.error("Error moving fulfilment_state to allocated:", allocStateError);
    } else {
      console.log(`Order ${orderId} fulfilment_state: paid → allocated`);
    }
  } else if (pendantsNeeded > 0) {
    console.warn(
      `Order ${orderId} allocated ${pendantsAllocated}/${pendantsNeeded} pendants — ` +
        "fulfilment_state stays at `paid` so the shortfall stays visible.",
    );
  }

  // 6-9. CRM event, AI event, admin notification, welcome email
  try {
    const { data: attribution } = await supabase
      .from("partner_attributions")
      .select("partner_id, partners(contact_name, company_name)")
      .eq("member_id", memberId)
      .maybeSingle();

    const { data: orderData } = await supabase
      .from("orders")
      .select("*, members!inner (first_name, last_name, email, preferred_language)")
      .eq("id", orderId)
      .single();

    const { data: orderItems } = await supabase
      .from("order_items")
      .select("description, quantity")
      .eq("order_id", orderId);

    const productsSummary =
      orderItems?.map((i: { quantity?: number | null; description?: string | null }) => `${i.quantity}x ${i.description}`).join(", ") || "N/A";

    const partnerData = attribution?.partners as { contact_name?: string | null; company_name?: string | null } | null;
    const partnerName = partnerData?.contact_name || partnerData?.company_name || null;
    const memberData = orderData?.members as {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      preferred_language?: string | null;
    } | null;

    // CRM event
    await supabase.from("crm_events").insert({
      event_type: "order_paid",
      payload: {
        order_id: orderId,
        member_id: memberId,
        payment_id: paymentId,
        amount: amountPaid,
        partner_id: attribution?.partner_id || null,
        has_attribution: !!attribution,
        gateway,
      },
    });

    // AI event
    await supabase.from("ai_events").insert({
      event_type: "sale.paid",
      entity_type: "order",
      entity_id: orderId,
      payload: {
        order_id: orderId,
        member_id: memberId,
        customer_name: memberData
          ? `${memberData.first_name} ${memberData.last_name}`
          : "Unknown",
        email: memberData?.email || null,
        language: memberData?.preferred_language || "ES",
        amount: amountPaid,
        products_summary: productsSummary,
        partner_id: attribution?.partner_id || null,
        partner_name: partnerName,
        source: attribution ? "partner" : "direct",
        gateway,
      },
    });

    // Admin notification
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      await fetch(`${SUPABASE_URL}/functions/v1/notify-admin`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "sale.paid",
          entity_type: "order",
          entity_id: orderId,
          payload: {
            customer_name: memberData
              ? `${memberData.first_name} ${memberData.last_name}`
              : "Unknown",
            language: memberData?.preferred_language || "ES",
            amount: amountPaid,
            products_summary: productsSummary,
            source: attribution ? "partner" : "direct",
            partner_name: partnerName,
            order_id: orderId,
          },
        }),
      });
      console.log("notify-admin called for sale.paid");
    } catch (notifyError) {
      console.error("Failed to call notify-admin:", notifyError);
    }

    // Welcome email
    if (memberData?.email) {
      try {
        const orderNum = orderData?.order_number || orderId;
        const lang = memberData?.preferred_language || "es";
        const dashboardUrl = "https://icealarm.es/dashboard";

        const emailHtml = buildMemberWelcomeEmail(
          memberData.first_name,
          orderNum,
          amountPaid,
          productsSummary,
          lang,
          dashboardUrl
        );

        // Subject comes from the same locale table as the body, so a Dutch
        // member no longer gets a Spanish/English subject on a Dutch email.
        const emailSubject = memberWelcomeSubject(lang);

        const emailResult = await sendEmail(memberData.email, emailSubject, emailHtml);
        if (!emailResult.success) {
          console.error("Error sending welcome email:", emailResult.error);
        } else {
          console.log("Welcome email sent to:", memberData.email);
        }
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
      }
    }
  } catch (eventError) {
    console.error("Post-payment event processing error:", eventError);
  }
}
