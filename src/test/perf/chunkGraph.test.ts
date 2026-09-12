import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "../helpers/stripComments";

/**
 * THE CHUNK BOUNDARIES, WHICH NOTHING ELSE CAN SEE.
 *
 * Rollup code-splits a shared module by its SET of importers. Every lucide icon
 * and every shadcn primitive has a different set, so the build emitted one chunk
 * EACH: 386 chunks in `dist`, and a cold `/` fetched 65 JavaScript files —
 * `chevron-right.js`, `check.js`, `card.js`, `badge.js`, one request apiece. On
 * the mobile profile (150 ms RTT) that waterfall is the 43 -> 79 request rise
 * AFTER.md recorded as the largest unexplained regression.
 *
 * Merging them is the fix. The trap is that a merged chunk lands in whichever
 * graph touches it FIRST, and ONE eager import is enough to move all of it:
 *
 *   - grouping lucide alone took the shell 326.5 -> 339.0 KB gz, because six
 *     icons across ErrorBoundary, CookieConsentBanner, PageLoader, toast, dialog
 *     and ProtectedRoute dragged all 96 KB of icons into the eager entry
 *   - grouping every primitive took it to 453.9 KB
 *   - and with `src/lib/utils.ts` left to Rollup, `cn()` alone was enough:
 *     LanguageSelectionModal imports it, Rollup had co-located it with
 *     `ui-primitives`, and all 48 merged primitives became eager again
 *
 * None of that is visible in a diff. The shell number moves; the screen does
 * not. These assertions are the only thing standing between this build and a
 * silent return to 386 chunks or a 450 KB shell.
 */

const ROOT = path.resolve(__dirname, "../../..");
const VITE_CONFIG = fs.readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");

/* ── the eager graph, re-derived from source ─────────────────────────────── */

