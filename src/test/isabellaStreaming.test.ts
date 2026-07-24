/**
 * Isabella SSE streaming (launch-hardening item 1) — restores the streaming
 * UX lost in the Anthropic migration, WITHOUT touching the gates.
 *
 * Proof by execution where it counts: the widget-side SSE parser runs against
 * a mocked fetch stream (deltas accumulate, done reconciles, failure-before-
 * first-delta throws for fallback, mid-stream drop keeps the partial).
 * Server-side branches are locked by source contract.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { streamIsabellaChat, StreamUnavailableError } from "@/lib/isabellaChatStream";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── helpers: fake SSE response ───────────────────────────────────────────────
function sseResponse(frames: string[], { status = 200, contentType = "text/event-stream" } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": contentType } });
}

afterEach(() => vi.unstubAllGlobals());

describe("widget SSE parser — proof by execution", () => {
  const baseOpts = { agentKey: "customer_service_expert", context: { source: "chat_widget" } };

  it("accumulates deltas incrementally and resolves with the final response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      sseResponse([
        'data: {"delta":"Hola"}\n\n',
        'data: {"delta":", soy"}\n\ndata: {"delta":" Isabella"}\n\n',
        'data: {"done":true,"response":"Hola, soy Isabella"}\n\n',
      ]),
    ));
    const seen: string[] = [];
    const result = await streamIsabellaChat({ ...baseOpts, onDelta: (s) => seen.push(s) });
    expect(seen).toEqual(["Hola", "Hola, soy", "Hola, soy Isabella"]);
    expect(result).toBe("Hola, soy Isabella");
  });

  it("sends stream:true and the anon/apikey headers to /functions/v1/ai-run", async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: {"done":true,"response":"x"}\n\n', ""]));
    vi.stubGlobal("fetch", fetchMock);
    await streamIsabellaChat({ ...baseOpts, onDelta: () => {} }).catch(() => {});
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/functions\/v1\/ai-run$/);
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.context.stream).toBe(true);
    expect((init as RequestInit).headers).toHaveProperty("apikey");
  });

  it("throws StreamUnavailableError when the server errors BEFORE any delta (fallback trigger)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(['data: {"error":"stream_failed"}\n\n'])));
    await expect(
      streamIsabellaChat({ ...baseOpts, onDelta: () => {} }),
    ).rejects.toBeInstanceOf(StreamUnavailableError);
  });

  it("throws StreamUnavailableError on a non-stream response (e.g. older deployed fn)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } }),
    ));
    await expect(
      streamIsabellaChat({ ...baseOpts, onDelta: () => {} }),
    ).rejects.toBeInstanceOf(StreamUnavailableError);
  });

  it("keeps the PARTIAL when the stream errors after deltas (never double-answers)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      sseResponse(['data: {"delta":"Half an ans"}\n\n', 'data: {"error":"stream_failed"}\n\n']),
    ));
    const result = await streamIsabellaChat({ ...baseOpts, onDelta: () => {} });
    expect(result).toBe("Half an ans");
  });

  it("keeps the PARTIAL on a mid-stream network drop", async () => {
    const encoder = new TextEncoder();
    // pull-based so the delta chunk is DELIVERED before the error
    // (controller.error() inside start() would discard the queued chunk).
    let pullCount = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++;
        if (pullCount === 1) controller.enqueue(encoder.encode('data: {"delta":"partial text"}\n\n'));
        else controller.error(new Error("connection reset"));
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    ));
    const result = await streamIsabellaChat({ ...baseOpts, onDelta: () => {} });
    expect(result).toBe("partial text");
  });
});

describe("server contract (ai-run + transport)", () => {
  const aiRun = read("supabase/functions/ai-run/index.ts");
  const transport = read("supabase/functions/_shared/anthropic.ts");

  it("streaming is opt-in (context.stream === true) and SSE-typed; JSON default retained", () => {
    expect(aiRun).toMatch(/context\?\.stream === true/);
    expect(aiRun).toMatch(/"Content-Type": "text\/event-stream"/);
    // the three non-streaming isabellaComplete paths (chat fallback, voice, agent) survive
    expect((aiRun.match(/isabellaComplete\(\{/g) ?? []).length).toBe(3);
  });

  it("stream frames: delta, done+full response, error marker", () => {
    expect(aiRun).toMatch(/JSON\.stringify\(\{ delta: event\.delta\.text \}\)/);
    expect(aiRun).toMatch(/JSON\.stringify\(\{ done: true, response: full \}\)/);
    expect(aiRun).toMatch(/JSON\.stringify\(\{ error: "stream_failed" \}\)/);
  });

  it("transport: isabellaStream reuses the single client, same model contract", () => {
    expect(transport).toMatch(/export function isabellaStream/);
    expect(transport).toMatch(/client\.messages\.stream\(\{/);
    // still exactly ONE client construction site in the transport
    expect((transport.match(/new Anthropic\(/g) ?? []).length).toBe(1);
    expect(transport).not.toMatch(/\b(temperature|top_p|top_k)\s*:/);
  });

  it("gates untouched: isabella-gate / verification-gate / executor unchanged surface", () => {
    expect(aiRun).toMatch(/from "\.\.\/_shared\/isabella-gate\.ts"/);
    expect(aiRun).toMatch(/from "\.\.\/_shared\/verification-gate\.ts"/);
    const executor = read("supabase/functions/ai-execute-action/index.ts");
    for (const tool of ["update_user_role", "admit_resident", "discharge_resident", "toggle_user_status"]) {
      expect(executor).not.toContain(tool);
      expect(aiRun).not.toContain(tool);
    }
  });

  it("widget: streaming lib is the only /functions/v1/ai-run fetcher; invoke fallback kept", () => {
    const hook = read("src/hooks/useAIChat.ts");
    expect(hook).toMatch(/streamIsabellaChat\(\{/);
    expect(hook).toMatch(/supabase\.functions\.invoke\("ai-run"/); // fallback path
    expect(read("src/lib/isabellaChatStream.ts")).toMatch(/functions\/v1\/ai-run/);
  });
});
