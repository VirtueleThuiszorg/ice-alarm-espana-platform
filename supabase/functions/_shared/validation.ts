import { z } from "npm:zod@3.25.76";

// --- Reusable field schemas ---

const email = z.string().trim().min(1).email().max(255);
const phone = z.string().trim().min(1).regex(/^\+?[0-9\s\-()]+$/).max(20);
const name = z.string().trim().min(1).max(100).regex(/^[a-zA-ZÀ-ÿ\s'-]+$/);
const password = z
  .string()
  .min(8)
  .max(100)
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/[0-9]/);
const language = z.enum(["en", "es", "nl"]);

// --- Nested schemas ---

const memberDetailsSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  phone,
  dateOfBirth: z.string().min(1).max(20),
  nieDni: z.string().max(15).regex(/^[A-Za-z0-9-]*$/).optional().or(z.literal("")),
  preferredLanguage: language.optional(),
  preferredContactMethod: z.string().max(50).optional(),
  preferredContactTime: z.string().max(50).optional(),
  specialInstructions: z.string().max(2000).optional().or(z.literal("")),
});

const addressSchema = z.object({
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(1).max(100),
  province: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(10).regex(/^[0-9A-Za-z\s-]+$/),
  country: z.string().max(100).optional(),
});

const medicalSchema = z.object({
  bloodType: z.string().max(10).optional().or(z.literal("")),
  allergies: z.array(z.string().max(100)).max(50).optional(),
  medications: z.array(z.string().max(100)).max(50).optional(),
  medicalConditions: z.array(z.string().max(100)).max(50).optional(),
  doctorName: z.string().max(100).optional().or(z.literal("")),
  doctorPhone: z.string().max(20).optional().or(z.literal("")),
  hospitalPreference: z.string().max(200).optional().or(z.literal("")),
  additionalNotes: z.string().max(2000).optional().or(z.literal("")),
});

const emergencyContactSchema = z.object({
  contactName: name,
  relationship: z.string().trim().min(1).max(50),
  phone,
  email: email.optional().or(z.literal("")),
  speaksSpanish: z.boolean(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

// --- Top-level request schemas ---

export const registrationSchema = z.object({
  membershipType: z.enum(["single", "couple"]),
  primaryMember: memberDetailsSchema,
  partnerMember: memberDetailsSchema.optional(),
  address: addressSchema,
  // OPTIONAL, and that is the contract — not a relaxation of it. The join wizard is forbidden to
  // send these: `buildRegistrationBody` omits them and `assertNoHealthDataInPayload` throws if a
  // caller supplies them, because emergency contacts and medical data are collected after payment
  // through member_update_tokens (ONBOARDING_SPLIT.md). While they were required here, every
  // stranger who pressed "Pay securely" got a 400 from a schema their own client could not satisfy
  // (REVIEW_JOIN_PATH.md F1). The shape of each element is unchanged — a caller that DOES send
  // contacts is still held to a real name, relationship and phone.
  medicalInfo: medicalSchema.optional(),
  partnerMedicalInfo: medicalSchema.optional(),
  emergencyContacts: z.array(emergencyContactSchema).max(10).optional(),
  includePendant: z.boolean(),
  pendantCount: z.number().int().min(0).max(10),
  billingFrequency: z.enum(["monthly", "annual"]),
  // `.nullish()`, not `.optional()`. `getStoredReferralData()` returns `referralCode: null` and
  // `refPostId: null` for a visitor who arrived without a referral code — the common case — and
  // the builder passes them through as nulls, which JSON preserves. An optional string accepts
  // undefined and REJECTS null, so this was a second, independent cause of the same 400: fixing
  // only the health fields above would have left the wizard just as dead.
  partnerRef: z.string().max(100).nullish(),
  refPostId: z.string().max(100).nullish(),
  utmParams: z
    .object({
      utm_source: z.string().max(200).optional(),
      utm_medium: z.string().max(200).optional(),
      utm_campaign: z.string().max(200).optional(),
      utm_term: z.string().max(200).optional(),
      utm_content: z.string().max(200).optional(),
    })
    .optional(),
  testMode: z.boolean().optional(),
});

export const checkoutSchema = z.object({
  memberId: z.string().uuid(),
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  lineItems: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        amount: z.number().int().min(0),
        quantity: z.number().int().min(1).max(100),
      })
    )
    .min(1)
    .max(20),
  customerEmail: email,
  customerName: z.string().min(1).max(200),
  successUrl: z.string().url().max(2000),
  cancelUrl: z.string().url().max(2000),
  metadata: z.record(z.string().max(500)).optional(),
});

export const partnerRegisterSchema = z.object({
  contact_name: name,
  last_name: z.string().max(100).optional().or(z.literal("")),
  company_name: z.string().max(200).optional().or(z.literal("")),
  email,
  phone: phone.optional().or(z.literal("")),
  preferred_language: language,
  payout_beneficiary_name: z.string().trim().min(1).max(200),
  payout_iban: z.string().trim().min(1).max(50),
  password,
  partner_type: z.enum([
    "referral", "care", "residential", "pharmacy",
    "insurance", "healthcare_provider", "real_estate",
    "expat_community", "corporate_other",
  ]).optional(),
  organization_type: z.string().max(100).optional(),
  organization_registration: z.string().max(100).optional(),
  organization_website: z.string().max(500).optional(),
  estimated_monthly_referrals: z.string().max(50).optional(),
  facility_address: z.string().max(500).optional(),
  facility_resident_count: z.number().int().min(0).max(10000).optional(),
  region: z.string().max(100).optional(),
  how_heard_about_us: z.string().max(100).optional(),
  motivation: z.string().max(1000).optional(),
  additional_notes: z.string().max(2000).optional(),
  current_client_base: z.string().max(500).optional(),
  position_title: z.string().max(200).optional(),
  // Terms acceptance is a legal record, so the server requires it rather than
  // trusting the form's checkbox. `literal(true)` rejects false AND absent — an
  // optional boolean would let a caller skip the field entirely.
  accept_terms: z.literal(true),
});

