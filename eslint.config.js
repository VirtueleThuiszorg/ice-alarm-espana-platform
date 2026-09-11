import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `render-worker` is a separate package (its own package.json / tsconfig / Dockerfile) and
  // must be linted by its own toolchain — the root config mis-parses its Remotion JSX-in-.ts.
  { ignores: ["dist", "render-worker"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
    },
  },
  /*
    THE EDGE FUNCTIONS ARE THE ONE PART OF THIS PLATFORM WITH NO COMPILE STEP.

    CI typechecks `tsconfig.app.json` and `tsconfig.node.json`; neither includes
    `supabase/functions/**`. So the code that talks to Stripe, Twilio and the payment webhook is
    never compiled by anything before it is deployed — and on 2026-09-11 that was not academic:
    `send-payment-link` read its settings off `supabase`, an identifier declared nowhere in the
    file (the client is called `admin`). In an ES module that is a ReferenceError the moment the
    line runs, so EVERY staff-sent payment link 500'd — after the pending order, payment and
    subscription rows had already been written.

    `typescript-eslint`'s recommended config switches `no-undef` OFF, and it is right to for code
    that tsc checks: the compiler says it better. For these files nothing says it at all, so it
    goes back on here, with Deno's globals declared so the rule is about real mistakes rather
    than about `Deno.env`.

    A full `deno check` is the better gate and is worth adding when Deno is in CI. This costs one
    config block and catches the class today.
  */
  {
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Deno: "readonly",
        EdgeRuntime: "readonly",
        /*
          DOM TYPE NAMES, not values. `no-undef` is a scope rule with no idea what a type
          position is, so `(v: HeadersInit)` reads to it as a reference to something undeclared.
          Three names rather than switching the rule off, because the rule is here for the
          VALUE case — the undefined client — and that is worth three lines. A `deno check`
          gate would make this list unnecessary; until there is one, a new DOM type used in an
          edge function joins it.
        */
        FormDataEntryValue: "readonly",
        RequestInit: "readonly",
        HeadersInit: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
    },
  },
);
