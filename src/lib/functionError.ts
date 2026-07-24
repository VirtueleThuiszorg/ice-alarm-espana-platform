import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * `supabase.functions.invoke()` hides the function's real error: any non-2xx
 * response surfaces as the generic "Edge Function returned a non-2xx status
 * code", while the actual JSON body the function wrote (e.g.
 * `{"error":"A staff member with this email already exists"}`) sits unread
 * on `error.context` (the raw Response). This reads it, so "email already
 * exists", "only admins", a validation reject, and a 500 each show
 * distinctly on screen instead of all reading "something went wrong".
 *
 * Falls back to the error's own message, then to the caller's fallback —
 * never throws.
 */
export async function extractFunctionError(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === "string" && body.error) return body.error;
      if (typeof body?.message === "string" && body.message) return body.message;
    } catch {
      // body wasn't JSON or was already consumed — fall through
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
