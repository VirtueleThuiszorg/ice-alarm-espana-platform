/**
 * Isabella's ONLY model transport (Anthropic Messages API).
 *
 * Replaces the Lovable AI gateway (ai.gateway.lovable.dev) that ai-run
 * depended on — the golden-rule violation CLAUDE.md/STATE.md flagged for
 * migration, and a single point of failure that took the public chat widget
 * down when LOVABLE_API_KEY was unset (2026-07-24).
 *
 * Single-write-path: every model call in Isabella core goes through
 * isabellaComplete() — enforced by src/test/isabellaAnthropic.test.ts.
 * Tool execution is NOT here: actions still flow through ai-execute-action's
 * closed allowlist, unchanged by the transport swap.
 */
import Anthropic from "npm:@anthropic-ai/sdk";

/** Model is operator-configurable without a code change; Opus 4.8 default. */
export const ISABELLA_MODEL = Deno.env.get("ISABELLA_MODEL") || "claude-opus-4-8";

export function anthropicClient(): Anthropic {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey });
}

export function isRateLimitError(err: unknown): boolean {
  return err instanceof Anthropic.RateLimitError;
}

interface HistoryMessage {
  role: string;
  content: string;
}

/**
 * Convert the widget/voice conversation history to Anthropic turns:
 * - empty messages dropped (empty content is a 400)
 * - unknown roles coerced to "user"
 * - leading assistant turns dropped (the API requires the first message to be
 *   a user turn; the widget's static greeting carries no information)
 * - never returns an empty array
 */
export function toAnthropicTurns(
  history: HistoryMessage[],
  currentMessage?: string,
): Anthropic.MessageParam[] {
  const turns: Anthropic.MessageParam[] = [];
  for (const msg of history) {
    const content = (msg.content ?? "").trim();
    if (!content) continue;
    turns.push({ role: msg.role === "assistant" ? "assistant" : "user", content });
  }
  if (currentMessage && !history.some((m) => m.content === currentMessage)) {
    turns.push({ role: "user", content: currentMessage });
  }
  while (turns.length && turns[0].role === "assistant") turns.shift();
  if (turns.length === 0) turns.push({ role: "user", content: "Hello" });
  return turns;
}

export interface IsabellaCompletion {
  text: string;
  tokensUsed: number;
}

/**
 * One completion, no tools, no sampling params (removed on Opus 4.8 — a
 * temperature would 400). Thinking is intentionally omitted: Opus 4.8 runs
 * without thinking by default, which keeps chat/voice latency low.
 */
export async function isabellaComplete(opts: {
  system: string;
  turns: Anthropic.MessageParam[];
  maxTokens: number;
}): Promise<IsabellaCompletion> {
  const client = anthropicClient();
  const response = await client.messages.create({
    model: ISABELLA_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.turns,
  });
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  return {
    text,
    tokensUsed: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
  };
}
