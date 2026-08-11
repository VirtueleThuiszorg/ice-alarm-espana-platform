import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.ts"],
    // Dummy Supabase env so modules that import the generated client at load time
    // (e.g. @/lib/crmEvents) don't throw "supabaseUrl is required" during tests.
    // These are non-secret placeholders; tests never hit a real backend.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Lets tests import the REAL edge-function schemas. The functions use Deno
      // specifiers; the repo pins the same zod version, so this maps them onto it
      // and client/server parity can be asserted by execution instead of by regex.
      "npm:zod@3.25.76": "zod",
    },
  },
});
