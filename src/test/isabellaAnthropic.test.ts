/**
 * Isabella → Anthropic API migration (the owed HIGH-PRIORITY item in STATE.md;
 * CLAUDE.md forbids the Lovable gateway).
 *
 * Locks, at the source-contract level:
 *  1. ai-run has ZERO Lovable-gateway dependency (no host, no key, no
 *     OpenAI-shape parsing) and every model call goes through the single
 *     transport module (_shared/anthropic.ts).
 *  2. The transport is Opus 4.8 by default (ISABELLA_MODEL env override),
 *     sends NO sampling params (temperature 400s on Opus 4.8), and
 *     normalizes history so the first turn is always a user turn.
 *  3. The safety surface is byte-identical: Isabella gate + verification
 *     gate still imported and applied; hard-blocked tools still absent;
 *     ai-execute-action's closed allowlist untouched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const aiRun = read("supabase/functions/ai-run/index.ts");
const transport = read("supabase/functions/_shared/anthropic.ts");

describe("1 — Lovable gateway fully removed from Isabella core", () => {
  it("ai-run contains no gateway host, no LOVABLE_API_KEY, no OpenAI response shape", () => {
    expect(aiRun).not.toMatch(/ai\.gateway\.lovable\.dev/);
    expect(aiRun).not.toMatch(/LOVABLE_API_KEY/);
    expect(aiRun).not.toMatch(/choices\?\.\[0\]/);
    expect(aiRun).not.toMatch(/gemini/i);
  });

  it("ai-run requires ANTHROPIC_API_KEY and fails fast without it", () => {
    expect(aiRun).toMatch(/ANTHROPIC_API_KEY is not configured/);
  });

  it("all three call paths use the shared transport", () => {
    expect(aiRun).toMatch(/from "\.\.\/_shared\/anthropic\.ts"/);
    const calls = aiRun.match(/isabellaComplete\(\{/g) ?? [];
    expect(calls.length, "chat + voice + agent paths").toBe(3);
    // and the run record logs the real model, not a hardcoded gemini string
    expect(aiRun).toMatch(/model_used: ISABELLA_MODEL/);
  });

  it("INVARIANT: no direct Anthropic client/api usage outside _shared/anthropic.ts", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) {
          const rel = p.replace(ROOT + "/", "");
          if (rel === "supabase/functions/_shared/anthropic.ts") continue;
          const src = readFileSync(p, "utf8");
          if (/npm:@anthropic-ai\/sdk|api\.anthropic\.com/.test(src)) offenders.push(rel);
        }
      }
    };
    walk(join(ROOT, "supabase/functions"));
    expect(offenders).toEqual([]);
  });
});

describe("2 — transport contract (Opus 4.8, no sampling params, safe turns)", () => {
  it("defaults to claude-opus-4-8 with ISABELLA_MODEL env override", () => {
    expect(transport).toMatch(/Deno\.env\.get\("ISABELLA_MODEL"\) \|\| "claude-opus-4-8"/);
  });

  it("sends no sampling parameters (temperature/top_p/top_k are 400s on Opus 4.8)", () => {
    expect(transport).not.toMatch(/\b(temperature|top_p|top_k)\s*:/);
    expect(aiRun).not.toMatch(/\btemperature\s*:/);
  });

  it("history normalization: empties dropped, leading assistant turns dropped, never empty", () => {
    expect(transport).toMatch(/if \(!content\) continue/);
    expect(transport).toMatch(/while \(turns\.length && turns\[0\]\.role === "assistant"\) turns\.shift\(\)/);
    expect(transport).toMatch(/if \(turns\.length === 0\) turns\.push\(\{ role: "user", content: "Hello" \}\)/);
  });

  it("uses the official SDK via npm specifier, single client construction", () => {
    expect(transport).toMatch(/import Anthropic from "npm:@anthropic-ai\/sdk"/);
    expect((transport.match(/new Anthropic\(/g) ?? []).length).toBe(1);
  });
});

describe("3 — safety surface unchanged by the transport swap", () => {
  it("Isabella gate + verification gate still imported and applied in ai-run", () => {
    expect(aiRun).toMatch(/from "\.\.\/_shared\/isabella-gate\.ts"/);
    expect(aiRun).toMatch(/from "\.\.\/_shared\/verification-gate\.ts"/);
    expect(aiRun).toMatch(/verificationDirective\(verificationDecision\)/);
    expect(aiRun).toMatch(/applyEscalation\(responseContent, verificationDecision\.forceEscalate\)/);
  });

  it("prompt red-lines survive verbatim", () => {
    expect(aiRun).toMatch(/NEVER request identity verification \(Name, Date of Birth, NIE\)/);
    expect(aiRun).toMatch(/never invent or guess names/);
    expect(aiRun).toMatch(/Outbound calls must NEVER request Name, Date of Birth, or NIE\./);
  });

  it("hard-blocked tools remain unreachable: absent from ai-run and ai-execute-action", () => {
    const executor = read("supabase/functions/ai-execute-action/index.ts");
    for (const tool of [
      "update_user_role",
      "admit_resident",
      "discharge_resident",
      "toggle_user_status",
    ]) {
      expect(aiRun, `${tool} must not appear in ai-run`).not.toContain(tool);
      expect(executor, `${tool} must not appear in ai-execute-action`).not.toContain(tool);
    }
    // executor keeps its closed-allowlist shape (default: throw)
    expect(executor).toMatch(/default:/);
  });

  it("action permissions still filter through writePermissions before insert", () => {
    expect(aiRun).toMatch(/!writePermissions\.includes\(action\.action_type\)/);
  });
});
