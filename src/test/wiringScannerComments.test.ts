// A SOURCE SCANNER THAT MISREADS A COMMENT CAN DELETE THE CODE AROUND IT.
//
// Both of this repo's comment strippers — the wiring register's
// (`scripts/wiring/inventory.mjs`) and the test helper's — ran their BLOCK pass first, on raw
// source. A `/*` inside a LINE comment therefore opened a block comment that was never meant to
// exist, and it paired with the next terminator anywhere below, blanking every line in between.
//
// THIS WAS LIVE, NOT THEORETICAL. `EV07BLiveStatusCard` has the comment
//
//     // Device admin routes (/admin/[*]) bounce non-admin operators to /unauthorized,
//
// and a doc block below it, so its TWO realtime subscriptions were invisible to the wiring
// scanner and absent from WIRING_REGISTER.md entirely — the register asserting that a control
// which exists does not. `DeviceOfflineAlertsCard` and `DeviceIssuesQueue` carry the same line
// and were spared only because nothing below them closed the phantom block; adding one ordinary
// explanatory comment to either made their subscriptions vanish, which is how this was found.
//
// The failure mode is the dangerous one: silent, and in the direction of claiming LESS exists
// than does.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** The wiring scanner's own stripper, lifted out of the script so it can be exercised here. */
function scannerStrip(src: string): string {
  const body = read("scripts/wiring/inventory.mjs");
  const m = body.match(/function stripComments\(src\) \{[\s\S]*?\n\}/);
  if (!m) throw new Error("stripComments not found in scripts/wiring/inventory.mjs");
  return new Function(`${m[0]}; return stripComments(arguments[0]);`)(src);
}

/** A file shaped exactly like the one that broke: phantom opener, then a real block comment. */
const TRAP = [
  "const a = 1;",
  "// Device admin routes (/admin/*) bounce non-admin operators to /unauthorized,",
  "// so only admins get the admin-navigating affordances.",
  "const wired = supabase.channel('x').on('postgres_changes', { table: 'alerts' }, noop);",
  "/* an ordinary explanatory comment, added later by somebody */",
  "const b = 2;",
].join("\n");

describe("the wiring scanner's comment stripper", () => {
  it("does not let a /* inside a line comment swallow the code below it", () => {
    const out = scannerStrip(TRAP);
    expect(out, "the subscription between the two comments was blanked").toContain("postgres_changes");
    expect(out).toContain("const wired");
    expect(out).toContain("const b = 2;");
  });

  it("still blanks what it is for — prose must not become a wire", () => {
    /*
      The reason this stripper exists: `functionError.ts` documents its own use with an
      `invoke("x")` in a doc comment, and a scanner that reads comments turns that into a wire
      the register would then be required to carry.
    */
    const out = scannerStrip([
      "/** docs that mention functions.invoke(\"phantom-fn\") */",
      "// and a line comment mentioning functions.invoke(\"phantom-two\")",
      "const real = supabase.functions.invoke('real-fn');",
    ].join("\n"));
    expect(out).not.toContain("phantom-fn");
    expect(out).not.toContain("phantom-two");
    expect(out).toContain("real-fn");
  });

  it("preserves line count, so reported line numbers still point at real code", () => {
    const src = ["a", "/* one", "   two */", "b"].join("\n");
    expect(scannerStrip(src).split("\n")).toHaveLength(4);
  });

  it("leaves a URL in a string alone — // is only a comment at the start of a line", () => {
    const src = 'const u = "https://example.com/a"; const v = supabase.rpc("real_rpc");';
    const out = scannerStrip(src);
    expect(out).toContain("https://example.com/a");
    expect(out).toContain("real_rpc");
  });
});

describe("the test helper's stripper has the same fix", () => {
  it("does not let a /* inside a line comment swallow the code below it", () => {
    const out = stripComments(TRAP);
    expect(out).toContain("postgres_changes");
    expect(out).toContain("const b = 2;");
  });

  it("still removes block and line comments", () => {
    expect(stripComments("/* gone */ const a = 1;")).not.toContain("gone");
    expect(stripComments("  // gone\nconst a = 1;")).not.toContain("gone");
  });
});

describe("the wires that were actually missing", () => {
  it("EV07BLiveStatusCard's two subscriptions are visible to the scanner again", () => {
    /*
      The concrete damage, asserted against the real file rather than a fixture. If the ordering
      regresses, these two go missing from WIRING_REGISTER.md again and nothing else notices.
    */
    const out = scannerStrip(read("src/components/call-centre/EV07BLiveStatusCard.tsx"));
    const tables = [...out.matchAll(/postgres_changes["'][\s\S]{0,200}?table:\s*["'](\w+)["']/g)]
      .map((m) => m[1])
      .sort();
    expect(tables).toEqual(["alerts", "devices"]);
  });

  it("and the register now counts them", () => {
    const reg = read("WIRING_REGISTER.md");
    // The row's site count includes the EV07B card; before the fix it was one lower.
    expect(reg).toMatch(/`channel:alerts`[\s\S]*?\| 8 \|/);
    expect(reg).toMatch(/`channel:devices`[\s\S]*?\| 6 \|/);
  });
});
