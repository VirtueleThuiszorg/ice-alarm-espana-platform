// Centralized configuration constants for ICE Alarm España
// Replaces magic numbers and hardcoded strings scattered across the codebase

// ============================================================
//  Roles
// ============================================================

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CALL_CENTRE_SUPERVISOR: "call_centre_supervisor",
  CALL_CENTRE: "call_centre",
  PARTNER: "partner",
  MEMBER: "member",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Roles that have admin-level access */
export const ADMIN_ROLES: readonly Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

export function isAdminRole(role: string | null | undefined): boolean {
  return role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
}

// ============================================================
//  Timeouts & Intervals (milliseconds)
// ============================================================

export const TIMEOUTS = {
  /** Session inactivity timeout before auto-logout */
  SESSION_IDLE: 30 * 60 * 1000, // 30 minutes
  /** Warning shown before session expires */
  SESSION_WARNING: 5 * 60 * 1000, // 5 minutes
  /** Throttle for resetting session timer on user activity */
  ACTIVITY_THROTTLE: 30_000, // 30 seconds
  /** Max wait for role fetch on auth */
  ROLE_FETCH: 8_000, // 8 seconds
  /** AI chat conversation time-to-live */
  CHAT_CONVERSATION_TTL: 30 * 60 * 1000, // 30 minutes
  /** AI agent considered offline after this */
  AGENT_OFFLINE: 15_000, // 15 seconds
  /** Debounce for search inputs */
  SEARCH_DEBOUNCE: 300, // 300ms
  /** Delay before redirect (e.g. referral pages) */
  REDIRECT_DELAY: 2_000, // 2 seconds
  /** Delay before print dialog */
  PRINT_DELAY: 250, // 250ms
} as const;

export const INTERVALS = {
  /** Dashboard widget refresh */
  DASHBOARD_REFRESH: 30_000, // 30 seconds
  /** Device queue polling */
  DEVICE_QUEUE_REFRESH: 60_000, // 60 seconds
  /** Live clock update */
  CLOCK_TICK: 1_000, // 1 second
  /** Live visitors polling */
  LIVE_VISITORS: 10_000, // 10 seconds
} as const;

// ============================================================
//  React Query Cache Durations (staleTime)
// ============================================================

export const STALE_TIMES = {
  /** Near-real-time data (alerts, dashboards) */
  REALTIME: 30 * 1000, // 30 seconds
  /** Frequently updated data (messages, tasks) */
  SHORT: 1000 * 60, // 1 minute
  /** Standard data (members, partners) */
  MEDIUM: 1000 * 60 * 2, // 2 minutes
  /** Moderately static data (knowledge base, settings) */
  LONG: 1000 * 60 * 5, // 5 minutes
  /** Rarely changing data (pricing, company settings) */
  VERY_LONG: 1000 * 60 * 30, // 30 minutes
  /** Video render polling */
  FAST_POLL: 1000 * 5, // 5 seconds
} as const;

// ============================================================
//  Limits
// ============================================================

export const LIMITS = {
  /** Maximum emergency contacts per member */
  EMERGENCY_CONTACTS: 3,
  /** Max file upload size in bytes (50 MB) */
  FILE_UPLOAD_BYTES: 50 * 1024 * 1024,
  /** Max search query length */
  SEARCH_QUERY_LENGTH: 200,
  /** Default page size for paginated lists */
  DEFAULT_PAGE_SIZE: 10,
  /** Large page size for admin tables */
  LARGE_PAGE_SIZE: 25,
} as const;

// ============================================================
//  Validation
// ============================================================

export const VALIDATION = {
  BLOOD_TYPES: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const,
  /** Max lengths for common form fields */
  MAX_LENGTHS: {
    NAME: 100,
    EMAIL: 254,
    PHONE: 20,
    SHORT_TEXT: 200,
    NOTES: 500,
    LONG_TEXT: 1000,
    EXCERPT: 150,
  },
} as const;

// ============================================================
//  Document Categories
// ============================================================

export const DOC_CATEGORIES = [
  "all",
  "emergency",
  "device",
  "staff",
  "general",
  "member_guide",
  "partner",
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number];

// ============================================================
//  Date Range Presets
// ============================================================

export const DATE_RANGES = {
  WEEK: "7days",
  MONTH: "30days",
  QUARTER: "90days",
} as const;
