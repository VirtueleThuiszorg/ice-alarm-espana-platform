// twilio-voice: thin wrapper — forwards all requests to voice-handler
// Twilio should now point to /functions/v1/voice-handler directly.
// This exists only as a safety net if the old URL is still configured.

import { getCorsHeaders } from "../_shared/cors.ts";

const VERSION = "wrapper-v2.0.0";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  // Healthcheck
  if (req.method === "GET") {
    return new Response(`OK ${VERSION}`, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const baseUrl = Deno.env.get("SUPABASE_URL");
  if (!baseUrl) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-ES" voice="Polly.Lucia">Error de configuración.</Say><Hangup/></Response>`,
      {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "no-store",
          ...corsHeaders,
        },
      },
    );
  }

  try {
    // Preserve query string and forward to voice-handler
    const incomingUrl = new URL(req.url);
    const targetUrl = `${baseUrl}/functions/v1/voice-handler${incomingUrl.search}`;

    console.log(
      `[twilio-voice ${VERSION}] Forwarding ${req.method} to ${targetUrl}`,
    );

    const body = await req.arrayBuffer();

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type":
          req.headers.get("Content-Type") ||
          "application/x-www-form-urlencoded",
      },
      body: body.byteLength > 0 ? body : undefined,
    });

    const responseBody = await response.arrayBuffer();
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ||
          "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
        ...corsHeaders,
      },
    });
  } catch (e) {
    console.error(`[twilio-voice ${VERSION}] Forward error:`, e);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response>` +
        `<Say language="es-ES" voice="Polly.Lucia">Gracias por llamar. Un operador le atenderá en breve.</Say>` +
        `<Say language="en-GB" voice="Polly.Amy">Thank you for calling. An operator will assist you shortly.</Say>` +
        `<Hangup/></Response>`,
      {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "no-store",
          ...corsHeaders,
        },
      },
    );
  }
});
