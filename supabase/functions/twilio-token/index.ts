/**
 * Twilio Token — generates Twilio Access Token JWT for staff browser calling.
 *
 * POST { staff_id }
 * Auth: Bearer token (authenticated staff)
 *
 * Builds JWT with Voice Grant for incoming + outgoing calls.
 * Uses npm:jose@5 for JWT signing (Deno-compatible).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { loadTwilioCredentials } from "../_shared/twilio-credentials.ts";
import { SignJWT } from "npm:jose@5";

const FN = "twilio-token";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jh },
    );
  }

  try {
    // Verify authenticated user
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: jh },
      );
    }

    const { staff_id } = await req.json();

    if (!staff_id) {
      return new Response(
        JSON.stringify({ error: "staff_id is required" }),
        { status: 400, headers: jh },
      );
    }

    // Verify user is active staff matching staff_id
    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: staff } = await sbAdmin
      .from("staff")
      .select("id, status, user_id")
      .eq("id", staff_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!staff) {
      return new Response(
        JSON.stringify({ error: "Staff member not found or inactive" }),
        { status: 403, headers: jh },
      );
    }

    const creds = await loadTwilioCredentials(sbAdmin);

    if (!creds.apiKeySid || !creds.apiKeySecret || !creds.twimlAppSid) {
      return new Response(
        JSON.stringify({
          error: "Twilio API key credentials not configured",
        }),
        { status: 503, headers: jh },
      );
    }

    const identity = `staff-${staff_id}`;
    const now = Math.floor(Date.now() / 1000);
    const ttl = 3600;

    const jwt = await new SignJWT({
      jti: `${creds.apiKeySid}-${now}`,
      iss: creds.apiKeySid,
      sub: creds.accountSid,
      nbf: now,
      exp: now + ttl,
      grants: {
        identity,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: creds.twimlAppSid },
        },
      },
    })
      .setProtectedHeader({
        typ: "JWT",
        alg: "HS256",
        cty: "twilio-fpa;v=1",
      })
      .sign(new TextEncoder().encode(creds.apiKeySecret));

    console.log(`[${FN}] Token generated for ${identity}`);

    return new Response(
      JSON.stringify({ token: jwt, identity, ttl }),
      { headers: jh },
    );
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: jh },
    );
  }
});