function resolveSpec(spec: string, from: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, "src", spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Static specifiers only. `import(...)` is the lazy boundary — following it
 * would make every route look eager and the whole check meaningless, so dynamic
 * imports are blanked before matching rather than filtered afterwards.
 */
function staticSpecifiers(src: string): string[] {
  const cleaned = src.replace(/\bimport\s*\(/g, "DYNAMIC(");
  const out: string[] = [];
  for (const m of cleaned.matchAll(/\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)) {
    out.push(m[1]);
  }
  for (const m of cleaned.matchAll(/\bexport\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g)) {
    out.push(m[1]);
  }
  return out;
}

function eagerGraph(): Set<string> {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    let src: string;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch {
      return;
    }
    for (const spec of staticSpecifiers(src)) {
      const resolved = resolveSpec(spec, file);
      if (resolved) walk(resolved);
    }
  };
  walk(path.join(ROOT, "src/main.tsx"));
  return seen;
}

const EAGER = eagerGraph();

/** The set named in vite.config.ts, parsed back out of the config. */
function declaredSet(name: string): Set<string> {
  const block = new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(VITE_CONFIG);
  expect(block, `${name} is not declared in vite.config.ts`).not.toBeNull();
  return new Set([...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

describe("the eager shell stays free of the merged chunks", () => {
  it("imports no lucide icon, so vendor-icons can stay lazy", () => {
    /*
      Six inline SVGs in src/components/ui/shell-icons.tsx replace the only
      lucide usage the eager graph had. One `import { X } from "lucide-react"`
      anywhere in this set puts 96 KB of icons back in front of first paint.
    */
    const offenders = [...EAGER].filter((f) => /from ["']lucide-react["']/.test(fs.readFileSync(f, "utf8")));
    expect(
      offenders.map((f) => path.relative(ROOT, f)),
      "these load before first paint and would drag the whole merged icon chunk with them",
    ).toEqual([]);
  });

  it("EAGER_UI names exactly the primitives the shell actually reaches", () => {
    // Drift in either direction is a defect. A primitive that became eager but
    // is missing here gets merged into `ui-primitives` and takes 48 files into
    // the shell; one listed but no longer eager needlessly splits a file out.
    const reached = new Set(
      [...EAGER]
        .filter((f) => f.includes(`${path.sep}src${path.sep}components${path.sep}ui${path.sep}`))
        .map((f) => path.basename(f).replace(/\.tsx?$/, "")),
    );
    expect([...reached].sort()).toEqual([...declaredSet("EAGER_UI")].sort());
  });
});

describe("the merged chunks are declared", () => {
  it("lucide is one chunk, not one chunk per icon", () => {
    expect(VITE_CONFIG).toMatch(/lucide-react[\s\S]{0,40}return "vendor-icons"/);
  });

  it("the light primitives are one chunk", () => {
    expect(VITE_CONFIG).toContain('return EAGER_UI.has(name) ? "ui-shell" : "ui-primitives";');
  });

  it("cn() is pinned, because one eager importer of it moves everything", () => {
    // src/lib/utils.ts is imported almost everywhere. Left to Rollup it lands in
    // whichever chunk holds most of its importers — `ui-primitives` — and then a
    // single eager importer makes that chunk eager. This is the line that took
    // the shell from 453.9 back to 321.8 KB gz.
    expect(VITE_CONFIG).toMatch(/src\\\/lib\\\/utils[\s\S]{0,40}return "vendor-utils"/);
  });

  it("every HEAVY_UI entry really does front a big dependency", () => {
    /*
      `chart.tsx` statically imports recharts. Merged into `ui-primitives` it
      pulled 96 KB gz of vendor-charts onto every route that used ANY primitive —
      public.pricing went from 24.0 to 147.5 KB of page JS. Each name here is
      excluded from the merge for that reason, and the reason is checked rather
      than trusted: a file that no longer wraps a heavy dependency should rejoin
      the merged chunk.
    */
    const HEAVY = /from ["'](recharts|react-day-picker|cmdk|embla-carousel[^"']*|vaul|input-otp|react-resizable-panels|react-hook-form)["']/;
    for (const name of declaredSet("HEAVY_UI")) {
      const file = path.join(ROOT, "src/components/ui", `${name}.tsx`);
      expect(fs.existsSync(file), `HEAVY_UI names ${name}, which does not exist`).toBe(true);
      expect(
        HEAVY.test(fs.readFileSync(file, "utf8")),
        `${name} is excluded from the merged chunk but imports no heavy dependency`,
      ).toBe(true);
    }
  });

  it("no primitive that wraps a heavy dependency is missing from HEAVY_UI", () => {
    const HEAVY = /from ["'](recharts|react-day-picker|cmdk|embla-carousel[^"']*|vaul|input-otp|react-resizable-panels|react-hook-form)["']/;
    const dir = path.join(ROOT, "src/components/ui");
    const declared = declaredSet("HEAVY_UI");
    const missing = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => HEAVY.test(fs.readFileSync(path.join(dir, f), "utf8")))
      .map((f) => f.replace(/\.tsx$/, ""))
      .filter((name) => !declared.has(name));
    expect(missing, "these would drag their dependency onto every route that uses any primitive").toEqual([]);
  });
});

describe("the shell's inline icons", () => {
  const RAW = fs.readFileSync(path.join(ROOT, "src/components/ui/shell-icons.tsx"), "utf8");
  // COMMENTS STRIPPED. The header of that file explains at length why it exists
  // instead of importing lucide-react, and an absence check run over the prose
  // matches the explanation rather than the code. This repo has made that exact
  // mistake five times; src/test/helpers/stripComments.ts exists because of it.
  const SHELL_ICONS = stripComments(RAW);

  it("does not import lucide itself, which would defeat the whole point", () => {
    expect(SHELL_ICONS).not.toContain("lucide-react");
  });

  it("draws on lucide's own 24x24 grid, so nothing changes on screen", () => {
    expect(SHELL_ICONS).toContain('viewBox: "0 0 24 24"');
    expect(SHELL_ICONS).toContain("strokeWidth: 2");
    expect(SHELL_ICONS).toContain('stroke: "currentColor"');
  });

  it("stays small — it is a shim, not a second icon library", () => {
    const exported = [...SHELL_ICONS.matchAll(/export function (\w+)/g)].map((m) => m[1]);
    expect(exported.length).toBeLessThanOrEqual(10);
    expect(exported.length).toBeGreaterThan(0);
  });
});
