import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_TSX = path.resolve(__dirname, "../../src/App.tsx");

/**
 * Remove every `element={ ... }` prop from the source by brace-matching, so the
 * remaining `<Route path="..." />` / `<Route path="...">` / `</Route>` tokens can
 * be parsed without tripping over the `>` characters inside JSX element props.
 */
function stripElementProps(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf("element={", i);
    if (idx === -1) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, idx);
    // Walk from the opening brace, counting braces until balanced.
    let depth = 0;
    let j = idx + "element=".length; // points at '{'
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    i = j;
  }
  return out;
}

/**
 * Parse `src/App.tsx` and return the full set of declared route path patterns,
 * with nested (child) routes resolved to absolute paths. Patterns keep their
 * `:param` and `*` tokens (see {@link routeExists} for matching).
 */
export function getDeclaredRoutes(): string[] {
  const raw = fs.readFileSync(APP_TSX, "utf8");
  const src = stripElementProps(raw);
  const routes = new Set<string>();
  const stack: string[] = []; // prefixes of open parent routes

  const tokenRe = /<Route\b([^>]*?)(\/?)>|<\/Route>/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(src)) !== null) {
    if (m[0] === "</Route>") {
      stack.pop();
      continue;
    }
    const attrs = m[1] ?? "";
    const selfClosing = m[2] === "/";
    const prefix = stack.length ? stack[stack.length - 1] : "";
    const isIndex = /\bindex\b/.test(attrs);
    const pathMatch = /path="([^"]*)"/.exec(attrs);

    let full: string | undefined;
    if (isIndex) {
      full = prefix || "/";
    } else if (pathMatch) {
      const p = pathMatch[1];
      if (p.startsWith("/")) full = p;
      else full = `${prefix.replace(/\/$/, "")}/${p}`;
    }

    if (full) routes.add(normalize(full));

    if (!selfClosing) {
      // A parent (layout) route: its children resolve against this prefix.
      stack.push(full && !isIndex ? full : prefix);
    }
  }

  return [...routes].sort();
}

function normalize(p: string): string {
  if (p.length > 1 && p.endsWith("/")) return p.replace(/\/+$/, "");
  return p;
}

/** Turn a route pattern (`/blog/:slug`, `/r/:code`, `*`) into a matcher regex. */
function patternToRegex(pattern: string): RegExp {
  if (pattern === "*") return /^\/.*$/;
  const body = pattern
    .split("/")
    .map((seg) => {
      if (seg === "") return "";
      if (seg.startsWith(":")) return "[^/]+";
      if (seg === "*") return ".*";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${body}/?$`);
}

/**
 * Does an internal href resolve to a declared route? Query/hash are stripped
 * before matching. The catch-all `*` route is intentionally EXCLUDED — a link
 * that only matches `*` lands on the 404 page, which is a broken link.
 */
export function routeExists(href: string, declared: string[]): boolean {
  const clean = normalize(href.split("#")[0].split("?")[0]);
  if (clean === "") return false;
  return declared
    .filter((r) => r !== "*")
    .some((r) => patternToRegex(r).test(clean));
}
