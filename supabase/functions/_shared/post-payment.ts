import { sendEmail } from "./email.ts";
import { buildMemberWelcomeEmail } from "./welcome-email.ts";

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
  supabase: any,
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

  // 1. Update order status to confirmed
  await supabase
    .from("orders")
    .update({ status: "confirmed" })
    .eq("id", orderId);

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

  // 5. Auto-allocate EV-07B devices from stock
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
        if (item.device_id) {
          console.log(`Order item ${item.id} already has device ${item.device_id} allocated`);
          continue;
        }

        const quantityNeeded = item.quantity || 1;
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

          await supabase
            .from("order_items")
            .update({ device_id: availableDevice.id })
            .eq("id", item.id);

          console.log(`Allocated device ${availableDevice.id} to order item ${item.id}`);
        }
      }
    }
  } catch (allocError) {
    console.error("Device allocation error:", allocError);
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
      orderItems?.map((i: any) => `${i.quantity}x ${i.description}`).join(", ") || "N/A";

    const partnerData = attribution?.partners as any;
    const partnerName = partnerData?.contact_name || partnerData?.company_name || null;
    const memberData = orderData?.members as any;

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

        const emailSubject =
          lang === "es" || lang === "ES"
            ? "¡Bienvenido a ICE Alarm! Tu membresía está activa"
            : "Welcome to ICE Alarm! Your membership is active";

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
