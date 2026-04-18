import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const VERSION = "v2.1.0";
const FN = "voice-handler";

const FALLBACK_TWIML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<Response>` +
  `<Say voice="alice" language="es-ES">Gracias por llamar a ICE Alarm. Un operador le atenderá en breve.</Say>` +
  `<Say voice="alice" language="en-GB">Thank you for calling ICE Alarm. An operator will assist you shortly.</Say>` +
  `<Hangup/>` +
  `</Response>`;

function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const XML_HEADERS: HeadersInit = {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders,
  };

  const JSON_HEADERS: HeadersInit = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...corsHeaders,
  };

  function twiml(body: string): Response {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
      { status: 200, headers: XML_HEADERS },
    );
  }

  function safeFallback(): Response {
    return new Response(FALLBACK_TWIML, { status: 200, headers: XML_HEADERS });
  }

  try {
    // ── CORS ──
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // ── GET — return TwiML greeting (not plain text) ──
    if (req.method === "GET") {
      console.log(`[${FN} ${VERSION}] GET healthcheck — returning TwiML`);
      return safeFallback();
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "incoming";

    console.log(
      `[${FN} ${VERSION}] ${req.method} action=${action} url=${req.url}`,
    );

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const baseUrl = Deno.env.get("SUPABASE_URL")!;

    // Load voice settings once
    const { data: settings } = await sb
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "settings_twilio_account_sid",
        "settings_twilio_auth_token",
        "settings_twilio_phone_number",
        "voice_greeting_es",
        "voice_greeting_en",
        "voice_hold_es",
        "voice_hold_en",
        "voice_recording_notice_es",
        "voice_recording_notice_en",
      ]);

    const cfg: Record<string, string> = {};
    settings?.forEach((s) => {
      cfg[s.key] = s.value;
    });

    const getSetting = (key: string, fallback: string): string => {
      const v = cfg[key];
      return v?.trim() ? v : fallback;
    };

    // ─── WAIT ──────────────────────────────────────────
    if (action === "wait") {
      return twiml(
      `<Say language="es-ES" voice="alice">${esc(getSetting("voice_hold_es", "Por favor espere."))}</Say>` +
          `<Say language="en-GB" voice="alice">${esc(getSetting("voice_hold_en", "Please hold."))}</Say>` +
          `<Pause length="10"/>`,
      );
    }

    // ─── CONFERENCE-JOIN ────────────────────────────────
    // Returns TwiML that dials into an existing SOS conference.
    // Called as the Url for outbound Twilio calls placed by sos-conference-join.
    if (action === "conference-join") {
      const conferenceName = url.searchParams.get("conference_name") || "";
      if (!conferenceName) {
        console.error(`[${FN} ${VERSION}] conference-join missing conference_name`);
        return safeFallback();
      }

      const statusUrl = `${baseUrl}/functions/v1/sos-conference-status`;
      return twiml(
        `<Dial>` +
          `<Conference statusCallback="${esc(statusUrl)}" ` +
            `statusCallbackEvent="start end join leave mute" ` +
            `record="record-from-start">` +
            `${esc(conferenceName)}` +
          `</Conference>` +
        `</Dial>`,
      );
    }

    // Parse form data for all remaining actions
    let fd: FormData;
    try {
      fd = await req.formData();
    } catch {
      console.error(`[${FN} ${VERSION}] Failed to parse formData`);
      return safeFallback();
    }

    const callSid = (fd.get("CallSid") as string) || "";
    const from = (fd.get("From") as string) || "";
    const to = (fd.get("To") as string) || "";

    console.log(
      `[${FN} ${VERSION}] CallSid=${callSid} From=${from} To=${to} Action=${action}`,
    );

    // ─── INCOMING ──────────────────────────────────────
    if (action === "incoming") {
      try {
        const direction = (fd.get("Direction") as string) || "";
        const callerNameParam = url.searchParams.get("caller_name");
        const callerName = callerNameParam
          ? decodeURIComponent(callerNameParam)
              .replace(/[<>&"']/g, "")
              .trim()
          : "";
        const conversationParam = url.searchParams.get("conversation_id");
        const leadParam = url.searchParams.get("lead_id");

        console.log(
          `[${FN} ${VERSION}] Incoming call: ${from} ${callSid} ${callerName || "anonymous"}`,
        );

        // Look up member
        let member: any = null;
        const { data: m1 } = await sb
          .from("members")
          .select("id, first_name, last_name, preferred_language")
          .eq("phone", from)
          .maybeSingle();
        if (m1) {
          member = m1;
        } else {
          const { data: m2 } = await sb
            .from("members")
            .select("id, first_name, last_name, preferred_language")
            .eq("phone", from.replace("+", ""))
            .maybeSingle();
          member = m2;
        }

        // Check if caller is an emergency contact calling back during an active alert
        const normalizedFrom = from.replace("+", "");
        const { data: ecMatch } = await sb
          .from("emergency_contacts")
          .select("id, contact_name, relationship, member_id")
          .or(`phone.eq.${from},phone.eq.${normalizedFrom}`)
          .limit(5);

        if (ecMatch && ecMatch.length > 0) {
          // Check if any of these contacts' members have an active alert with a conference
          for (const ec of ecMatch) {
            const { data: activeAlert } = await sb
              .from("alerts")
              .select("id, conference_id")
              .eq("member_id", ec.member_id)
              .in("status", ["incoming", "in_progress"])
              .not("conference_id", "is", null)
              .order("received_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (activeAlert?.conference_id) {
              const { data: conf } = await sb
                .from("conference_rooms")
                .select("id, conference_name")
                .eq("id", activeAlert.conference_id)
                .eq("status", "active")
                .maybeSingle();

              if (conf) {
                // Get member name
                const { data: ecMember } = await sb
                  .from("members")
                  .select("first_name, last_name")
                  .eq("id", ec.member_id)
                  .maybeSingle();
                const ecMemberName = ecMember ? `${ecMember.first_name} ${ecMember.last_name}` : "member";

                console.log(`[${FN} ${VERSION}] Emergency contact ${ec.contact_name} calling back for alert ${activeAlert.id}`);

                // Redirect to sos-inbound-router
                const routerUrl = `${baseUrl}/functions/v1/sos-inbound-router?action=initial` +
                  `&alert_id=${encodeURIComponent(activeAlert.id)}` +
                  `&member_name=${encodeURIComponent(ecMemberName)}` +
                  `&relationship=${encodeURIComponent(ec.relationship)}` +
                  `&conference_name=${encodeURIComponent(conf.conference_name)}` +
                  `&ec_id=${encodeURIComponent(ec.id)}`;

                return twiml(`<Redirect method="POST">${esc(routerUrl)}</Redirect>`);
              }
            }
          }
        }

        // Check if caller is an EV-07B pendant SIM
        const { data: pendantDevice } = await sb
          .from("devices")
          .select("id, imei, member_id, last_location_lat, last_location_lng, model")
          .eq("sim_phone_number", from)
          .eq("model", "EV-07B")
          .not("member_id", "is", null)
          .maybeSingle();

        if (pendantDevice && pendantDevice.member_id) {
          console.log(`[${FN} ${VERSION}] Pendant SOS call detected: IMEI=${pendantDevice.imei} from=${from}`);

          // If no member found by phone, use the pendant's assigned member
          if (!member) {
            const { data: pendantMember } = await sb
              .from("members")
              .select("id, first_name, last_name, preferred_language")
              .eq("id", pendantDevice.member_id)
              .maybeSingle();
            if (pendantMember) {
              member = pendantMember;
            }
          }

          const memberName = member ? `${member.first_name} ${member.last_name}` : "Member";
          const memberLang = member?.preferred_language === "en" ? "en" : "es";

          // Check for existing active alert + conference for this member
          let sosAlertId: string | null = null;
          let conferenceData: { conference_id: string; conference_name: string } | null = null;

          const { data: existingAlert } = await sb
            .from("alerts")
            .select("id, conference_id")
            .eq("member_id", pendantDevice.member_id)
            .in("status", ["incoming", "in_progress"])
            .in("alert_type", ["sos_button", "fall_detected"])
            .order("received_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingAlert?.conference_id) {
            // Reuse existing conference
            const { data: existingConf } = await sb
              .from("conference_rooms")
              .select("id, conference_name")
              .eq("id", existingAlert.conference_id)
              .eq("status", "active")
              .maybeSingle();

            if (existingConf) {
              sosAlertId = existingAlert.id;
              conferenceData = {
                conference_id: existingConf.id,
                conference_name: existingConf.conference_name,
              };
              console.log(`[${FN} ${VERSION}] Reusing conference ${existingConf.conference_name} for alert ${sosAlertId}`);
            }
          }

          // Create new alert + conference if none exists
          if (!conferenceData) {
            try {
              const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

              // Create SOS alert (BLOCKING)
              const alertRes = await fetch(`${baseUrl}/functions/v1/ev07b-sos-alert`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": Deno.env.get("EV07B_CHECKIN_KEY") || "",
                },
                body: JSON.stringify({
                  imei: pendantDevice.imei,
                  alarm_type: "sos",
                  lat: pendantDevice.last_location_lat,
                  lng: pendantDevice.last_location_lng,
                  caller_phone: from,
                }),
              });

              if (alertRes.ok) {
                const alertData = await alertRes.json();
                sosAlertId = alertData.alert_id || alertData.id || null;
              }

              // If we got an alert ID, create the conference
              if (!sosAlertId) {
                // Fallback: find the just-created alert
                const { data: newAlert } = await sb
                  .from("alerts")
                  .select("id")
                  .eq("member_id", pendantDevice.member_id)
                  .in("status", ["incoming", "in_progress"])
                  .order("received_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                sosAlertId = newAlert?.id || null;
              }

              if (sosAlertId) {
                const confRes = await fetch(
                  `${baseUrl}/functions/v1/sos-conference-create`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${serviceKey}`,
                    },
                    body: JSON.stringify({
                      alert_id: sosAlertId,
                      member_phone: from,
                      member_name: memberName,
                    }),
                  },
                );

                if (confRes.ok) {
                  conferenceData = await confRes.json();
                  console.log(
                    `[${FN} ${VERSION}] Created conference ${conferenceData!.conference_name} for alert ${sosAlertId}`,
                  );
                }
              }
            } catch (e) {
              console.error(`[${FN} ${VERSION}] Conference creation error:`, e);
            }
          }

          // If we have a conference, route caller into it
          if (conferenceData) {
            const statusUrl = `${baseUrl}/functions/v1/sos-conference-status`;
            const greetMsg =
              memberLang === "es"
                ? `${memberName ? `${memberName}, ` : ""}esto es ICE Alarm. Hemos recibido su alerta de emergencia. Un operador se conectará en breve. Por favor permanezca en línea.`
                : `${memberName ? `${memberName}, ` : ""}this is ICE Alarm. We have received your emergency alert. An operator will connect shortly. Please stay on the line.`;
            const twimlLang = memberLang === "es" ? "es-ES" : "en-GB";

            return twiml(
              `<Say language="${twimlLang}" voice="alice">${esc(greetMsg)}</Say>` +
                `<Dial>` +
                  `<Conference statusCallback="${esc(statusUrl)}" ` +
                    `statusCallbackEvent="start end join leave mute" ` +
                    `record="record-from-start">` +
                    `${esc(conferenceData.conference_name)}` +
                  `</Conference>` +
                `</Dial>`,
            );
          }

          // Fallback: conference creation failed, continue with AI conversation flow
          console.warn(`[${FN} ${VERSION}] Conference creation failed for pendant SOS, falling back to AI flow`);
        }

        const lang =
          url.searchParams.get("lang") ||
          member?.preferred_language ||
          "es";
        const twimlLang = lang === "es" ? "es-ES" : "en-GB";

        // Conversation tracking
        let convId = conversationParam || null;
        if (convId) {
          const { data: existing } = await sb
            .from("conversations")
            .select("id")
            .eq("id", convId)
            .maybeSingle();
          if (existing) {
            const upd: any = {
              source: "mixed",
              last_channel: "voice",
              last_message_at: new Date().toISOString(),
            };
            if (leadParam) upd.lead_id = leadParam;
            await sb.from("conversations").update(upd).eq("id", convId);
          } else {
            convId = null;
          }
        }
        if (!convId) {
          const ins: any = {
            member_id: member?.id || null,
            language: lang === "es" ? "es" : "en",
            source: conversationParam ? "mixed" : "voice",
            last_channel: "voice",
            status: "open",
            last_message_at: new Date().toISOString(),
          };
          if (leadParam) ins.lead_id = leadParam;
          const { data: newConv } = await sb
            .from("conversations")
            .insert(ins)
            .select("id")
            .single();
          convId = newConv?.id || null;
        }

        // Voice call session
        try {
          await sb.from("voice_call_sessions").insert({
            call_sid: callSid,
            caller_phone: from,
            member_id: member?.id || null,
            language: twimlLang,
            status: "active",
            messages: [],
            conversation_id: convId,
          });
        } catch {
          await sb.from("voice_call_sessions").insert({
            call_sid: callSid,
            caller_phone: from,
            member_id: member?.id || null,
            language: twimlLang,
            status: "active",
            messages: [],
          });
        }

        // Conversation call record
        if (convId) {
          try {
            await sb.from("conversation_calls").insert({
              conversation_id: convId,
              call_sid: callSid,
              direction: direction?.includes("outbound")
                ? "outbound"
                : "inbound",
              from_number: from,
              to_number: to,
              started_at: new Date().toISOString(),
              status: "initiated",
            });
          } catch {}
        }

        if (convId && member?.id) {
          await sb
            .from("conversations")
            .update({ member_id: member.id })
            .eq("id", convId)
            .is("member_id", null);
        }

        // Build greeting
        const recEs = getSetting(
          "voice_recording_notice_es",
          "Esta llamada puede ser grabada.",
        );
        const recEn = getSetting(
          "voice_recording_notice_en",
          "This call may be recorded.",
        );
        const name = member?.first_name || callerName || "";

        const greetEs = name
          ? `Hola ${name}, bienvenido a ICE Alarm. Soy Isabel. ${recEs} ¿En qué puedo ayudarle?`
          : `${getSetting("voice_greeting_es", "Gracias por llamar a ICE Alarm. Soy Isabel.")} ${recEs} ¿En qué puedo ayudarle?`;

        const greetEn = name
          ? `Hello ${name}, welcome to ICE Alarm. I'm Isabel. ${recEn} How can I help?`
          : `${getSetting("voice_greeting_en", "Thank you for calling ICE Alarm. I'm Isabel.")} ${recEn} How can I help?`;

        // Log greeting as conversation message
        if (convId) {
          try {
            await sb.from("conversation_messages").insert({
              conversation_id: convId,
              channel: "voice",
              role: "assistant",
              content: lang === "es" ? greetEs : greetEn,
              meta: { callSid, type: "greeting" },
            });
          } catch {}
        }

        const txUrl = convId
          ? `${baseUrl}/functions/v1/${FN}?action=transcription&conversation_id=${encodeURIComponent(convId)}`
          : `${baseUrl}/functions/v1/${FN}?action=transcription`;

        return twiml(
          `<Say language="es-ES" voice="alice">${esc(greetEs)}</Say>` +
            `<Pause length="1"/>` +
            `<Say language="en-GB" voice="alice">${esc(greetEn)}</Say>` +
            `<Gather input="speech" action="${txUrl}" language="${twimlLang}" speechTimeout="auto" timeout="10" actionOnEmptyResult="true"></Gather>`,
        );
      } catch (e) {
        console.error(`[${FN} ${VERSION}] Incoming error:`, e);
        return twiml(
          `<Say language="es-ES" voice="alice">Gracias por llamar. Un operador le atenderá.</Say>` +
            `<Enqueue waitUrl="${baseUrl}/functions/v1/${FN}?action=wait">ice-alarm-queue</Enqueue>`,
        );
      }
    }

    // ─── TRANSCRIPTION ─────────────────────────────────
    if (action === "transcription") {
      const speech = (fd.get("SpeechResult") as string) || "";
      const confidence = fd.get("Confidence") as string;
      const convParam = url.searchParams.get("conversation_id");

      console.log(
        `[${FN} ${VERSION}] Speech: ${speech} Confidence: ${confidence}`,
      );

      if (!speech.trim()) {
        return twiml(
          `<Redirect method="POST">${baseUrl}/functions/v1/${FN}?action=timeout&amp;callSid=${encodeURIComponent(callSid)}</Redirect>`,
        );
      }

      const { data: session } = await sb
        .from("voice_call_sessions")
        .select("*")
        .eq("call_sid", callSid)
        .single();
      if (!session) {
        return twiml(
          `<Say language="es-ES" voice="alice">Error técnico.</Say><Hangup/>`,
        );
      }

      const messages =
        (session.messages as Array<{ role: string; content: string }>) || [];
      messages.push({ role: "user", content: speech });
      const convId = convParam || session.conversation_id;

      if (convId) {
        try {
          await sb.from("conversation_messages").insert({
            conversation_id: convId,
            channel: "voice",
            role: "user",
            content: speech,
            meta: {
              callSid,
              confidence: confidence ? parseFloat(confidence) : null,
            },
          });
        } catch {}
      }

      let lang = session.language;
      if (messages.length === 1) {
        lang =
          /\b(hola|gracias|buenos|buenas|sí|quiero|necesito|por favor|ayuda)\b/i.test(
            speech,
          )
            ? "es-ES"
            : "en-GB";
        await sb
          .from("voice_call_sessions")
          .update({ language: lang })
          .eq("call_sid", callSid);
      }

      await sb
        .from("voice_call_sessions")
        .update({
          messages,
          timeout_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("call_sid", callSid);

      const aiRes = await fetch(`${baseUrl}/functions/v1/ai-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          agentKey: "customer_service_expert",
          context: {
            source: "voice_call",
            isVoiceCall: true,
            callDirection: "inbound",
            callerPhone: session.caller_phone,
            memberId: session.member_id,
            conversationHistory: messages.slice(0, -1),
            currentMessage: speech,
            userLanguage: lang.startsWith("es") ? "es" : "en",
          },
        }),
      });

      const ln = lang.startsWith("es") ? "es-ES" : "en-GB";
      const voice = "alice";

      if (!aiRes.ok) {
        console.error(
          `[${FN} ${VERSION}] AI error:`,
          await aiRes.text(),
        );
        const gatherUrl = `${baseUrl}/functions/v1/${FN}?action=transcription${convId ? "&conversation_id=" + encodeURIComponent(convId) : ""}`;
        return twiml(
          `<Say language="${ln}" voice="${voice}">${lang.startsWith("es") ? "Dificultades técnicas. ¿Puede repetir?" : "Technical issue. Could you repeat?"}</Say>` +
            `<Gather input="speech" action="${gatherUrl}" language="${lang}" speechTimeout="auto" timeout="10" actionOnEmptyResult="true"></Gather>`,
        );
      }

      const aiData = await aiRes.json();
      let reply = aiData.output?.response || "";
      console.log(`[${FN} ${VERSION}] AI reply: ${reply}`);

      // Handle escalation
      const escMatch = reply.match(/\[ESCALATE:\s*(.+?)\]/i);
      if (escMatch) {
        reply = reply.replace(/\[ESCALATE:\s*.+?\]/i, "").trim();
        await sb
          .from("voice_call_sessions")
          .update({
            status: "escalated",
            escalated_at: new Date().toISOString(),
            escalation_reason: escMatch[1],
          })
          .eq("call_sid", callSid);
        messages.push({ role: "assistant", content: reply });
        await sb
          .from("voice_call_sessions")
          .update({ messages })
          .eq("call_sid", callSid);

        const { data: phoneCfg } = await sb
          .from("system_settings")
          .select("key, value")
          .in("key", [
            "settings_call_centre_phone",
            "settings_emergency_phone",
          ]);
        const phones: Record<string, string> = {};
        phoneCfg?.forEach((s) => {
          phones[s.key] = s.value;
        });
        const escPhone =
          phones.settings_call_centre_phone ||
          phones.settings_emergency_phone ||
          cfg.settings_twilio_phone_number;

        return twiml(
          (reply
            ? `<Say language="${ln}" voice="${voice}">${esc(reply)}</Say>`
            : "") +
            `<Say language="${ln}" voice="${voice}">${lang.startsWith("es") ? "Conectándole con un especialista." : "Connecting you to a specialist."}</Say>` +
            `<Dial timeout="30" callerId="${cfg.settings_twilio_phone_number}">${escPhone}</Dial>` +
            `<Say language="${ln}" voice="${voice}">${lang.startsWith("es") ? "Operadores ocupados. Intente luego." : "Operators busy. Try later."}</Say>` +
            `<Hangup/>`,
        );
      }

      messages.push({ role: "assistant", content: reply });
      await sb
        .from("voice_call_sessions")
        .update({ messages })
        .eq("call_sid", callSid);

      if (convId) {
        try {
          await sb.from("conversation_messages").insert({
            conversation_id: convId,
            channel: "voice",
            role: "assistant",
            content: reply,
            meta: { callSid },
          });
        } catch {}
      }

      const nextUrl = `${baseUrl}/functions/v1/${FN}?action=transcription${convId ? "&conversation_id=" + encodeURIComponent(convId) : ""}`;
      return twiml(
        `<Say language="${ln}" voice="${voice}">${esc(reply)}</Say>` +
          `<Gather input="speech" action="${nextUrl}" language="${lang}" speechTimeout="auto" timeout="10" actionOnEmptyResult="true"></Gather>`,
      );
    }

    // ─── TIMEOUT ───────────────────────────────────────
    if (action === "timeout") {
      let cSid = url.searchParams.get("callSid") || "";
      try {
        cSid = (fd.get("CallSid") as string) || cSid;
      } catch {}

      const { data: session } = await sb
        .from("voice_call_sessions")
        .select("*")
        .eq("call_sid", cSid)
        .single();
      const tc = (session?.timeout_count || 0) + 1;
      const lang = session?.language || "es-ES";
      const ln = lang.startsWith("es") ? "es-ES" : "en-GB";
      const voice = "alice";

      if (session) {
        await sb
          .from("voice_call_sessions")
          .update({
            timeout_count: tc,
            updated_at: new Date().toISOString(),
          })
          .eq("call_sid", cSid);
      }

      if (tc >= 3) {
        if (session) {
          await sb
            .from("voice_call_sessions")
            .update({ status: "timeout_ended" })
            .eq("call_sid", cSid);
        }
        return twiml(
          `<Say language="${ln}" voice="${voice}">${lang.startsWith("es") ? "No le escucho. Llame de nuevo. Adiós." : "Can't hear you. Please call back. Goodbye."}</Say>` +
            `<Hangup/>`,
        );
      }

      return twiml(
        `<Say language="${ln}" voice="${voice}">${lang.startsWith("es") ? "No le escuché. ¿Puede repetir?" : "Didn't catch that. Could you repeat?"}</Say>` +
          `<Gather input="speech" action="${baseUrl}/functions/v1/${FN}?action=transcription" language="${lang}" speechTimeout="auto" timeout="10" actionOnEmptyResult="true"></Gather>`,
      );
    }

    // ─── STATUS ────────────────────────────────────────
    if (action === "status") {
      const callStatus = (fd.get("CallStatus") as string) || "";
      const duration = (fd.get("CallDuration") as string) || "";
      const recordingUrl = (fd.get("RecordingUrl") as string) || "";
      const convParam = url.searchParams.get("conversation_id");
      const leadParam = url.searchParams.get("lead_id");

      console.log(
        `[${FN} ${VERSION}] Status: ${callSid} ${callStatus} ${duration}`,
      );

      if (
        ["completed", "busy", "failed", "no-answer"].includes(callStatus)
      ) {
        await sb
          .from("voice_call_sessions")
          .update({
            status: callStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("call_sid", callSid);
      }

      await sb
        .from("conversation_calls")
        .update({
          ended_at: new Date().toISOString(),
          recording_url: recordingUrl || null,
          status: callStatus,
        })
        .eq("call_sid", callSid);
      await sb
        .from("alert_communications")
        .update({
          duration_seconds: duration ? parseInt(duration) : null,
          recording_url: recordingUrl || null,
          notes: `Call ${callStatus}`,
        })
        .eq("twilio_sid", callSid);

      if (callStatus === "completed") {
        try {
          let convId = convParam;
          if (!convId) {
            const { data: cc } = await sb
              .from("conversation_calls")
              .select("conversation_id")
              .eq("call_sid", callSid)
              .maybeSingle();
            convId = cc?.conversation_id;
          }

          let memberId: string | null = null;
          if (from) {
            const nf = from.replace("+", "");
            const { data: mb } = await sb
              .from("members")
              .select("id")
              .or(`phone.eq.${from},phone.eq.${nf}`)
              .maybeSingle();
            if (mb) memberId = mb.id;
          }

          const dur = duration ? parseInt(duration) : 0;
          let note = `📞 Voice Call\n📅 ${new Date().toLocaleString()}\n📱 ${from || "?"}\n⏱️ ${dur}s`;
          if (recordingUrl) note += `\n🎙️ ${recordingUrl}`;

          if (memberId) {
            await sb.from("member_notes").insert({
              member_id: memberId,
              content: note,
              note_type: "support",
              is_pinned: false,
            });
          }

          if (convId) {
            await sb
              .from("conversations")
              .update({
                status: "closed",
                last_message_at: new Date().toISOString(),
              })
              .eq("id", convId);
          }

          const leadId =
            leadParam ||
            (convId
              ? (
                  await sb
                    .from("conversations")
                    .select("lead_id")
                    .eq("id", convId)
                    .maybeSingle()
                ).data?.lead_id
              : null);
          if (!memberId && leadId) {
            await sb
              .from("leads")
              .update({
                status: "contacted",
                notes: `Call completed - ${dur}s`,
              })
              .eq("id", leadId);
          }
        } catch (e) {
          console.error(`[${FN} ${VERSION}] Note error:`, e);
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: JSON_HEADERS,
      });
    }

    // ─── RECORDING ─────────────────────────────────────
    if (action === "recording") {
      await sb
        .from("alert_communications")
        .update({ recording_url: fd.get("RecordingUrl") as string })
        .eq("twilio_sid", callSid);
      return new Response(JSON.stringify({ received: true }), {
        headers: JSON_HEADERS,
      });
    }

    // ─── UNKNOWN ACTION ────────────────────────────────
    console.warn(`[${FN} ${VERSION}] Unknown action: ${action}`);
    return safeFallback();
  } catch (e) {
    console.error(`[${FN} ${VERSION}] FATAL ERROR:`, e);
    return safeFallback();
  }
});
