/**
 * i18n key-coverage harness (page-audit sweep, 2026-07-24).
 *
 * The bug class: a literal t("some.key") call with NO inline default renders
 * the raw dotted key on screen when the key is missing from a locale (i18next
 * returns the key itself, which is truthy — so `t("k") || "fallback"` never
 * falls back either; that anti-pattern hid the StaffLogin 2FA gate breakage).
 *
 * This suite statically extracts every no-default literal t() key from src/
 * and asserts it resolves in en, es, AND nl. Keys that are known-missing are
 * pinned in KNOWN_MISSING per remaining portal batch — each portal PR deletes
 * its section, and the pin must stay exact: a fixed key left in the pin fails
 * the suite, and a NEW unresolved key fails it immediately.
 *
 * Out of scope (deliberately): t("key", "default") / t("key", {...}) calls —
 * a missing key there renders the English default, which is an untranslated-
 * string issue, not a raw-key-on-screen issue (~700 keys, tracked separately).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

type Flat = Record<string, string>;
function flatten(obj: Record<string, unknown>, prefix = ""): Flat {
  const out: Flat = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

const LOCALES = ["en", "es", "nl"].map((l) => ({
  locale: l,
  table: flatten(JSON.parse(readFileSync(join(ROOT, `src/i18n/locales/${l}.json`), "utf8"))),
}));

// literal t("a.b.c") with nothing after the key — the raw-key-rendering class
const NO_DEFAULT_T = /(?<![a-zA-Z0-9_$])t\(\s*["'`]([a-zA-Z0-9_.]+)["'`]\s*\)/g;

// Remaining audit batches (one PR per portal deletes its section):
const KNOWN_MISSING = new Set([
  // — partner portal batch —
  "partner.commissions", "partner.commissionsDesc", "partner.pendingRelease",
  "partner.pendingReleaseDesc", "partner.approved", "partner.approvedDesc",
  "partner.totalPaid", "partner.lifetimeEarnings", "partner.commissionHistory",
  "partner.allCommissions", "partner.filterByStatus", "partner.allStatus",
  "partner.paid", "partner.noCommissions", "partner.noCommissionsDesc",
  "partner.triggerEvent", "partner.triggered", "partner.releaseDate",
  "partner.linkCopied", "partner.qrDownloaded", "partner.invalidFileType",
  "partner.fileTooLarge", "partner.fileUploaded", "partner.uploadError",
  "partner.fileDeleted", "partner.deleteError", "partner.notFound",
  "partner.marketingTools", "partner.yourReferralLink", "partner.referralLinkDescription",
  "partner.referralCode", "partner.yourQrCode", "partner.qrCodeDescription",
  "partner.downloadPng", "partner.print", "partner.presentations",
  "partner.presentationsDescription", "partner.uploadFile", "partner.copyLink",
  "partner.openFile", "partner.noPresentations", "partner.uploadHint",
  // — admin portal batch —
  "common.deleting", "common.selected", "mediaStrategy.approve",
  "videoHub.create.template", "aiChat.openChat",
]);

function collectSourceKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>(); // key -> files using it
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "test") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(name)) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(NO_DEFAULT_T)) {
          const key = m[1];
          if (!key.includes(".")) continue; // skip bare identifiers / non-i18n t()
          const rel = p.replace(ROOT + "/", "");
          const files = found.get(key) ?? [];
          if (!files.includes(rel)) files.push(rel);
          found.set(key, files);
        }
      }
    }
  };
  walk(join(ROOT, "src"));
  return found;
}

describe("i18n key coverage — no raw dotted keys can render", () => {
  const sourceKeys = collectSourceKeys();

  it("every no-default literal t() key resolves in en, es, and nl (or is pinned to a batch)", () => {
    const unresolved: string[] = [];
    for (const [key, files] of sourceKeys) {
      if (KNOWN_MISSING.has(key)) continue;
      const missingIn = LOCALES.filter(({ table }) => !(key in table)).map(({ locale }) => locale);
      if (missingIn.length) unresolved.push(`${key} (missing in ${missingIn.join(",")}; used by ${files.join(", ")})`);
    }
    expect(
      unresolved,
      `these t() keys render as raw dotted text — add them to en/es/nl or pin them to a portal batch:\n${unresolved.join("\n")}`,
    ).toEqual([]);
  });

  it("the KNOWN_MISSING pin stays exact — fixed keys must be removed from it", () => {
    const stale: string[] = [];
    for (const key of KNOWN_MISSING) {
      const stillUsed = sourceKeys.has(key);
      const stillMissing = LOCALES.some(({ table }) => !(key in table));
      if (!stillUsed || !stillMissing) stale.push(key);
    }
    expect(
      stale,
      `pinned keys that are fixed or no longer referenced — delete from KNOWN_MISSING: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("the anti-pattern t(...) || \"fallback\" stays dead (it never falls back — t() returns the key)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "test") continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(name)) {
          const src = readFileSync(p, "utf8");
          if (/(?<![a-zA-Z0-9_$])t\(\s*["'`][a-zA-Z0-9_.]+["'`]\s*\)\s*\|\|\s*["'`]/.test(src)) {
            offenders.push(p.replace(ROOT + "/", ""));
          }
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(
      offenders,
      `t("key") || "text" never falls back (t returns the key, which is truthy) — use t("key", "text") or add the key: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
