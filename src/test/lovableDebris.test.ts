/**
 * Lovable-debris containment (goal item 2, 2026-07-24 audit).
 *
 * CLAUDE.md bans reintroducing Lovable. Isabella core is already migrated
 * (isabellaAnthropic.test.ts); this suite contains the REST of the surface:
 *
 *  - the dead `shelter-span.lovable.app` fallback URLs are gone from live
 *    functions (they routed partner-verification and member-update links to
 *    a dead site whenever origin/SITE_URL was unset);
 *  - CORS no longer trusts arbitrary *.lovable.app / *.lovableproject.com
 *    origins (nothing is hosted there anymore);
 *  - `outreach-followup-runner` (zero invokers anywhere) stays deleted;
 *  - every remaining Lovable-dependent function is PINNED by exact name.
 *    The pin shrinks as functions are archived/migrated (auth-email-hook
 *    migration + the growth-fn archive are their own PRs) and a NEW
 *    Lovable reference anywhere else fails immediately.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FN_DIR = join(ROOT, "supabase/functions");

// Functions still allowed to reference Lovable, pending Lee's archive/migrate
// decisions. Remove entries as their PRs land — a stale entry fails the suite.
const PINNED_LOVABLE_FNS = new Set([
  // auth-email-hook: MIGRATED 2026-07-24 (standardwebhooks + Gmail SMTP)
  // gateway growth fns — recommended ARCHIVE (report 2026-07-24):
  "facebook-publish",
  "generate-ai-image",
  "generate-slot-content",
  "media-draft",
  "outreach-enrich-lead",
  "outreach-generate-drafts",
  "outreach-topic-insights",
  "rate-outreach-leads",
  "repurpose-content",
]);

function lovableReferencingFns(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const fn of readdirSync(FN_DIR)) {
    const dir = join(FN_DIR, fn);
    if (!statSync(dir).isDirectory()) continue;
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|json)$/.test(name)) {
          // functional references only — drop comment lines so prose that merely
          // mentions the migration history (e.g. anthropic.ts's doc header) passes
          const src = readFileSync(p, "utf8")
            .split("\n")
            .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
            .join("\n");
          const hits = src.match(/@lovable\.dev\/[\w-]+|ai\.gateway\.lovable\.dev|[\w-]+\.lovable\.app|[\w-]+\.lovableproject\.com|LOVABLE_API_KEY/g);
          if (hits) found.set(fn, [...new Set([...(found.get(fn) ?? []), ...hits])]);
        }
      }
    };
    walk(dir);
  }
  return found;
}

describe("lovable debris — contained and shrinking", () => {
  const refs = lovableReferencingFns();

  it("no Lovable reference outside the pinned function list", () => {
    const unexpected = [...refs.keys()].filter((fn) => !PINNED_LOVABLE_FNS.has(fn));
    expect(
      unexpected.map((fn) => `${fn}: ${refs.get(fn)!.join(", ")}`),
      "new Lovable reference — CLAUDE.md bans reintroducing Lovable",
    ).toEqual([]);
  });

  it("the pin stays exact — archived/migrated functions must be removed from it", () => {
    const stale = [...PINNED_LOVABLE_FNS].filter((fn) => !refs.has(fn));
    expect(stale, "pinned fns with no Lovable reference left — delete from the pin").toEqual([]);
  });

  it("dead shelter-span fallbacks are gone from the live link-building functions", () => {
    for (const fn of ["partner-register", "send-member-update-request"]) {
      const src = readFileSync(join(FN_DIR, fn, "index.ts"), "utf8");
      expect(src, `${fn} must not fall back to a dead lovable.app URL`).not.toMatch(/lovable\.app/);
      expect(src).toMatch(/https:\/\/careconneqt\.es/);
    }
  });

  it("CORS trusts no Lovable-hosted origins", () => {
    const cors = readFileSync(join(FN_DIR, "_shared/cors.ts"), "utf8");
    expect(cors).not.toMatch(/lovable/i);
  });

  it("outreach-followup-runner (zero invokers) stays deleted, incl. its config entry", () => {
    expect(existsSync(join(FN_DIR, "outreach-followup-runner"))).toBe(false);
    const config = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
    expect(config).not.toMatch(/outreach-followup-runner/);
    // and nothing in the app invokes it
    const walk = (d: string, hits: string[] = []): string[] => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p, hits);
        else if (/\.(ts|tsx)$/.test(name) && readFileSync(p, "utf8").includes("outreach-followup-runner")) {
          hits.push(p.replace(ROOT + "/", ""));
        }
      }
      return hits;
    };
    expect(walk(join(ROOT, "src")).filter((p) => !p.startsWith("src/test/"))).toEqual([]);
  });
});
