import DOMPurify from "dompurify";

/**
 * Centralized input sanitization utilities.
 * Uses DOMPurify (already a project dependency) as the core engine.
 */

/** Sanitize HTML — strips dangerous tags/attributes, keeps safe formatting */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "b", "i", "em", "strong", "a", "p", "br", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre",
      "span", "div", "img", "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "class", "title"],
    ALLOW_DATA_ATTR: false,
  });
}

/** Strip ALL HTML — returns plain text only */
export function stripHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
}

/** Sanitize a plain text input (name, address, etc.) — removes HTML and trims */
export function sanitizeText(input: string): string {
  return stripHtml(input).trim();
}

/** Sanitize an email address */
export function sanitizeEmail(input: string): string {
  return input.trim().toLowerCase().replace(/[<>'"]/g, "");
}

/** Sanitize a phone number — keep digits, +, spaces, dashes, parens */
export function sanitizePhone(input: string): string {
  return input.replace(/[^\d+\-\s()]/g, "").trim();
}

/** Sanitize a URL */
export function sanitizeUrl(input: string): string {
  const cleaned = input.trim();
  // Only allow http(s) and relative URLs
  if (
    cleaned.startsWith("http://") ||
    cleaned.startsWith("https://") ||
    cleaned.startsWith("/")
  ) {
    return cleaned;
  }
  return "";
}

/** Sanitize user input for use in search queries */
export function sanitizeSearchQuery(input: string): string {
  // Remove special SQL/regex characters that could cause issues
  return input.replace(/[%_\\*?{}[\]()^$|]/g, "").trim().slice(0, 200);
}

/**
 * Sanitize an object of form values (shallow — for flat forms).
 * Applies sanitizeText to all string values.
 */
export function sanitizeFormValues<T extends Record<string, unknown>>(
  values: T
): T {
  const result = { ...values };
  for (const key in result) {
    const val = result[key];
    if (typeof val === "string") {
      (result as any)[key] = sanitizeText(val);
    }
  }
  return result;
}
