/**
 * `supabase/functions/_shared/validation.ts` is a Deno module, and three files
 * under src/ import it so the browser and the edge functions validate against
 * exactly the same schemas — which is the right call, and worth keeping.
 *
 * Deno resolves `npm:zod@3.25.76`; the app's TypeScript project cannot, so it
 * reported the import as a missing module. This maps that specifier onto the
 * zod already installed in node_modules, so both runtimes typecheck against the
 * same library instead of the shared file being excluded from the app build.
 */
declare module "npm:zod@3.25.76" {
  export * from "zod";
}
