/**
 * ISABELLA SAYS SHE IS AN AI — EU AI Act art. 50(1), applicable 2 Aug 2026 (LEGAL.md §2B/§3).
 * DRAFT wording, pending legal review. What this file holds in place:
 *
 *   - Chat (public widget, member pill, member Support page, Contact page): a visible notice
 *     ABOVE the conversation that she is an AI, not a person, cannot give medical advice, how to
 *     reach a person and 112. Staff/admin assistants are internal tools and do not render it.
 *   - Voice: the disclosure is appended in CODE after the admin-configurable greeting, in both the
 *     ordinary AI call and the SOS conference, so no setting can remove it. Previously the ordinary
 *     call said only "Soy Isabel." and the SOS greeting "soy Isabella de ICE Alarm España".
 *   - Every chat/voice system prompt in ai-run carries the identity rule AFTER any DB override.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AI_IDENTITY_RULE,
  VOICE_AI_DISCLOSURE,
  sosVoiceGreeting,
} from "../../supabase/functions/_shared/ai-disclosure";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));
const chatState = {
  messages: [],
  inputValue: "",
  setInputValue: () => {},
  isLoading: false,
  sendMessage: () => {},
  handleKeyPress: () => {},
  resetConversation: () => {},
  initializeChat: () => {},
  scrollRef: { current: null },
  inputRef: { current: null },
  avatarUrl: null,
  agentLoading: false,
  imagePreloaded: false,
  conversationId: null,
  getOrCreateDbConversation: async () => null,
};
vi.mock("@/hooks/useAIChat", () => ({ useAIChat: () => chatState }));
vi.mock("@/components/chat/CallMeModal", () => ({ CallMeModal: () => null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ memberId: "m1" }) }));
vi.mock("@/hooks/useMemberProfile", () => ({ useMemberProfile: () => ({ data: { first_name: "Ana" } }) }));

import { AIChatWidget } from "@/components/chat/AIChatWidget";
import { InlineAIChat } from "@/components/chat/InlineAIChat";

afterEach(cleanup);

describe("the words", () => {
  it.each(["es", "en"] as const)("voice disclosure (%s) says AI, not a person, no medical advice, a person on request, 112", (lang) => {
    const s = VOICE_AI_DISCLOSURE[lang];
    const want =
      lang === "es"
        ? [/inteligencia artificial/, /no una persona/, /consejo médico/, /hablar con una persona/, /112/]
        : [/artificial intelligence/, /not a person/, /medical advice/, /speak to a person/, /112/];
    for (const re of want) expect(s).toMatch(re);
  });

  it("the SOS greeting says it first, keeps the name, and still asks if they can speak", () => {
    const es = sosVoiceGreeting("es", "María");
    expect(es.startsWith("María, soy Isabella")).toBe(true);
    expect(es).toMatch(/inteligencia artificial.*no soy una persona/);
    expect(es).toMatch(/¿Puede hablar conmigo\?$/);
    const en = sosVoiceGreeting("en", "");
    expect(en.startsWith("this is Isabella")).toBe(true);
    expect(en).toMatch(/artificial intelligence.*I am not a person/);
    expect(en).toMatch(/Are you able to speak to me\?$/);
  });

  it("the identity rule forbids claiming to be human and giving medical advice", () => {
    expect(AI_IDENTITY_RULE).toMatch(/Never claim or imply that you are a human/);
    expect(AI_IDENTITY_RULE).toMatch(/cannot give medical advice/);
    expect(AI_IDENTITY_RULE).toMatch(/112/);
  });

  it.each(["en", "es", "nl"])("chat.aiDisclosure exists in %s and names 112", (loc) => {
    const j = JSON.parse(read(`src/i18n/locales/${loc}.json`));
    expect(j.chat.aiDisclosure.label.length).toBeGreaterThan(5);
    expect(j.chat.aiDisclosure.text).toMatch(/112/);
    expect(j.chat.welcomeMessage).toMatch(/Isabella/);
    if (loc !== "en") {
      const en = JSON.parse(read("src/i18n/locales/en.json"));
      expect(j.chat.aiDisclosure.text).not.toBe(en.chat.aiDisclosure.text);
    }
  });
});

describe("chat surfaces show the notice up front", () => {
  it.each(["public", "member"] as const)("AIChatWidget (%s)", (userRole) => {
    render(<AIChatWidget defaultOpen userRole={userRole} />);
    const note = screen.getByTestId("ai-disclosure");
    expect(note).toHaveAttribute("role", "note");
    expect(note).toHaveTextContent("chat.aiDisclosure.label");
    expect(note).toHaveTextContent("chat.aiDisclosure.text");
  });

  it.each(["staff", "admin"] as const)("not on the internal %s assistant", (userRole) => {
    render(<AIChatWidget defaultOpen userRole={userRole} staffName="Sam" />);
    expect(screen.queryByTestId("ai-disclosure")).toBeNull();
  });

  it("the member pill opens the widget in a role that shows it", () => {
    // MemberChatButton does not pass userRole, so the widget's default applies — it must be one
    // that renders the notice.
    expect(read("src/components/chat/MemberChatButton.tsx")).not.toMatch(/userRole=/);
    expect(read("src/components/chat/AIChatWidget.tsx")).toMatch(/userRole = "public"/);
  });

  it.each([false, true])("InlineAIChat (memberContext=%s)", (memberContext) => {
    render(<InlineAIChat memberContext={memberContext} />);
    expect(screen.getByTestId("ai-disclosure")).toBeInTheDocument();
  });

  it("the personalised greetings say AI too", () => {
    const hook = read("src/hooks/useAIChat.ts");
    expect(hook).toMatch(/Soy Isabella, su asistente virtual de inteligencia artificial/);
    expect(hook).toMatch(/I'm Isabella, your ICE Alarm España artificial intelligence assistant/);
    expect(hook).toMatch(/asistente de soporte con inteligencia artificial/);
    expect(hook).toMatch(/I'm your AI staff support assistant/);
  });
});

describe("voice and prompts cannot lose it", () => {
  it("voice-handler appends the disclosure after the configurable greeting in all four branches", () => {
    const src = read("supabase/functions/voice-handler/index.ts");
    expect(src).toMatch(/import \{ VOICE_AI_DISCLOSURE \} from "\.\.\/_shared\/ai-disclosure\.ts";/);
    expect(src.match(/\$\{VOICE_AI_DISCLOSURE\.es\}/g)).toHaveLength(2);
    expect(src.match(/\$\{VOICE_AI_DISCLOSURE\.en\}/g)).toHaveLength(2);
    expect(src).toMatch(/getSetting\("voice_greeting_es", "[^"]*"\)\} \$\{VOICE_AI_DISCLOSURE\.es\}/);
    expect(src).toMatch(/getSetting\("voice_greeting_en", "[^"]*"\)\} \$\{VOICE_AI_DISCLOSURE\.en\}/);
    expect(src).not.toMatch(/Soy Isabel\./);
  });

  it("isabella-voice-handler's SOS greeting comes from the shared disclosure", () => {
    const src = read("supabase/functions/isabella-voice-handler/index.ts");
    expect(src).toMatch(/const greeting = sosVoiceGreeting\(lang, name\);/);
    expect(src).not.toMatch(/soy Isabella de ICE Alarm España\. Puedo ver su alerta/);
  });

  it("every user-facing system prompt in ai-run carries the identity rule", () => {
    const src = read("supabase/functions/ai-run/index.ts");
    const lines = src.split("\n").filter((l) => /system: systemPrompt \+/.test(l));
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l).toMatch(/systemPrompt \+ AI_IDENTITY_RULE \+/);
  });
});
