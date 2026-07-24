/**
 * Streaming client for the Isabella chat widget — the ONLY place that talks
 * to ai-run's SSE mode (single-write-path, test-enforced).
 *
 * Contract with ai-run (supabase/functions/ai-run, context.stream === true):
 *   data: {"delta":"..."}            — incremental text
 *   data: {"done":true,"response"}   — final frame with the full text
 *   data: {"error":"stream_failed"}  — server-side stream failure
 *
 * Failure semantics, chosen so the widget never double-answers:
 *  - failure BEFORE any delta  → throws StreamUnavailableError; the caller
 *    falls back to the non-streaming invoke path (one answer, just slower)
 *  - failure AFTER deltas      → resolves with the partial text (the user
 *    already saw it; re-running would produce a second, different answer)
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export class StreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamUnavailableError";
  }
}

export async function streamIsabellaChat(opts: {
  agentKey: string;
  context: Record<string, unknown>;
  accessToken?: string | null;
  onDelta: (fullSoFar: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${opts.accessToken || SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      agentKey: opts.agentKey,
      context: { ...opts.context, stream: true },
    }),
    signal: opts.signal,
  }).catch((e) => {
    throw new StreamUnavailableError(`fetch failed: ${e instanceof Error ? e.message : "network"}`);
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/event-stream") || !response.body) {
    throw new StreamUnavailableError(`no stream (status ${response.status}, type ${contentType})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let sawDelta = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        let payload: { delta?: string; done?: boolean; response?: string; error?: string };
        try {
          payload = JSON.parse(dataLine.slice(6));
        } catch {
          continue;
        }
        if (payload.error) {
          if (!sawDelta) throw new StreamUnavailableError(payload.error);
          return full; // partial — the user already saw it
        }
        if (typeof payload.delta === "string") {
          sawDelta = true;
          full += payload.delta;
          opts.onDelta(full);
        }
        if (payload.done) {
          return payload.response ?? full;
        }
      }
    }
  } catch (e) {
    if (e instanceof StreamUnavailableError) throw e;
    if (!sawDelta) {
      throw new StreamUnavailableError(e instanceof Error ? e.message : "stream read failed");
    }
    return full; // mid-stream network drop — keep the partial
  }

  if (!sawDelta) throw new StreamUnavailableError("stream ended without content");
  return full;
}
