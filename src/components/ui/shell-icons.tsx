import type { SVGProps } from "react";

/**
 * THE SIX ICONS THE EAGER SHELL DRAWS, INLINE — so the merged lucide chunk can
 * stay lazy.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `lucide-react` ships one ES module per icon. Rollup code-splits a shared
 * module by its SET of importers, and every icon has a different set, so the
 * build emitted ONE CHUNK PER ICON: 386 chunks in `dist`, and a cold load of `/`
 * fetched 65 JavaScript files — `chevron-right.js`, `check.js`, `globe.js`,
 * `send.js`, one request each. On the mobile profile (150 ms RTT) that waterfall
 * is most of the 43 -> 79 request rise the AFTER table recorded.
 *
 * Merging them with `manualChunks` fixes the request count. On its own it also
 * moves the whole 96 KB icon chunk into the EAGER graph, because three modules
 * the shell always renders — ErrorBoundary, CookieConsentBanner, PageLoader —
 * import six icons between them. One import is enough: the shell grew 326.5 ->
 * 339.0 KB gz and two routes went over their ceiling.
 *
 * Six inline SVGs cost about 1 KB and buy back all of it. The path data is
 * copied from the installed `lucide-react@0.462.0` modules rather than redrawn,
 * so these are the same glyphs at the same 24x24 grid with the same stroke —
 * nothing changes on screen.
 *
 * ── WHAT KEEPS IT TRUE ──────────────────────────────────────────────────────
 *
 * `src/test/perf/shellIcons.test.ts` asserts that no module in the eager shell
 * imports `lucide-react`. Adding one back is what would silently undo this, and
 * it is not visible in review — the shell number moves, not the screen.
 *
 * This is NOT a general icon set. Everything outside the eager shell keeps
 * importing from `lucide-react`, where tree-shaking and the merged chunk do the
 * right thing. Adding icons here would be re-implementing lucide by hand.
 */

const BASE: SVGProps<SVGSVGElement> = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** lucide `triangle-alert` */
export function AlertTriangleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props} aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** lucide `refresh-cw` */
export function RefreshCwIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props} aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

/** lucide `cookie` */
export function CookieIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props} aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
      <path d="M8.5 8.5v.01" />
      <path d="M16 15.5v.01" />
      <path d="M12 12v.01" />
      <path d="M11 17v.01" />
      <path d="M7 14v.01" />
    </svg>
  );
}

/** lucide `settings` */
export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props} aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** lucide `shield` */
export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props} aria-hidden="true">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

/** lucide `x` */
export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props} aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** lucide `loader-circle` */
export function LoaderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
