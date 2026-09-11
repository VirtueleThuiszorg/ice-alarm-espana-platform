import { describe, it, expect } from "vitest";
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
      as a flash of fallback text. Preloading the body weight and the heading
      weight removes that; preloading all fourteen would push 500 KB in front of
      the render and make the page slower, not faster.
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
