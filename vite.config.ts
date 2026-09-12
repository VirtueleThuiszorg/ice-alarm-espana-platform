import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Reads a required build-time env var, or aborts the build naming what is missing.
 * Replaces the old silent placeholder fallbacks (see the `define` block below).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The Supabase client cannot be built without it.\n` +
        `  Local dev : copy .env.example to .env and fill it in.\n` +
        `  CI        : set in .github/workflows/ci.yml.\n` +
        `  Vercel    : set in the project's Environment Variables.\n` +
        `This used to fall back to a placeholder host and fail silently at runtime.`
    );
  }
  return value;
}

// https://vitejs.dev/config/
/**
 * The primitives the EAGER shell reaches from main.tsx without crossing a
 * dynamic import. They are excluded from the merged `ui-primitives` chunk: a
 * merged chunk is only lazy if nothing eager touches it, and these do.
 *
 * Kept honest by `src/test/perf/chunkGraph.test.ts`, which re-derives the eager
 * set from the source and fails if this list has drifted — adding an eager
 * import of a primitive that is NOT here would silently move 48 files' worth of
 * JavaScript into the shell, which shows up as a number and not on screen.
 */
/**
 * Primitives that front a large third-party dependency. Excluded from the merged
 * `ui-primitives` chunk so the dependency stays behind the page that uses it.
 */
const HEAVY_UI = new Set([
  "calendar", // react-day-picker
  "carousel", // embla-carousel-react
  "chart", // recharts
  "command", // cmdk
  "drawer", // vaul
  "form", // react-hook-form
  "input-otp", // input-otp
  "resizable", // react-resizable-panels
]);

const EAGER_UI = new Set([
  "button",
  "dialog",
  "label",
  "logo",
  "page-loader",
  "route-announcer",
  "shell-icons",
  "skip-link",
  "sonner",
  "switch",
  "toast",
  "toaster",
  "tooltip",
]);

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Fail loud, never silent (GOALS.md G2). These used to fall back to unresolved
    // rebrand placeholders, so a missing .env produced a client pointed at a
    // non-existent host with no error at all — auth is a critical path and it
    // failed quietly. There is deliberately no default:
    // substituting the real project URL would be worse still, since a missing
    // .env would then silently connect a dev build to production.
    // CI supplies these in .github/workflows/ci.yml; Vercel must have them set.
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      requireEnv("VITE_SUPABASE_URL")
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY")
    ),
  },
  build: {
    // The manifest is what `scripts/perf/route-bundles.mjs` walks to total the JS
    // each route ships. Without it the per-route budget would have to be guessed
    // from file names, which stops being true the moment a chunk is renamed.
    // It is a ~40KB JSON file in dist/.vite/ and is never requested by the app.
    manifest: true,
    // Optimize chunk splitting for better caching
    rollupOptions: {
      output: {
        // Function form, NOT object form: the object form links every listed
        // vendor chunk into the entry's preload graph, so vendor-charts
        // (421KB of recharts) was modulepreloaded on EVERY page including
        // /login. The function only names a chunk when a module is actually
        // reached by an import — laziness is preserved and recharts now loads
        // only on pages that render charts.
        manualChunks(id: string) {
          /*
            THE LEAVES ARE THE REQUEST COUNT.

            Rollup code-splits a shared module by its SET of importers. Every
            lucide icon and every shadcn primitive has a different set, so the
            build emitted one chunk EACH: 386 chunks in dist, and a cold `/`
            fetched 65 JavaScript files — chevron-right.js, check.js, card.js,
            badge.js, one request apiece. On the mobile profile (150 ms RTT) that
            waterfall is most of the 43 -> 79 request rise in AFTER.md.

            Merging them is the fix, and the trap is that merging moves the whole
            merged chunk into whichever graph touches it FIRST. One eager import
            is enough: grouping lucide alone took the shell from 326.5 to 339.0 KB
            gz, because six icons across ErrorBoundary, CookieConsentBanner,
            PageLoader, toast, dialog and ProtectedRoute dragged all 96 KB of
            icons into the eager entry. Those six are now inline SVG
            (src/components/ui/shell-icons.tsx) and the eager graph imports no
            lucide at all.

            The same applies to the primitives, which is why EAGER_UI exists: 13
            of the 61 files in src/components/ui are reached from main.tsx
            without crossing a dynamic import. They stay where they are; the
            other 48 merge. Putting all 61 in one chunk pushed the shell to
            452.8 KB.
          */
          /*
            `cn()` IS THE HINGE. src/lib/utils.ts is imported by almost every
            component, eager and lazy alike. Left to Rollup it gets co-located
            with whichever chunk holds most of its importers — which is
            `ui-primitives` — and then ONE eager importer (LanguageSelectionModal)
            drags all 48 merged primitives into the shell. That is the same trap
            the vendor-utils line below was written for, arriving from the app
            side instead of node_modules. Pinning it beside the clsx/tailwind-merge
            it wraps keeps it in a chunk that is already eager and tiny.
          */
          if (/\/src\/lib\/utils\.tsx?$/.test(id)) return "vendor-utils";
          if (id.includes("/src/components/ui/")) {
            const name = id.split("/src/components/ui/")[1].replace(/\.tsx?$/, "");
            // A heavy wrapper stays on its own so it stays LAZY. `chart.tsx`
            // statically imports recharts; merged in, it pulled 96 KB gz of
            // vendor-charts onto every route that used any primitive at all —
            // public.pricing went from 24.0 to 147.5 KB page JS. These eight each
            // front a large dependency and belong with the page that wants them.
            if (HEAVY_UI.has(name)) return undefined;
            // NAMED, not `undefined`: leaving them to Rollup's automatic
            // placement let it co-locate them WITH `ui-primitives`, which put the
            // merged chunk back in the eager graph and the shell back at
            // 453.9 KB. Two explicit chunks keep the boundary where it is meant
            // to be — `ui-shell` eager and small, `ui-primitives` lazy.
            return EAGER_UI.has(name) ? "ui-shell" : "ui-primitives";
          }
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/lucide-react\//.test(id)) return "vendor-icons";
          // Small utils shared by BOTH the eager entry and recharts. Without
          // this line Rollup co-locates them inside vendor-charts, which drags
          // the whole 420KB chart chunk into the entry preload graph via cn()/clsx.
          if (/node_modules\/(clsx|class-variance-authority|tailwind-merge|lodash|react-is|prop-types|eventemitter3|tiny-invariant|fast-equals)\//.test(id)) return "vendor-utils";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          // use-sync-external-store is a React-family shim imported by BOTH
          // react-router-dom and react-i18next — it must live WITH react or the
          // two vendor chunks import each other (cycle → react undefined at
          // eval time → createContext crash on boot).
          // i18next lives WITH react: both are eager on every page (main.tsx
          // imports ./i18n) and separating them produced a chunk cycle
          // (react-i18next needs react; a shared rollup facade pointed the
          // other way) that crashed boot with "createContext of undefined".
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store|@remix-run)\//.test(id) || id.includes("i18next")) return "vendor-react";
          if (id.includes("@radix-ui")) return "vendor-ui";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("date-fns")) return "vendor-date";
          return undefined;
        },
      },
    },
    // Increase chunk size warning limit slightly
    chunkSizeWarningLimit: 600,
    // Enable source maps for production debugging
    sourcemap: mode === "development",
    // Minify for production
    minify: mode === "production" ? "esbuild" : false,
    // Target modern browsers for smaller bundles
    target: "es2020",
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "@supabase/supabase-js",
    ],
  },
}));
