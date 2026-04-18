const ALLOWED_ORIGINS = [
  "https://icealarm.es",
  "https://www.icealarm.es",
  "https://icealarmespana.com",
  "https://www.icealarmespana.com",
];

// Patterns for dynamic origins (Loveable, Vercel previews, local dev)
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[\w-]+\.lovableproject\.com$/,
  /^https:\/\/[\w-]+\.lovable\.app$/,
  /^https:\/\/[\w-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin));
}

export function getCorsHeaders(
  req: Request,
  extraHeaders?: string
): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  const baseHeaders =
    "authorization, x-client-info, apikey, content-type";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": extraHeaders
      ? `${baseHeaders}, ${extraHeaders}`
      : baseHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
