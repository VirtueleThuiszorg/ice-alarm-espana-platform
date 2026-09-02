import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "twilio-call-me";

// ── Rate limit settings ──
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_CALLS_PER_IP = 3;
const MAX_CALLS_PER_PHONE = 2;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxCalls: number): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: maxCalls - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  if (entry.count >= maxCalls) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, remaining: maxCalls - entry.count, resetIn: entry.resetAt - now };
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "Website", lastName: "Caller" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "Caller" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  // ═══════════════════════════════════════════════════════════
  // CALL-ME HANDLER (website callback requests ONLY)
  // Inbound voice is now handled by voice-handler / twilio-voice
  // ═══════════════════════════════════════════════════════════
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("x-real-ip") ||
                     "unknown";

    const { phoneNumber, callerName, language, conversationId } = await req.json();

    if (!phoneNumber || typeof phoneNumber !== "string") {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: jh },
      );
    }

    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+[0-9]{8,15}$/.test(cleanPhone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format. Please use international format starting with +" }),
        { status: 400, headers: jh },
      );
    }

    const lang = language === "en" ? "en" : "es";

    const ipRateLimit = checkRateLimit(`ip:${clientIp}`, MAX_CALLS_PER_IP);
    if (!ipRateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many call requests. Please try again later.", retryAfterMs: ipRateLimit.resetIn }),
        { status: 429, headers: jh },
      );
    }

    const phoneRateLimit = checkRateLimit(`phone:${cleanPhone}`, MAX_CALLS_PER_PHONE);
    if (!phoneRateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "This phone number has received too many calls recently. Please try again later.", retryAfterMs: phoneRateLimit.resetIn }),
        { status: 429, headers: jh },
      );
    }

    const sanitizedName = callerName
      ? String(callerName).replace(/[<>&"']/g, "").trim().slice(0, 50)
      : "";

    console.log(`[${FN}] Call request: IP=${clientIp}, Phone=${cleanPhone}, Name=${sanitizedName || "(none)"}, Language=${lang}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const normalizedPhone = cleanPhone.replace("+", "");
    let existingMember = null;

    const { data: memberByExact } = await supabase
      .from("members").select("id, first_name").eq("phone", cleanPhone).maybeSingle();

    if (memberByExact) {
      existingMember = memberByExact;
    } else {
      const { data: memberByNormalized } = await supabase
        .from("members").select("id, first_name").eq("phone", normalizedPhone).maybeSingle();
      existingMember = memberByNormalized;
    }

    let leadId: string | null = null;

    if (!existingMember) {
      const { firstName, lastName } = parseName(sanitizedName);
      const timestamp = Date.now();
      const placeholderEmail = `call-${timestamp}@pending.icealarm.es`;

      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          first_name: firstName, last_name: lastName,
          email: placeholderEmail, phone: cleanPhone,
          preferred_language: lang, enquiry_type: "callback",
          source: "website_call_me",
          message: "Requested callback via Call and Speak feature",
          status: "new",
        })
        .select("id").single();

      if (leadError) {
        console.error("Failed to create lead:", leadError);
      } else {
        leadId = newLead.id;
        console.log(`Created lead ${leadId} for website caller: ${firstName} ${lastName}`);
      }
    } else {
      console.log(`Caller is existing member: ${existingMember.id} (${existingMember.first_name})`);
    }

    const { data: twilioSettings } = await supabase
      .from("system_settings").select("key, value")
      .in("key", ["settings_twilio_account_sid", "settings_twilio_auth_token", "settings_twilio_phone_number"]);

    const twilioConfig = twilioSettings?.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {} as Record<string, string>) || {};

    if (!twilioConfig.settings_twilio_account_sid || !twilioConfig.settings_twilio_auth_token) {
      return new Response(
        JSON.stringify({ error: "Voice calling is not available at the moment" }),
        { status: 503, headers: jh },
      );
    }

    if (!twilioConfig.settings_twilio_phone_number) {
      return new Response(
        JSON.stringify({ error: "Voice calling is not configured" }),
        { status: 503, headers: jh },
      );
    }

    const baseUrl = Deno.env.get("SUPABASE_URL");

    // Outbound calls use voice-handler directly for the voice webhook
    let voiceUrl = `${baseUrl}/functions/v1/voice-handler?action=incoming&lang=${lang}&source=website`;
    if (conversationId) voiceUrl += `&conversation_id=${encodeURIComponent(conversationId)}`;
    if (sanitizedName) voiceUrl += `&caller_name=${encodeURIComponent(sanitizedName)}`;
    if (leadId) voiceUrl += `&lead_id=${encodeURIComponent(leadId)}`;

    let statusUrl = `${baseUrl}/functions/v1/voice-handler?action=status`;
    if (conversationId) statusUrl += `&conversation_id=${encodeURIComponent(conversationId)}`;
    if (leadId) statusUrl += `&lead_id=${encodeURIComponent(leadId)}`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.settings_twilio_account_sid}/Calls.json`;
    const auth = btoa(`${twilioConfig.settings_twilio_account_sid}:${twilioConfig.settings_twilio_auth_token}`);

    const callResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: cleanPhone,
        From: twilioConfig.settings_twilio_phone_number,
        Url: voiceUrl,
        Method: "POST",
        StatusCallback: statusUrl,
        StatusCallbackMethod: "POST",
        StatusCallbackEvent: "initiated ringing answered completed",
      }),
    });

    if (!callResponse.ok) {
      const errorText = await callResponse.text();
      console.error("Twilio API error:", callResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to initiate call. Please check your phone number and try again." }),
        { status: 500, headers: jh },
      );
    }

    const callData = await callResponse.json();
    console.log(`Call initiated successfully: CallSid=${callData.sid}, To=${cleanPhone}, LeadId=${leadId || "(member)"}`);

    return new Response(
      JSON.stringify({
        success: true, callSid: callData.sid, leadId,
        message: "Call is being initiated. Please answer your phone.",
      }),
      { headers: jh },
    );

  } catch (error) {
    console.error(`[${FN}] error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: jh },
    );
  }
});
