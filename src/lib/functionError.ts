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

      // Validation rejects from `_shared/validation.ts` are the important case and
      // the reason this needed extending: the body is
      //   { error: "Invalid request data", details: ["password: Invalid"] }
      // Returning `error` alone told a partner "Invalid request data", which names
      // neither the field nor the rule. `details` is where the answer lives, so it
      // is appended — a user who trips the password rule sees the password rule.
      const details = extractDetails(body);
      if (details.length > 0) {
        const headline = typeof body?.error === "string" && body.error ? body.error : fallback;
        return `${headline}: ${details.join("; ")}`;
      }

      if (typeof body?.error === "string" && body.error) return body.error;
      if (typeof body?.message === "string" && body.message) return body.message;
    } catch {
      // body wasn't JSON or was already consumed — fall through
    }

    // Deliberately NOT falling back to error.message here. For a
    // FunctionsHttpError that message is always the literal "Edge Function
    // returned a non-2xx status code", which is the very string this helper
    // exists to keep off the screen. The caller's fallback is worse than the
    // server's reason but strictly better than that.
    return fallback;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * The same thing, pre-wrapped as an `Error` so a call site can stay one line:
 *
 *   const { data, error } = await supabase.functions.invoke("x", { body });
 *   if (error) throw await functionError(error, "Could not do the thing");
 *
 * The surrounding catch block then shows the server's reason, because that is
 * what ends up in `.message`. Prefer this at invoke sites; `throw error` on its
 * own discards the body and leaves the user with supabase-js's generic string.
 */
export async function functionError(
  error: unknown,
  fallback = "Request failed",
): Promise<Error> {
  return new Error(await extractFunctionError(error, fallback));
}

/** Normalises the `details` field, which may be a string[] or a single string. */
function extractDetails(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const details = (body as Record<string, unknown>).details;

  if (typeof details === "string" && details.trim()) return [details.trim()];
  if (Array.isArray(details)) {
    return details.filter((d): d is string => typeof d === "string" && d.trim().length > 0);
  }
  return [];
}
