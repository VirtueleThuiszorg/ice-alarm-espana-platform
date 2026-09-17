import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  decidePublicSubmit,
  ipPrefix,
  leadRowFor,
  type PublicFormId,
  type PublicSubmitContext,
} from "../_shared/public-submit.ts";

/**
 * THE ONE DOOR EVERY PUBLIC FORM GOES THROUGH.
 *
 * Until now the contact form wrote to `leads` straight from the browser with the anon key, and
 * the only validation was `required` attributes on the HTML. Those exist in the browser of
 * somebody who visits the page and nowhere at all for a script POSTing to the REST endpoint — so
 * a lead arrived with no name, no email and no phone, and rang the new-enquiry bell for Lee and
 * Martijn.
 *
 * ── WHAT IS HERE AND WHAT IS NOT ────────────────────────────────────────────
 *
 * This file does I/O only: read the body, count the last hour, verify Turnstile if it is
 * configured, insert, log, prune. Every DECISION — complete? bot? too soon? spam? — is in
 * `_shared/public-submit.ts`, which is pure and has 34 tests that run in milliseconds. A rule
 * that lives in a deployed function is a rule nobody re-checks.
 *
 * ── ONE FUNCTION, NOT ONE PER FORM ──────────────────────────────────────────
 *
 * The forms differ only in which fields they declare. Two functions would be two copies of the
 * honeypot, the limiter and the logging, and the second copy is always the one that is missing a
 * fix six months later. The form id picks a field spec; everything else is shared.
 *
 * ── IT ANSWERS 200 TO A REFUSED BOT, NOT AN ERROR ───────────────────────────
 *
 * No: it answers 400 and 429 with the field names, because the FORM needs them to mark the boxes
 * — a visitor who mistyped an email has to be told which box. What it never returns is anything
 * about why a bot was caught: the honeypot and Turnstile refusals name no fields at all.
 */

const FN = "public-submit";

/** Per IP prefix and per email, per hour. Five is far above any real visitor and far below a run. */
const LIMIT_PER_HOUR = 5;

/** Nothing in the log is of use after the hour it was written for. */
const LOG_RETENTION_DAYS = 30;

/**
 * Which table each form writes to. The `source` VALUE is not here any more — it belongs with the
 * rest of the row's shape in `leadRowFor`, where it has a test; two places naming it was how one
 * of them could quietly be wrong.
 */
const FORMS: Record<PublicFormId, { table: "leads" }> = {
  contact: { table: "leads" },
  product_interest: { table: "leads" },
};

/** sha-256 of the lowercased address. The log recognises a repeat; it is not a contact list. */
async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Cloudflare Turnstile, when — and only when — a secret is configured.
 *
 * OFF BY DEFAULT, deliberately. Turning a CAPTCHA on for a site whose visitors are mostly in
 * their seventies and eighties is a real cost in enquiries lost, and the honeypot plus the rate
 * limit plus server-side validation is expected to be enough. This is the lever to pull if it
 * turns out not to be, and pulling it is a matter of setting one secret rather than a deploy.
 */
async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true; // Not configured: `turnstileRequired` is false and this is not read.
  try {
    const body = new FormData();
    body.append("secret", secret);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch (e) {
    // A Cloudflare outage must not take the contact form down with it. Failing OPEN is the right
    // way round here: the honeypot, the limiter and the field rules all still apply, and the
    // worst case is the spam level we had before Turnstile existed.
    console.error(`[${FN}] turnstile verification failed, allowing:`, e);
    return true;
  }
}

serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let payload: { form?: string; fields?: Record<string, unknown>; company?: unknown; turnstileToken?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid request", fields: [] });
  }

  const form = payload.form as PublicFormId;
  if (!form || !FORMS[form]) return json(400, { error: "Invalid request", fields: [] });

  const rawIp =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip");
  const prefix = ipPrefix(rawIp);

  // The email is needed for the per-email count BEFORE the decision, so it is read from the raw
  // body rather than from the validated values. A malformed one simply has no hash and is
  // limited by IP alone — it is about to be refused on validation anyway.
  const rawEmail = typeof payload.fields?.email === "string" ? payload.fields.email : "";
  const emailHash = rawEmail.includes("@") ? await hashEmail(rawEmail) : null;

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const countSince = async (column: "ip_prefix" | "email_hash", value: string | null) => {
    if (!value) return 0;
    const { count, error } = await db
      .from("public_submission_log")
      .select("id", { count: "exact", head: true })
      .eq(column, value)
      .gte("created_at", since);
    if (error) {
      // A limiter that cannot read its own memory must not become a closed door on the contact
      // form. It fails open and says so — the field rules below still apply.
      console.error(`[${FN}] rate-limit read failed on ${column}:`, error.message);
      return 0;
    }
    return count ?? 0;
  };

  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const turnstileToken =
    typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";

  const ctx: PublicSubmitContext = {
    recentFromIp: await countSince("ip_prefix", prefix),
    recentFromEmail: await countSince("email_hash", emailHash),
    limitPerHour: LIMIT_PER_HOUR,
    turnstileRequired: !!turnstileSecret,
    turnstileVerified: turnstileSecret ? await verifyTurnstile(turnstileToken, rawIp) : false,
  };

  const decision = decidePublicSubmit(
    { form, fields: payload.fields ?? {}, honeypot: payload.company },
    ctx,
  );

  /**
   * EVERY ATTEMPT IS LOGGED, accepted or not.
   *
   * This is the limiter's memory, and it only works if refusals count: a script sending a
   * thousand malformed requests an hour would otherwise be refused a thousand times and never
   * once be slowed down.
   */
  const log = async (outcome: "accepted" | "refused" | "rate_limited", reason: string | null) => {
    const { error } = await db.from("public_submission_log").insert({
      form,
      ip_prefix: prefix,
      email_hash: emailHash,
      outcome,
      reason,
    });
    if (error) console.error(`[${FN}] could not write the submission log:`, error.message);
  };

  if (!decision.ok) {
    await log(decision.status === 429 ? "rate_limited" : "refused", decision.reason);
    return json(decision.status, {
      error: decision.status === 429 ? "Too many submissions" : "Invalid submission",
      fields: decision.fields,
    });
  }

  // The row's SHAPE is a decision — which source, which status, what stands in for a column the
  // form does not ask about — so it lives in the pure module with the rest of them, where it has
  // a test. This shell does the I/O.
  const row = leadRowFor(form, decision.values, decision.spamReasons);

  const { error } = await db.from(FORMS[form].table).insert(row);
  if (error) {
    console.error(`[${FN}] insert failed:`, error.message);
    await log("refused", "insert_failed");
    return json(500, { error: "Could not save your message", fields: [] });
  }

  await log("accepted", decision.spamReasons.join(",") || null);

  // Housekeeping on the way past, rather than a cron nobody remembers exists. A log of who
  // contacted us that grows for ever is a liability rather than an asset.
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 86_400_000).toISOString();
  await db.from("public_submission_log").delete().lt("created_at", cutoff);

  return json(200, { ok: true });
});
