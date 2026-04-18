import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



interface CommissionToApprove {
  id: string;
  partner_id: string;
  member_id: string;
  order_id: string | null;
  amount_eur: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find all commissions that are pending_release and past their release_at date
    const { data: pendingCommissions, error: fetchError } = await supabase
      .from("partner_commissions")
      .select("id, partner_id, member_id, order_id, amount_eur")
      .eq("status", "pending_release")
      .lte("release_at", now);

    if (fetchError) {
      console.error("Error fetching pending commissions:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingCommissions || pendingCommissions.length === 0) {
      return new Response(JSON.stringify({ message: "No commissions to process", processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let approved = 0;
    let cancelled = 0;

    for (const commission of pendingCommissions as CommissionToApprove[]) {
      try {
        // Validate: check if order is cancelled or refunded
        let shouldCancel = false;
        let cancelReason = "";

        if (commission.order_id) {
          const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("status")
            .eq("id", commission.order_id)
            .single();

          if (orderError) {
            console.error(`Error fetching order ${commission.order_id}:`, orderError);
            continue;
          }

          if (order.status === "cancelled") {
            shouldCancel = true;
            cancelReason = "Order was cancelled";
          }
        }

        // Check if member account is still active
        const { data: member, error: memberError } = await supabase
          .from("members")
          .select("status")
          .eq("id", commission.member_id)
          .single();

        if (memberError) {
          console.error(`Error fetching member ${commission.member_id}:`, memberError);
          continue;
        }

        if (member.status !== "active") {
          shouldCancel = true;
          cancelReason = `Member account is ${member.status}`;
        }

        // Check for refunded payments related to this order
        if (commission.order_id && !shouldCancel) {
          const { data: refundedPayment, error: paymentError } = await supabase
            .from("payments")
            .select("id")
            .eq("order_id", commission.order_id)
            .eq("status", "refunded")
            .limit(1);

          if (!paymentError && refundedPayment && refundedPayment.length > 0) {
            shouldCancel = true;
            cancelReason = "Order was refunded";
          }
        }

        if (shouldCancel) {
          // Cancel the commission
          const { error: cancelError } = await supabase
            .from("partner_commissions")
            .update({
              status: "cancelled",
              cancel_reason: cancelReason,
            })
            .eq("id", commission.id);

          if (cancelError) {
            console.error(`Error cancelling commission ${commission.id}:`, cancelError);
            continue;
          }

          // Log audit event
          await supabase.from("activity_logs").insert({
            action: "commission_cancelled",
            entity_type: "partner_commission",
            entity_id: commission.id,
            new_values: { cancel_reason: cancelReason },
          });

          cancelled++;
        } else {
          // Approve the commission
          const { error: approveError } = await supabase
            .from("partner_commissions")
            .update({
              status: "approved",
              approved_at: now,
            })
            .eq("id", commission.id);

          if (approveError) {
            console.error(`Error approving commission ${commission.id}:`, approveError);
            continue;
          }

          // Log audit event
          await supabase.from("activity_logs").insert({
            action: "commission_approved",
            entity_type: "partner_commission",
            entity_id: commission.id,
            new_values: { approved_at: now },
          });

          // Log CRM event
          await supabase.from("crm_events").insert({
            event_type: "commission_approved",
            payload: {
              commission_id: commission.id,
              partner_id: commission.partner_id,
              member_id: commission.member_id,
              amount_eur: commission.amount_eur,
              approved_at: now,
            },
          });

          approved++;
        }
      } catch (error) {
        console.error(`Error processing commission ${commission.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Commission processing complete",
        processed: pendingCommissions.length,
        approved,
        cancelled,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Process commissions error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
