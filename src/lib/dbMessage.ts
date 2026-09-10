/**
 * THE DATABASE'S OWN SENTENCE, when there is one.
 *
 * `error instanceof Error` is FALSE for a PostgrestError: supabase-js returns a plain object
 * with `message`, `details`, `hint` and `code`. So the common
 * `error instanceof Error ? error.message : String(error)` renders "[object Object]" for
 * exactly the errors worth reading — including the guard trigger's
 * *"activation is the payment webhook's job — send them a payment link instead"*, which names
 * the remedy. A staff member who reads "[object Object]" goes looking for a bug that is not
 * there.
 */
export function dbMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
