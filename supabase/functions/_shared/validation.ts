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
const language = z.enum(["en", "es"]);
const optionalString = z.string().max(500).optional().or(z.literal(""));

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
  medicalInfo: medicalSchema,
  partnerMedicalInfo: medicalSchema.optional(),
  emergencyContacts: z.array(emergencyContactSchema).min(1).max(10),
  includePendant: z.boolean(),
  pendantCount: z.number().int().min(0).max(10),
  billingFrequency: z.enum(["monthly", "annual"]),
  partnerRef: z.string().max(100).optional(),
  refPostId: z.string().max(100).optional(),
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
      (i) => `${i.path.join(".")}: ${i.message}`
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
