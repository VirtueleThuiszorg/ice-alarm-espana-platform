/**
 * Partners have ONE way in: full registration at `/partner/join`.
 *
 * The public site used to offer two mutually exclusive signup paths. `/partner`
 * rendered `PartnerOnboarding`, which called `partner-apply` and wrote an
 * application (`status='pending'`, no `user_id`, no credentials) that could never
 * become a login without admin action; `/partner/join` rendered `PartnerJoin`,
 * which called `partner-register` and produced a real account. The nav, the
 * landing CTA and the landing footer all pointed at the first one, and a partner
 * who followed the site as presented and then tried the second was refused with a
 * 409 on their own email (PARTNER_JOURNEY.md §6).
 *
 * Lee's decision: retire the application path from the public site. `/partner`
 * survives as a **permanent redirect** — external links, printed material and
 * search results point at it, so deleting the route would 404 them.
 *
 * These are deliberately negative where the negative is the sharper test: the
 * second entry point must not come back.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const app = read("src/App.tsx");

describe("/partner redirects to /partner/join", () => {
  it("the route still exists — external links must not 404", () => {
    expect(app).toMatch(/path="\/partner"/);
  });

  it("renders a redirect, not a page", () => {
    const route = app.match(/<Route path="\/partner"[\s\S]*?\/>/)?.[0] ?? "";
    expect(route, '<Route path="/partner"> not found').not.toBe("");
    expect(route).toMatch(/<Navigate to="\/partner\/join" replace \/>/);
  });

  it("replaces the history entry, so Back does not bounce off the redirect", () => {
    const route = app.match(/<Route path="\/partner"[\s\S]*?\/>/)?.[0] ?? "";
    expect(route).toMatch(/\breplace\b/);
  });

  it("the target route is registered", () => {
    expect(app).toMatch(/path="\/partner\/join"/);
  });

  it("is a real 308 for a cold hit, not only a client-side bounce", () => {
    // A visitor arriving from a search result gets index.html via the SPA rewrite
    // and never reaches the router's redirect as an HTTP status, so search engines
    // would keep the old URL indefinitely. Vercel applies redirects before
    // rewrites, so this one wins.
    const vercel = JSON.parse(read("vercel.json"));
    const hit = (vercel.redirects ?? []).find(
      (r: { source: string }) => r.source === "/partner"
    );
    expect(hit, "vercel.json must redirect /partner").toBeTruthy();
    expect(hit.destination).toBe("/partner/join");
    expect(hit.permanent, "must be permanent (308), not temporary").toBe(true);
  });

  it("the redirect does not swallow the routes below it", () => {
    // `source: "/partner"` is an exact match in Vercel; a wildcard here would
    // redirect /partner/join to itself and loop.
    const vercel = JSON.parse(read("vercel.json"));
    for (const r of vercel.redirects ?? []) {
      expect(r.source).not.toMatch(/^\/partner[/(*:]/);
    }
    for (const p of ["/partner/join", "/partner/login", "/partner/verify", "/partner/invite"]) {
      expect(app, `${p} must still be routed`).toContain(`path="${p}"`);
    }
  });
});

describe("every public link points at /partner/join", () => {
  it("the header nav", () => {
    expect(read("src/components/layout/PublicHeader.tsx")).toMatch(
      /to:\s*["']\/partner\/join["']/
    );
  });

  it("the landing partner CTA and the landing footer", () => {
    const landing = read("src/pages/LandingPage.tsx");
    expect(landing.match(/to="\/partner\/join"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("nothing in src/ links to /partner as a complete path any more", () => {
    // The whole defect was a link that looked right and led to the wrong product.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
        if (full.includes(`${path.sep}test${path.sep}`)) continue;
        const src = readFileSync(full, "utf8");
        // `to="/partner"` / `href="/partner"` / `to: "/partner"` — the complete
        // path only. `/partner/...` and `/partner-dashboard` are untouched.
        if (/(?:to|href)(?:=|:\s*)["']\/partner["']/.test(src)) offenders.push(full);
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(offenders, `these still link to /partner: ${offenders.join(", ")}`).toEqual([]);
  });

  it("robots.txt does not single out the retired path", () => {
    expect(read("public/robots.txt")).not.toMatch(/\/partner\b/);
  });
});

describe("the application path is absent from the public site", () => {
  it("the page is deleted", () => {
    expect(existsSync(path.resolve(process.cwd(), "src/pages/partner/PartnerOnboarding.tsx"))).toBe(
      false
    );
  });

  it("no route renders it and nothing imports it", () => {
    expect(app).not.toMatch(/PartnerOnboarding/);
  });

  it("nothing in the client invokes partner-apply", () => {
    // The function may stay deployed — production may hold pending applications and
    // the admin conversion path still reads them — but no public surface calls it.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
        if (full.includes(`${path.sep}test${path.sep}`)) continue;
        if (/functions\.invoke\(\s*["']partner-apply["']/.test(readFileSync(full, "utf8"))) {
          offenders.push(full);
        }
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(offenders, `still invoke partner-apply: ${offenders.join(", ")}`).toEqual([]);
  });

  it("its copy is gone from all three locales, so no dead translation is carried", () => {
    for (const loc of ["en", "es", "nl"]) {
      const dict = JSON.parse(read(`src/i18n/locales/${loc}.json`));
      expect(dict.partnerOnboarding, `${loc}: partnerOnboarding namespace`).toBeUndefined();
    }
  });

  it("but the ADMIN conversion path survives — production may hold pending rows", () => {
    // The brief is explicit: `ConvertApplicationDialog` and `partner_applications`
    // stay until Lee confirms `select count(*) from partner_applications where
    // status='pending'` is 0 (PENDING_FOR_LEE.md S6). Deleting them would strand
    // every application already taken.
    const root = process.cwd();
    expect(existsSync(path.resolve(root, "src/components/admin/ConvertApplicationDialog.tsx"))).toBe(
      true
    );
    expect(
      existsSync(path.resolve(root, "supabase/functions/partner-apply/index.ts")),
      "the function stays deployed; only the public caller is gone"
    ).toBe(true);
  });
});
