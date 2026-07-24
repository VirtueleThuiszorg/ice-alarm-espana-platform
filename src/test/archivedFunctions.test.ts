/**
 * Growth-fn archive (goal item 2 execution, 2026-07-24 report).
 *
 * The 9 Lovable-gateway growth/marketing functions plus their orchestrator
 * (outreach-pipeline-runner — no Lovable call itself, but it only fans out to
 * three archived fns) moved from supabase/functions/ to
 * archive/supabase-functions/. This suite pins that boundary:
 *
 *  - each archived fn exists in the archive and NOT in the deployable set;
 *  - config.toml carries no entry for any of them;
 *  - nothing in src/ invokes them (their UI entry points were removed with
 *    them — a resurrected invoke without moving the fn back fails here);
 *  - the surviving neighbours (publish-scheduled, outreach-send-email,
 *    generate-content-plan, facebook-metrics/unpublish) stay deployable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FN_DIR = join(ROOT, "supabase/functions");
const ARCHIVE_DIR = join(ROOT, "archive/supabase-functions");

const ARCHIVED = [
  "facebook-publish",
  "generate-ai-image",
  "generate-slot-content",
  "media-draft",
  "outreach-enrich-lead",
  "outreach-generate-drafts",
  "outreach-topic-insights",
  "rate-outreach-leads",
  "repurpose-content",
  "outreach-pipeline-runner",
];

const SURVIVORS = [
  "publish-scheduled",
  "outreach-send-email",
  "generate-content-plan",
  "facebook-metrics",
  "facebook-unpublish",
];

function srcFilesReferencing(needle: RegExp): string[] {
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && needle.test(readFileSync(p, "utf8"))) {
        hits.push(p.replace(ROOT + "/", ""));
      }
    }
  };
  walk(join(ROOT, "src"));
  return hits.filter((p) => !p.startsWith("src/test/"));
}

describe("archived growth functions stay archived", () => {
  it("every archived fn is in archive/ and out of the deployable set", () => {
    for (const fn of ARCHIVED) {
      expect(existsSync(join(ARCHIVE_DIR, fn, "index.ts")), `${fn} must be archived`).toBe(true);
      expect(existsSync(join(FN_DIR, fn)), `${fn} must not be deployable`).toBe(false);
    }
  });

  it("config.toml has no entry for any archived fn", () => {
    const config = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
    for (const fn of ARCHIVED) {
      expect(config, `config.toml still registers ${fn}`).not.toContain(`[functions.${fn}]`);
    }
  });

  it("nothing in src/ invokes an archived fn", () => {
    const pattern = new RegExp(`functions\\.invoke\\(\\s*["'](${ARCHIVED.join("|")})["']`);
    expect(
      srcFilesReferencing(pattern),
      "UI invoking an archived function — move the fn back (git mv) and migrate it off Lovable instead",
    ).toEqual([]);
  });

  it("the archived hooks/components did not come back", () => {
    for (const dead of [
      "src/hooks/useMediaDraft.ts",
      "src/hooks/useAIImageGenerator.ts",
      "src/hooks/useLeadTopicInsights.ts",
      "src/hooks/useBrandedImageGenerator.ts",
      "src/components/admin/media/ReadyToPublishSection.tsx",
      "src/components/admin/media/RepurposeDialog.tsx",
      "src/components/admin/media/strategy/LeadInsightsCard.tsx",
    ]) {
      expect(existsSync(join(ROOT, dead)), `${dead} was archived with its function`).toBe(false);
    }
  });

  it("surviving neighbour functions remain deployable", () => {
    for (const fn of SURVIVORS) {
      expect(existsSync(join(FN_DIR, fn, "index.ts")), `${fn} must stay deployable`).toBe(true);
    }
  });
});
