/**
 * Golden rule 6: "Isabella's hard-blocked tools are unreachable in code, not just discouraged
 * in the prompt: `update_user_role`, `manage_alert` escalate/resolve, `admit_resident`,
 * `discharge_resident`, `toggle_user_status`. SHE MAY READ, NEVER EXECUTE THESE."
 *
 * Red-line 7: "never triage/dismiss/resolve an SOS."
 *
 * WHAT WAS ALREADY COVERED, AND THE TWO HOLES IN IT.
 *
 * `isabellaAnthropic.test.ts` and `isabellaStreaming.test.ts` assert four of the five names are
 * absent from `ai-run` and `ai-execute-action`. Good, but:
 *
 *   1. `manage_alert` — the fifth name, and the one attached to the SOS path — IS NOT IN
 *      EITHER LIST. Rule 6 names five things; the suite checked four.
 *
 *   2. Absence of a NAME is not absence of a CAPABILITY. `not.toContain("manage_alert")` passes
 *      just as happily if a handler does the same job under another name. The rule is about
 *      what she can DO to an alert, so that is what these assert: the executor's reachable
 *      surface, and whether `alerts` is writable anywhere in it.
 *
 * THE POSTURE THIS PINS, which is the correct one and was undocumented:
 *
 *   ai-run             READS alerts (`.select`) to enrich context — rule 6 permits exactly this
 *   ai-execute-action  NEVER writes alerts. No insert, no update, no delete, no RPC.
 *
 * So Isabella can know an alert happened and can hand it to a human, and cannot resolve,
 * dismiss, escalate or otherwise change one. The distinction between those two is the whole of
 * rule 6, and until now nothing in the suite held it in place.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const EXECUTOR_PATH = "supabase/functions/ai-execute-action/index.ts";
const executor = read(EXECUTOR_PATH);
const aiRun = read("supabase/functions/ai-run/index.ts");

/**
 * Every action type the executor will dispatch. This is a RATCHET: adding a case without
 * adding it here fails the control below, so widening what Isabella can execute is a visible
 * act in a diff rather than a line nobody reviewed.
 */
const ALLOWED_ACTIONS = [
  "chat_reply",
  "draft_response",
  "escalate",
  "lead_create",
  "note_create",
  "request_human",
  "task_create",
  "ticket_create",
  "whatsapp_notify",
].sort();

const casesInExecutor = () =>
  [...executor.matchAll(/^\s*case\s+"([a-z_]+)":/gm)].map((m) => m[1]).sort();

describe("golden rule 6 — the fifth name", () => {
  it("`manage_alert` appears nowhere in Isabella's surface", () => {
    // The one rule 6 names that the existing suites never checked.
    expect(executor, "manage_alert must not be reachable in the executor").not.toContain(
      "manage_alert"
    );
    expect(aiRun, "manage_alert must not appear in ai-run").not.toContain("manage_alert");
  });
});

describe("red-line 7 — Isabella cannot change an alert", () => {
  it("the executor NEVER writes the alerts table — no insert, update, delete or upsert", () => {
    // The capability assertion, not the name assertion. Any write to `alerts` from the
    // executor would mean she can resolve or dismiss an SOS, whatever the action is called.
    const alertsWrite =
      /from\(\s*["']alerts["']\s*\)[\s\S]{0,200}?\.(insert|update|delete|upsert)\s*\(/;
    expect(
      alertsWrite.test(executor),
      "a write to `alerts` from the executor means Isabella can triage an SOS"
    ).toBe(false);
  });

  it("the executor does not reach alerts through an RPC either", () => {
    // The obvious way around the assertion above.
    const rpcs = [...executor.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
    const alertish = rpcs.filter((r) => /alert|escalat|resolv|dismiss|triage/.test(r));
    expect(alertish, `executor RPCs touching alerts: ${alertish.join(", ")}`).toEqual([]);
  });

  it("`escalate` escalates a CONVERSATION, not an alert — the distinction rule 6 turns on", () => {
    const block = executor.slice(
      executor.indexOf('case "escalate":'),
      executor.indexOf('case "lead_create":')
    );
    expect(block, "the escalate case was not found").toContain("conversation");
    expect(block, "escalate must not touch alerts").not.toContain('"alerts"');
    // Handing a conversation to a human is what red-line 7 REQUIRES ("always escalate
    // uncertainty to a human"), so this case is correct and must keep working.
    expect(block).toMatch(/status:\s*"escalated"/);
  });
});

describe("Isabella may READ an alert — rule 6 permits exactly that", () => {
  it("ai-run's alerts access is a select, so the read half is real and stays a read", () => {
    const block = aiRun.slice(aiRun.indexOf('permission === "alerts"'));
    const window = block.slice(0, 400);
    expect(window, "the alerts enrichment block was not found").toContain('from("alerts")');
    expect(window, "context enrichment must be a read").toMatch(/\.select\(/);
    expect(
      /\.(insert|update|delete|upsert)\s*\(/.test(window),
      "an alerts WRITE in ai-run would make her able to change what she is only allowed to see"
    ).toBe(false);
  });
});

describe("the executor is a closed allowlist", () => {
  it("dispatches exactly the known action types and no others", () => {
    expect(
      casesInExecutor(),
      "a case was added or removed: update ALLOWED_ACTIONS deliberately, so widening what "
        + "Isabella can execute is reviewed rather than inherited"
    ).toEqual(ALLOWED_ACTIONS);
  });

  it("an unknown action type THROWS rather than falling through silently", () => {
    expect(executor).toMatch(/default:\s*\n\s*throw new Error\(`Unknown action type/);
  });

  it("no allowed action is one of rule 6's hard blocks", () => {
    const blocked = ["update_user_role", "manage_alert", "admit_resident",
                     "discharge_resident", "toggle_user_status"];
    expect(ALLOWED_ACTIONS.filter((a) => blocked.includes(a))).toEqual([]);
  });

  it("and the run loop still filters actions through the agent's write permissions", () => {
    expect(aiRun).toMatch(/!writePermissions\.includes\(action\.action_type\)/);
  });
});
