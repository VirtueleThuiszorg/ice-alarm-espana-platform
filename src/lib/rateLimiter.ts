/**
 * Simple client-side rate limiter using a sliding window.
 * Prevents excessive API calls from the browser.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

/**
 * Check if an action is rate limited.
 *
 * @param key   Unique identifier for the action (e.g. "send-message", "create-order")
 * @param limit Max number of calls allowed within the window
 * @param windowMs  Time window in milliseconds
 * @returns true if the action is allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    return false; // Rate limited
  }

  entry.timestamps.push(now);
  return true;
}

/**
 * Pre-configured rate limiters for common operations.
 */
export const rateLimits = {
  /** Form submissions: 5 per minute */
  formSubmit: (key: string) => checkRateLimit(`form:${key}`, 5, 60_000),

  /** API mutations (create/update/delete): 10 per minute */
  mutation: (key: string) => checkRateLimit(`mutation:${key}`, 10, 60_000),

  /** Search/autocomplete: 20 per minute */
  search: (key: string) => checkRateLimit(`search:${key}`, 20, 60_000),

  /** AI chat messages: 15 per minute */
  chat: () => checkRateLimit("chat", 15, 60_000),

  /** File uploads: 5 per 5 minutes */
  upload: () => checkRateLimit("upload", 5, 300_000),

  /** Auth attempts: 5 per 15 minutes */
  auth: () => checkRateLimit("auth", 5, 900_000),
};
