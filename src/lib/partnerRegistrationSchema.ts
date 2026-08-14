import { z } from "zod";

/**
 * Client-side schema for partner registration (/partner/join).
 *
 * WHY THIS FILE EXISTS: the rules here must be at least as strict as
 * `supabase/functions/_shared/validation.ts` → `partnerRegisterSchema`. When they
 * drift, the server rejects a submission the form was happy with, and the partner
 * gets a server error instead of an inline message on the field.
 *
 * That is exactly what happened in production: the client checked only
 * `password.min(8)` while the server also required an uppercase letter, a
 * lowercase letter and a digit. "password" sailed through the form and came back
 * as `Validation failed: [ "password: Invalid" ]`.
 *
 * `src/test/partnerValidationParity.test.ts` imports BOTH this schema and the real
 * server schema and runs adversarial inputs through them, asserting the client
 * rejects everything the server would. It fails if the two ever diverge, so this
 * comment cannot rot into a lie.
 *
 * Every rule below carries a message, because the server's zod has none — its
 * failures read "Invalid", which is useless on a form.
 */

// ── mirrors of the server's reusable primitives ────────────────────────────

/** Server: `z.string().trim().min(1).max(100).regex(/^[a-zA-ZÀ-ÿ\s'-]+$/)` */
const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(100, `${label} must be 100 characters or fewer`)
    .regex(
      /^[a-zA-ZÀ-ÿ\s'-]+$/,
      `${label} may only contain letters, spaces, apostrophes and hyphens`
    );

/** Server: `z.string().trim().min(1).regex(/^\+?[0-9\s\-()]+$/).max(20)` */
const phone = z
  .string()
  .trim()
  .max(20, "Phone number must be 20 characters or fewer")
  .regex(
    /^\+?[0-9\s\-()]+$/,
    "Phone number may only contain digits, spaces, brackets, + and -"
  );

/**
 * Server: `z.string().min(8).max(100).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/)`
 * — the divergence that caused the production failure. Each rule gets its own
 * message so the partner is told which one they missed.
 */
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be 100 characters or fewer")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number");

/** An optional free-text field the server bounds. Empty string is allowed. */
const boundedOptional = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} must be ${max} characters or fewer`)
    .optional()
    .or(z.literal(""));

/** Server: `z.enum(["en", "es"])`. See PARTNER_JOURNEY.md on the missing `nl`. */
export const PARTNER_LANGUAGES = ["en", "es", "nl"] as const;

/** Server: the same nine values. */
export const PARTNER_TYPES = [
  "referral",
  "care",
  "residential",
  "pharmacy",
  "insurance",
  "healthcare_provider",
  "real_estate",
  "expat_community",
  "corporate_other",
] as const;

// ── the form schema ────────────────────────────────────────────────────────

export const partnerFormSchema = z
  .object({
    // Step 1
    partner_type: z.enum(PARTNER_TYPES),

    // Step 2
    contact_name: personName("Name"),
    last_name: z
      .string()
      .max(100, "Last name must be 100 characters or fewer")
      .optional()
      .or(z.literal("")),
    company_name: boundedOptional(200, "Company name"),
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .email("Please enter a valid email")
      .max(255, "Email must be 255 characters or fewer"),
    phone: phone.optional().or(z.literal("")),
    preferred_language: z.enum(PARTNER_LANGUAGES),

    // Step 3 (B2B)
    organization_type: boundedOptional(100, "Organization type"),
    organization_registration: boundedOptional(100, "Registration number"),
    organization_website: boundedOptional(500, "Website"),
    estimated_monthly_referrals: boundedOptional(50, "Estimated referrals"),
    facility_address: boundedOptional(500, "Facility address"),
    facility_resident_count: z
      .number()
      .int("Resident count must be a whole number")
      .min(0, "Resident count cannot be negative")
      .max(10000, "Resident count must be 10000 or fewer")
      .optional(),

    // Step 3b
    region: boundedOptional(100, "Region"),
    how_heard_about_us: boundedOptional(100, "This field"),
    motivation: boundedOptional(1000, "Motivation"),
    additional_notes: boundedOptional(2000, "Additional notes"),
    current_client_base: boundedOptional(500, "Current client base"),
    position_title: boundedOptional(200, "Position title"),

    // Step 4 — client is deliberately stricter than the server here (server
    // allows any 1–50 chars); an IBAN shorter than 15 is never valid.
    payout_beneficiary_name: z
      .string()
      .trim()
      .min(2, "Beneficiary name is required")
      .max(200, "Beneficiary name must be 200 characters or fewer"),
    payout_iban: z
      .string()
      .trim()
      .min(15, "Please enter a valid IBAN")
      .max(34, "An IBAN is at most 34 characters"),

    // Step 5
    password,
    confirmPassword: z.string().min(1, "Please confirm your password"),

    // Client-only today. The server does not yet require this — see
    // PARTNER_JOURNEY.md and the terms-acceptance work.
    accept_terms: z.boolean().refine((val) => val === true, {
      message: "You must accept the terms and conditions",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type PartnerFormValues = z.infer<typeof partnerFormSchema>;

/**
 * The fields each step owns, so `form.trigger()` can block a step before the user
 * moves on. A field missing from here can only fail on the final submit, where the
 * step that owns it may not even be rendered — which is why the submit handler
 * must also pass an invalid-handler that surfaces the message.
 */
export const PARTNER_STEP_FIELDS = {
  type: ["partner_type"],
  contact: [
    "contact_name",
    "last_name",
    "company_name",
    "email",
    "phone",
    "preferred_language",
    "position_title",
  ],
  organization: [
    "organization_type",
    "organization_registration",
    "organization_website",
    "estimated_monthly_referrals",
    "facility_address",
    "facility_resident_count",
  ],
  additional: ["region", "how_heard_about_us", "motivation", "additional_notes", "current_client_base"],
  payout: ["payout_beneficiary_name", "payout_iban"],
  account: ["password", "confirmPassword", "accept_terms"],
} as const satisfies Record<string, readonly (keyof PartnerFormValues)[]>;
