/**
 * Isabella Voice Handler — generates TwiML for Isabella's voice in conferences.
 *
 * POST { action, alert_id, member_name?, member_language?, staff_name?, attempt? }
 *
 * Actions: greeting, hold_takeover, staff_returning, unresponsive_check,
 *          false_alarm_confirm, goodbye
 *
 * Each action logs an isabella_assessment_notes record.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "isabella-voice-handler";

function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twimlResponse(body: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

async function logNote(
  sb: ReturnType<typeof createClient>,
  alertId: string,
  noteType: string,
  content: string,
  isCritical = false,
) {
  await sb.from("isabella_assessment_notes").insert({
    alert_id: alertId,
    note_type: noteType,
    content,
    is_critical: isCritical,
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      action,
      alert_id,
      member_name,
      member_language,
      staff_name,
      attempt,
    } = await req.json();

    if (!action || !alert_id) {
      return new Response(
        JSON.stringify({ error: "action and alert_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lang = member_language === "en" ? "en" : "es";
    const name = member_name || "";
    const esVoice = "Polly.Lucia";
    const enVoice = "Polly.Amy";
    const voice = lang === "es" ? esVoice : enVoice;
    const twimlLang = lang === "es" ? "es-ES" : "en-GB";

    console.log(`[${FN}] action=${action} alert=${alert_id} lang=${lang}`);

    // ── GREETING ────────────────────────────────────────────────
    if (action === "greeting") {
      const recordingEs = "Esta llamada está siendo grabada para su seguridad.";
      const recordingEn = "This call is being recorded for your safety.";
      const greetEs = `${name ? `${name}, ` : ""}soy Isabella de ICE Alarm. Puedo ver su alerta. ¿Puede hablar conmigo?`;
      const greetEn = `${name ? `${name}, ` : ""}this is Isabella from ICE Alarm. I can see your alert. Are you able to speak to me?`;

      const recording = lang === "es" ? recordingEs : recordingEn;
      const greeting = lang === "es" ? greetEs : greetEn;

      await logNote(sb, alert_id, "observation", `Isabella greeting: ${recording} ${greeting}`);

      return twimlResponse(
        `<Say language="${twimlLang}" voice="${voice}">${esc(recording)}</Say>` +
          `<Pause length="1"/>` +
          `<Say language="${twimlLang}" voice="${voice}">${esc(greeting)}</Say>`,
      );
    }

    // ── HOLD TAKEOVER ───────────────────────────────────────────
    if (action === "hold_takeover") {
      const msgEs = `${name ? `${name}, ` : ""}${staff_name || "el operador"} está organizando ayuda para usted ahora. Yo me quedo aquí con usted. ¿Puede decirme, el dolor está empeorando o se mantiene igual?`;
      const msgEn = `${name ? `${name}, ` : ""}${staff_name || "the operator"} is arranging help for you now. I am staying right here with you. Can you tell me, is the pain getting worse or staying the same?`;
      const msg = lang === "es" ? msgEs : msgEn;

      await logNote(sb, alert_id, "observation", `Isabella hold takeover: ${msg}`);

      return twimlResponse(
        `<Say language="${twimlLang}" voice="${voice}">${esc(msg)}</Say>`,
      );
    }

    // ── STAFF RETURNING ─────────────────────────────────────────
    if (action === "staff_returning") {
      // Fetch recent notes since staff went on hold
      const { data: recentNotes } = await sb
        .from("isabella_assessment_notes")
        .select("content, note_type")
        .eq("alert_id", alert_id)
        .order("timestamp", { ascending: false })
        .limit(3);

      let summary = "";
      if (recentNotes && recentNotes.length > 0) {
        const observations = recentNotes
          .filter((n) => n.note_type === "member_response" || n.note_type === "observation")
          .map((n) => n.content)
          .slice(0, 2);
        if (observations.length > 0) {
          summary = lang === "es"
            ? `Mientras estaba ausente: ${observations.join(". ")}. `
            : `While you were away: ${observations.join(". ")}. `;
        }
      }

      const msgEs = `${summary}${staff_name || "El operador"} está de vuelta con usted ahora, ${name || "miembro"}.`;
      const msgEn = `${summary}${staff_name || "The operator"} is back with you now, ${name || "member"}.`;
      const msg = lang === "es" ? msgEs : msgEn;

      await logNote(sb, alert_id, "handover_briefing", msg);

      return twimlResponse(
        `<Say language="${twimlLang}" voice="${voice}">${esc(msg)}</Say>`,
      );
    }

    // ── UNRESPONSIVE CHECK ──────────────────────────────────────
    if (action === "unresponsive_check") {
      const attemptNum = attempt || 1;

      const messages: Record<number, { es: string; en: string }> = {
        1: {
          es: "¿Puede escucharme?",
          en: "Can you hear me?",
        },
        2: {
          es: "Si puede escucharme, intente hacer cualquier sonido.",
          en: "If you can hear me, try to make any sound.",
        },
        3: {
          es: "Voy a asegurarme de que la ayuda llegue hasta usted.",
          en: "I am going to make sure help reaches you.",
        },
      };

      const msgData = messages[attemptNum] || messages[3];
      const msg = lang === "es" ? msgData.es : msgData.en;

      const isCritical = attemptNum >= 2;
      await logNote(
        sb,
        alert_id,
        attemptNum >= 3 ? "triage_decision" : "question_asked",
        `Unresponsive check #${attemptNum}: ${msg}`,
        isCritical,
      );

      // After third attempt, mark member as unresponsive
      if (attemptNum >= 3) {
        await sb
          .from("alerts")
          .update({ is_unresponsive: true })
          .eq("id", alert_id);

        await logNote(sb, alert_id, "flag", "Member marked as UNRESPONSIVE after 3 check attempts", true);
      }

      // Say in both languages for unresponsive checks
      return twimlResponse(
        `<Say language="es-ES" voice="${esVoice}">${esc(msgData.es)}</Say>` +
          `<Pause length="3"/>` +
          `<Say language="en-GB" voice="${enVoice}">${esc(msgData.en)}</Say>`,
      );
    }

    // ── FALSE ALARM CONFIRM ─────────────────────────────────────
    if (action === "false_alarm_confirm") {
      const step = attempt || 1;

      if (step === 1) {
        const msgEs = "No hay problema. Solo por seguridad, ¿se encuentra bien? ¿Sin dolor, sin mareos?";
        const msgEn = "No problem at all. Just to be safe, are you feeling okay? No pain, no dizziness?";
        const msg = lang === "es" ? msgEs : msgEn;

        await logNote(sb, alert_id, "question_asked", `False alarm check step 1: ${msg}`);

        return twimlResponse(
          `<Say language="${twimlLang}" voice="${voice}">${esc(msg)}</Say>`,
        );
      }

      if (step === 2) {
        const msgEs = "¿Quiere que cancele la alerta?";
        const msgEn = "Shall I cancel the alert?";
        const msg = lang === "es" ? msgEs : msgEn;

        await logNote(sb, alert_id, "question_asked", `False alarm check step 2: ${msg}`);

        return twimlResponse(
          `<Say language="${twimlLang}" voice="${voice}">${esc(msg)}</Say>`,
        );
      }

      // Step 3: confirmed false alarm
      const msgEs = "Me alegro de que esté bien. Cuídese. Adiós.";
      const msgEn = "Glad you are okay. Take care, goodbye.";
      const msg = lang === "es" ? msgEs : msgEn;

      await logNote(sb, alert_id, "triage_decision", "False alarm confirmed by member. Resolving alert.");

      return twimlResponse(
        `<Say language="${twimlLang}" voice="${voice}">${esc(msg)}</Say>`,
      );
    }

    // ── GOODBYE ─────────────────────────────────────────────────
    if (action === "goodbye") {
      const msgEs = `Cuídese${name ? ` ${name}` : ""}. La ayuda está en camino. Adiós.`;
      const msgEn = `Take care${name ? ` ${name}` : ""}. Help is on the way. Goodbye.`;
      const msg = lang === "es" ? msgEs : msgEn;

      await logNote(sb, alert_id, "observation", `Isabella goodbye: ${msg}`);

      return twimlResponse(
        `<Say language="${twimlLang}" voice="${voice}">${esc(msg)}</Say>`,
      );
    }

    // Unknown action
    console.warn(`[${FN}] Unknown action: ${action}`);
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return twimlResponse(
      `<Say language="es-ES" voice="alice">Error técnico. Un operador le atenderá.</Say>`,
    );
  }
});
