import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "lead-prefill";

/**
 * WHAT A PERSONAL JOIN LINK IS ALLOWED TO FILL IN FOR ITS OWNER.
 *
 * Somebody in their eighties, on a telephone, who has just been sent a link by the person they
 * spoke to. Asking them to type a name and a phone number we already wrote down half an hour
 * ago is where a third of them stop.
 *
 * ── WHY THIS EXISTS AT ALL, RATHER THAN AN ANON READ ON `leads` ─────────────
 *
 * `leads` has no anonymous SELECT policy and must not get one: the table holds a non-customer's
 * consent record, the staff notes about them, a spam verdict, and every other lead in the
 * business. A policy narrow enough to be safe would still be a policy, and policies get widened.
 *
 * So this is the whole read, and it is four fields. It returns NOTHING ELSE — not the lead id,
 * not the status, not the notes, not whether we think they are spam. A caller holding the token
 * learns exactly what the person who holds the link already knows about themselves.
 *
 * ── AN EXPIRED OR UNKNOWN TOKEN IS AN EMPTY ANSWER, NOT AN ERROR ────────────
 *
 * 200 with nulls, always, and deliberately: a 404 for an unknown token and a 200 for a real one
 * is an oracle that tells anybody willing to guess which tokens exist. The wizard behaves the
 * same either way — it simply has nothing to pre-fill — which is also what happens when the
 * token is thirty-one days old.
 */
const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // The shape every answer takes, including every refusal.
  const EMPTY = { firstName: null, lastName: null, phone: null, email: null, language: null };

  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token.trim() : "";
  } catch {
    return json(200, EMPTY);
  }
  // A token we could not have minted is not worth a database round trip.
  if (!token || token.length > 128) return json(200, EMPTY);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data, error } = await db
    .from("leads")
    .select("first_name, last_name, phone, email, preferred_language, join_token_expires_at, status")
    .eq("join_token", token)
    .maybeSingle();

  if (error) {
    console.error(`[${FN}] lookup failed:`, error.message);
    return json(200, EMPTY);
  }
  if (!data) return json(200, EMPTY);

  // Thirty days is the promise the link makes. Honouring it afterwards would make the expiry
  // decorative — and a link that old is as likely to have been forwarded as remembered.
  const expires = data.join_token_expires_at
    ? new Date(data.join_token_expires_at as string).getTime()
    : 0;
  if (!expires || expires < Date.now()) return json(200, EMPTY);

  return json(200, {
    firstName: data.first_name || null,
    lastName: data.last_name || null,
    phone: data.phone || null,
    email: data.email || null,
    language: data.preferred_language || null,
  });
};

serve(handler);
