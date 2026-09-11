import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * THE WEBFONTS NEVER LOADED IN PRODUCTION, and the fix is also a speed-up.
 *
 * `index.html` carried a render-blocking `<link>` to fonts.googleapis.com plus
 * two preconnects. This site's own Content-Security-Policy (vercel.json) allows:
 *
 *     style-src 'self' 'unsafe-inline'
 *     font-src  'self' data:
 *
 * Neither permits fonts.googleapis.com or fonts.gstatic.com. The browser was
 * therefore told to open connections to two third parties and then fetch a
 * stylesheet it was forbidden to apply — so every page has been rendering in the
 * system fallback while still paying for the round trips, and on a network where
 * Google is slow or blocked it paid for them twice over.
 *
 * The faces are now served from this origin. That makes them load at all, removes
 * two DNS lookups and two TLS handshakes from the cold first visit, and puts the
 * bytes behind the site's own cache headers.
 */

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** HTML with comments stripped — the comment explaining the removal names the host. */
const INDEX_HTML = read("index.html").replace(/<!--[\s\S]*?-->/g, "");
const FONT_CSS = read("src/styles/fonts.css");
const VERCEL = read("vercel.json");
const FONT_DIR = path.join(ROOT, "public/fonts");

describe("no third party stands between a visitor and the first paint", () => {
  it("index.html does not link or preconnect to Google Fonts", () => {
    expect(INDEX_HTML).not.toContain("fonts.googleapis.com");
    expect(INDEX_HTML).not.toContain("fonts.gstatic.com");
  });

  it("and the CSP still would not have allowed it, which is why it never worked", () => {
    // Asserted so the finding cannot be quietly reversed by "adding the fonts
    // back": putting the <link> in again without also widening the CSP restores
    // a stylesheet the browser refuses, and widening the CSP is a decision that
    // should be argued for rather than made to fix a font.
    const csp = /"Content-Security-Policy",\s*"value":\s*"([^"]+)"/.exec(VERCEL)?.[1] ?? "";
    expect(csp, "no CSP found in vercel.json").not.toBe("");
    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toContain("fonts.gstatic.com");
    expect(csp).not.toContain("fonts.googleapis.com");
  });
});

describe("the self-hosted faces", () => {
  const files = fs.existsSync(FONT_DIR)
    ? fs.readdirSync(FONT_DIR).filter((f) => f.endsWith(".woff2"))
    : [];

  it("are actually committed, or the site has no fonts at all", () => {
    expect(files.length, "public/fonts holds no woff2 files").toBeGreaterThan(0);
  });

  it("are woff2 only — the ttf fallback is roughly twice the bytes", () => {
    const all = fs.readdirSync(FONT_DIR);
    expect(all.filter((f) => !f.endsWith(".woff2"))).toEqual([]);
  });

  it("cover only latin and latin-ext, the scripts this product reads in", () => {
    // en, es and nl are all latin script; latin-ext carries the accented
    // characters Spanish names and places need. Cyrillic, Greek and Vietnamese
    // were 19 of the 33 faces Google served and none of them is ever rendered.
    for (const file of files) {
      expect(file, `${file} is a subset this product does not use`).toMatch(
        /-(latin|latin-ext)\.woff2$/,
      );
    }
  });

  it("are every face the stylesheet references, and no more", () => {
    const referenced = [...FONT_CSS.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
    expect(new Set(referenced)).toEqual(new Set(files));
  });

  it("HOLD NO TWO FILES WITH THE SAME BYTES — the defect this replaced", () => {
    /*
      The first self-hosting pass asked Google for `wght@500;600;700;800` and
      wrote one file per weight. Both families are VARIABLE, and Google answers
      every weight of a variable family with THE SAME variable file — so
      archivo-500, archivo-600, archivo-700 and archivo-800 were four names for
      one set of bytes, as were the three Source Sans weights.

      Nothing looked wrong: the CSS was valid, the weights rendered correctly and
      the files were each a reasonable size. What it cost was invisible until it
      was measured — a page rendered three heading weights and three body
      weights, so it downloaded SIX files, 190 KB, for 64 KB of distinct content.
      On the mobile profile that was ~800 ms of largest-contentful-paint.

      A duplicate here is always a mistake, and it is one a reviewer cannot see.
      This is the assertion that sees it.
    */
    const byDigest = new Map<string, string[]>();
    for (const file of files) {
      const digest = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(FONT_DIR, file)))
        .digest("hex");
      byDigest.set(digest, [...(byDigest.get(digest) ?? []), file]);
    }
    const duplicated = [...byDigest.values()].filter((group) => group.length > 1);
    expect(
      duplicated,
      `these files are byte-identical and every one of them is downloaded separately: ` +
        duplicated.map((g) => g.join(" = ")).join("; "),
    ).toEqual([]);
  });

  it("ship ONE file per family per subset, because the faces are variable", () => {
    // Four files: two families x {latin, latin-ext}. More than that means
    // per-weight files have crept back in.
    expect([...files].sort()).toEqual([
      "archivo-var-latin-ext.woff2",
      "archivo-var-latin.woff2",
      "source-sans-3-var-latin-ext.woff2",
      "source-sans-3-var-latin.woff2",
    ]);
  });

  it("declare a WEIGHT RANGE, or the browser synthesises the weights it is given", () => {
    // `font-weight: 100 900` is what tells the browser this single file can be
    // instantiated at any weight. A single number against a variable file pins it
    // and every other weight in the design gets faux-bolded by the rasteriser.
    const faces = FONT_CSS.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length).toBe(4);
    for (const face of faces) {
      expect(face, `not a variable range: ${face.slice(0, 120)}`).toMatch(
        /font-weight:\s*\d+\s+\d+;/,
      );
    }
  });

  it("cover every weight the design actually asks for", () => {
    // Tailwind classes in use today: font-normal 400, font-medium 500,
    // font-semibold 600, font-bold 700. All inside both declared ranges.
    const ranges = [...FONT_CSS.matchAll(/font-weight:\s*(\d+)\s+(\d+);/g)].map(
      (m) => [Number(m[1]), Number(m[2])] as const,
    );
    expect(ranges.length).toBe(4);
    for (const [low, high] of ranges) {
      for (const used of [400, 500, 600, 700]) {
        expect(low, `weight ${used} is below the declared range`).toBeLessThanOrEqual(used);
        expect(high, `weight ${used} is above the declared range`).toBeGreaterThanOrEqual(used);
      }
    }
  });
});

