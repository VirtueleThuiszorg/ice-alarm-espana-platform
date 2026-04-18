import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { link_id, session_id, referrer } = await req.json();

    if (!link_id) {
      return new Response(
        JSON.stringify({ error: "link_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS for click tracking
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the link details
    const { data: link, error: linkError } = await supabase
      .from("partner_post_links")
      .select("id, post_id, partner_id, clicks")
      .eq("id", link_id)
      .single();

    if (linkError || !link) {
      return new Response(
        JSON.stringify({ error: "Link not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment click count
    const { error: updateError } = await supabase
      .from("partner_post_links")
      .update({ clicks: (link.clicks || 0) + 1 })
      .eq("id", link_id);

    if (updateError) {
      console.error("Error updating click count:", updateError);
    }

    // Create IP hash from request (for deduplication if needed later)
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const ipHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ip + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
    ).then((buf) => 
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
    );

    // Create UA hash
    const ua = req.headers.get("user-agent") || "unknown";
    const uaHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ua)
    ).then((buf) => 
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 32)
    );

    // Record click in partner_clicks table
    const { error: clickError } = await supabase
      .from("partner_clicks")
      .insert({
        link_id: link.id,
        post_id: link.post_id,
        partner_id: link.partner_id,
        session_id: session_id || null,
        ip_hash: ipHash.substring(0, 64),
        ua_hash: uaHash,
        referrer: referrer || null,
      });

    if (clickError) {
      console.error("Error recording click:", clickError);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("track-referral-click error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