export const staffRegisterSchema = z.object({
  email,
  first_name: name,
  last_name: name,
  role: z.enum(["admin", "call_centre_supervisor", "call_centre"]),
  phone: phone.optional().or(z.literal("")),
  preferred_language: language.optional(),
  // Optional fields admin may fill in during creation
  date_of_birth: z.string().max(20).optional().or(z.literal("")),
  nationality: z.string().max(100).optional().or(z.literal("")),
  nie_number: z.string().max(20).optional().or(z.literal("")),
  social_security_number: z.string().max(20).optional().or(z.literal("")),
  address_line1: z.string().max(200).optional().or(z.literal("")),
  address_line2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  province: z.string().max(100).optional().or(z.literal("")),
  postal_code: z.string().max(10).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  emergency_contact_name: z.string().max(100).optional().or(z.literal("")),
  emergency_contact_phone: z.string().max(20).optional().or(z.literal("")),
  emergency_contact_relationship: z.string().max(50).optional().or(z.literal("")),
  hire_date: z.string().max(20).optional().or(z.literal("")),
  department: z.string().max(100).optional().or(z.literal("")),
  position: z.string().max(200).optional().or(z.literal("")),
  contract_type: z.string().max(50).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  personal_mobile: z.string().max(20).optional().or(z.literal("")),
  escalation_priority: z.number().int().min(1).max(99).optional(),
  is_on_call: z.boolean().optional(),
  annual_holiday_days: z.number().int().min(0).max(60).optional(),
});

export const staffCompleteInviteSchema = z.object({
  token: z.string().min(1).max(100),
  password,
  profile: z.object({
    date_of_birth: z.string().max(20).optional(),
    nationality: z.string().max(100).optional(),
    nie_number: z.string().max(20).optional(),
    social_security_number: z.string().max(20).optional(),
    phone: z.string().max(20).optional(),
    personal_mobile: z.string().max(20).optional(),
    address_line1: z.string().max(200).optional(),
    address_line2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    province: z.string().max(100).optional(),
    postal_code: z.string().max(10).optional(),
    country: z.string().max(100).optional(),
    emergency_contact_name: z.string().max(100).optional(),
    emergency_contact_phone: z.string().max(20).optional(),
    emergency_contact_relationship: z.string().max(50).optional(),
  }),
});

export const partnerAdminInviteSchema = z.object({
  contact_name: name,
  email,
  preferred_language: language.optional(),
  partner_type: z.enum([
    "referral", "care", "residential", "pharmacy",
    "insurance", "healthcare_provider", "real_estate",
    "expat_community", "corporate_other",
  ]).optional(),
  // Optional admin note recorded when converting an application (Option C).
  review_notes: z.string().max(1000).optional(),
});

export const partnerCompleteInviteSchema = z.object({
  token: z.string().min(1).max(100),
  password,
  profile: z.object({
    phone: z.string().max(20).optional(),
    company_name: z.string().max(200).optional(),
    position_title: z.string().max(200).optional(),
    organization_type: z.string().max(100).optional(),
    organization_registration: z.string().max(100).optional(),
    organization_website: z.string().max(500).optional(),
    estimated_monthly_referrals: z.string().max(50).optional(),
    payout_beneficiary_name: z.string().max(200).optional(),
    payout_iban: z.string().max(50).optional(),
    region: z.string().max(100).optional(),
  }),
});

export const saveDraftSchema = z.object({
  sessionId: z.string().min(1).max(200),
  currentStep: z.unknown(),
  wizardData: z.unknown(),
  // Which wizard wrote currentStep. 1 = nine-step, 2 = seven-step. Optional so a client that
  // has not been redeployed still saves; the function defaults it rather than guessing later.
  schemaVersion: z.number().int().min(1).max(99).optional(),
});

export const sendEmailSchema = z.object({
  to: email,
  subject: z.string().min(1).max(500),
  html_body: z.string().min(1).max(100_000),
  text_body: z.string().max(100_000).optional(),
  module: z.enum(["member", "outreach", "support", "system"]),
  related_entity_id: z.string().uuid().optional(),
  related_entity_type: z.string().max(50).optional(),
  template_slug: z.string().max(100).optional(),
  template_variables: z.record(z.string().max(5000)).optional(),
  language: language.optional(),
  reply_to: email.optional(),
  in_reply_to: z.string().max(500).optional(),
  thread_id: z.string().max(500).optional(),
});

export const outreachSendEmailSchema = z.object({
  draft_ids: z.array(z.string().uuid()).max(100).optional(),
  send_all_approved: z.boolean().optional(),
});

/**
 * Validate request body and return parsed data or an error Response.
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  corsHeaders: Record<string, string>
): { data: T; error?: never } | { data?: never; error: Response } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i: z.ZodIssue) => `${i.path.join(".")}: ${i.message}`
    );
    console.error("Validation failed:", issues);
    return {
      error: new Response(
        JSON.stringify({ error: "Invalid request data", details: issues }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }
  return { data: result.data };
}
