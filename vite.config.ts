import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
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
    // TODO: Hardcoded Supabase fallbacks are an anti-pattern — missing env vars
    // silently connect to the fallback instead of failing loud. Consider removing
    // these defaults so a missing .env is caught immediately at dev startup.
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL ?? "https://YOUR_SUPABASE_PROJECT_REF.supabase.co"
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
        "YOUR_SUPABASE_ANON_KEY"
    ),
  },
  build: {
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
          if (!id.includes("node_modules")) return undefined;
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
