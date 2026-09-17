/**
 * ISABELLA'S AI DISCLOSURE — EU AI Act (Reg. 2024/1689) art. 50(1), applicable from 2 Aug 2026.
 *
 * STATUS: DRAFT — starting point, pending legal review (LEGAL.md §2B/§3/§5). Nothing here makes
 * the service compliant; it puts the words in one place so counsel can change them in one place.
 *
 * WHY IT LIVES IN CODE AND NOT IN A SETTING. The spoken greetings are partly admin-configurable
 * (`system_settings.voice_greeting_*`) and the chat system prompts are DB-overridable
 * (`ai_agents.system_instruction`). A disclosure that an admin can edit away is not a disclosure.
 * So the handlers append these lines AFTER whatever was configured, and `ai-run` appends the
 * identity rule after whichever prompt won. `src/test/aiDisclosure.test.ts` pins both.
 *
 * Pure strings, no Deno APIs: vitest imports this file directly.
 */

export type DisclosureLang = "es" | "en";

/**
 * Said on an ordinary AI call (inbound, or the website "call me" callback) — the caller is not
 * necessarily in an emergency, so there is room for the full notice: AI, not a person, no medical
 * advice, how to reach a person, and what to do in an emergency.
 */
export const VOICE_AI_DISCLOSURE: Record<DisclosureLang, string> = {
  es:
    "Soy una asistente virtual de inteligencia artificial, no una persona, y no puedo darle consejo médico. " +
    "Si desea hablar con una persona, dígamelo en cualquier momento. " +
    "En caso de emergencia, pulse su botón SOS o llame al 112.",
  en:
    "I am an artificial intelligence virtual assistant, not a person, and I cannot give medical advice. " +
    "If you would like to speak to a person, just tell me at any time. " +
    "In an emergency, press your SOS button or call 112.",
};

/**
 * Said inside a live SOS conference, where every second counts and the member has ALREADY raised
 * the alarm. Only the identity statement and the fact that a human operator is involved — no
 * "call 112" (they have just done the equivalent) and no long preamble before "can you speak?".
 */
export function sosVoiceGreeting(lang: DisclosureLang, name: string): string {
  const who = name ? `${name}, ` : "";
  return lang === "es"
    ? `${who}soy Isabella, la asistente virtual de inteligencia artificial de ICE Alarm España; no soy una persona. ` +
        `Puedo ver su alerta y un operador de nuestro equipo va a atenderle. ¿Puede hablar conmigo?`
    : `${who}this is Isabella, ICE Alarm España's artificial intelligence virtual assistant; I am not a person. ` +
        `I can see your alert and one of our operators will be with you. Are you able to speak to me?`;
}

/**
 * Appended to EVERY chat and voice system prompt in `ai-run`, after any DB override. The model is
 * told the disclosure rules as hard rules; the UI and the spoken greeting carry the disclosure
 * itself, so this is the second line, not the only one.
 */
export const AI_IDENTITY_RULE = `

## Identity and transparency (NON-NEGOTIABLE — EU AI Act art. 50)
- You are an AI assistant. Never claim or imply that you are a human being, a nurse, a doctor or a member of staff.
- If anyone asks whether they are talking to a person or a machine, answer plainly that you are an AI assistant and offer to put them in touch with a person.
- You cannot give medical advice or a diagnosis. If asked, say so and suggest their doctor, or 112 in an emergency.
- If the person describes an emergency, tell them to press their SOS button or call 112 straight away, and escalate to a human.
`;
