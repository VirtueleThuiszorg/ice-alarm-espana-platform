import { FunctionsHttpError } from "@supabase/supabase-js";
import { extractFunctionErrorBody } from "@/lib/functionError";

/**
 * READING A REFUSAL FROM `public-submit`, on the two public forms that call it.
 *
 * `supabase.functions.invoke` turns every non-2xx into a thrown `FunctionsHttpError` whose
 * message is the literal "Edge Function returned a non-2xx status code". The part that matters —
 * WHICH FIELDS were wrong — is in the unread body on `error.context`. A form that cannot read it
 * can only say "something went wrong", which on a site read mostly by people in their seventies
 * and eighties is where they stop and ring instead, or do not.
 *
 * Shared by both forms rather than written twice: the second copy is always the one that is
 * missing a fix six months later, and this one has a test.
 */
export interface PublicSubmitRefusal {
  /** Field names the server objected to. Empty for a refusal that is not about a field. */
  fields: string[];
  /** 429 — several submissions in the last hour from this address or this email. */
  rateLimited: boolean;
}

export async function readPublicSubmitRefusal(error: unknown): Promise<PublicSubmitRefusal> {
  const rateLimited = error instanceof FunctionsHttpError && error.context?.status === 429;
  const body = await extractFunctionErrorBody(error);
  const raw = body?.fields;
  const fields = Array.isArray(raw)
    ? raw.filter((f): f is string => typeof f === "string" && f.length > 0)
    : [];
  return { fields, rateLimited };
}