describe("src/styles/fonts.css", () => {
  it("declares font-display: swap on every face", () => {
    /*
      SWAP, NOT BLOCK. With `block` the text is INVISIBLE until the font arrives.
      For a product read by people with failing eyesight, and on the page where
      somebody may be looking for an emergency number, a readable fallback that
      reflows is the better trade every time.
    */
    const faces = FONT_CSS.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(face).toContain("font-display: swap");
    }
  });

  it("keeps unicode-range, so a page only fetches the subsets it renders", () => {
    // Without it the browser downloads every subset of every weight it uses.
    const faces = FONT_CSS.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    for (const face of faces) {
      expect(face).toContain("unicode-range:");
    }
  });

  it("names the two families the design system actually asks for", () => {
    const css = read("src/index.css");
    expect(css).toContain("'Source Sans 3'");
    expect(css).toContain("'Archivo'");
    expect(FONT_CSS).toContain("font-family: 'Source Sans 3'");
    expect(FONT_CSS).toContain("font-family: 'Archivo'");
  });

  it("is imported before the design system that uses it", () => {
    const main = read("src/main.tsx");
    expect(main).toContain('import "./styles/fonts.css"');
    expect(main.indexOf('import "./styles/fonts.css"')).toBeLessThan(
      main.indexOf('import "./index.css"'),
    );
  });
});

describe("what index.html preloads", () => {
  it("preloads the two faces above the fold, and only those", () => {
    /*
      A self-hosted @font-face is still only DISCOVERED once the CSS referencing
      it has parsed — one round trip too late on a slow connection, which shows
      as a flash of fallback text. Preloading the two latin faces removes that,
      and with variable fonts those two cover every weight on the page. The
      latin-ext pair is deliberately NOT preloaded: unicode-range fetches it only
      for a page that renders a character in that range, and preloading it would
      put 65 KB in front of the render for most visitors who never need it.
    */
    const preloads = [...INDEX_HTML.matchAll(/rel="preload"[^>]*href="(\/fonts\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(preloads).toHaveLength(2);
    for (const href of preloads) {
      expect(fs.existsSync(path.join(ROOT, "public", href)), `${href} is preloaded but absent`).toBe(
        true,
      );
    }
  });

  it("preloads them with crossorigin, or the browser fetches them TWICE", () => {
    // A font request is always CORS, even same-origin. A preload without the
    // attribute is a different cache entry from the one @font-face asks for, so
    // the file is downloaded twice and the preload has made things worse.
    const preloadTags = INDEX_HTML.match(/<link[^>]*rel="preload"[^>]*>/g) ?? [];
    for (const tag of preloadTags.filter((t) => t.includes("/fonts/"))) {
      expect(tag, `${tag} is missing crossorigin`).toContain("crossorigin");
      expect(tag).toContain('as="font"');
    }
  });
});

describe("the fonts are cached by the edge", () => {
  it("vercel.json gives /fonts a long cache", () => {
    const config = JSON.parse(VERCEL) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const rule = config.headers.find((h) => h.source.startsWith("/fonts"));
    expect(rule, "no cache rule for /fonts — every visit refetches 70 KB").toBeDefined();
    const cacheControl = rule!.headers.find((h) => h.key === "Cache-Control")!.value;
    expect(cacheControl).toContain("max-age=31536000");
    // NOT `immutable`: these filenames carry family/weight/subset, not a content
    // hash, so re-running the fetch script can change the bytes behind the same
    // name. `stale-while-revalidate` gives the same zero round trips in practice
    // while leaving a way to ship a correction.
    expect(cacheControl).not.toContain("immutable");
  });
});
