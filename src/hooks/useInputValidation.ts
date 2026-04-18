import { z } from "zod";

// Common validation schemas for security
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Invalid email address")
  .max(255, "Email must be less than 255 characters");

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .regex(/^\+?[0-9\s\-()]+$/, "Invalid phone number format")
  .max(20, "Phone number must be less than 20 characters");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be less than 100 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be less than 100 characters")
  .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, "Name contains invalid characters");

export const addressSchema = z
  .string()
  .trim()
  .min(1, "Address is required")
  .max(200, "Address must be less than 200 characters");

export const postalCodeSchema = z
  .string()
  .trim()
  .min(1, "Postal code is required")
  .max(10, "Postal code must be less than 10 characters")
  .regex(/^[0-9A-Za-z\s-]+$/, "Invalid postal code format");

export const nieSchema = z
  .string()
  .trim()
  .max(15, "NIE/DNI must be less than 15 characters")
  .regex(/^[A-Za-z0-9-]*$/, "Invalid NIE/DNI format")
  .optional()
  .or(z.literal(""));

export const notesSchema = z
  .string()
  .max(2000, "Notes must be less than 2000 characters")
  .optional()
  .or(z.literal(""));

// Encode HTML entities for safe display in HTML attributes.
// For stripping HTML from user input, use sanitizeText from @/lib/sanitize instead.
export function escapeHtmlEntities(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .trim();
}

// Validate and sanitize URL
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

// Create safe WhatsApp URL
export function createWhatsAppUrl(phone: string, message?: string): string {
  const cleanPhone = phone.replace(/[^0-9+]/g, "");
  const encodedMessage = message ? encodeURIComponent(message) : "";
  return `https://wa.me/${cleanPhone}${encodedMessage ? `?text=${encodedMessage}` : ""}`;
}

// Create safe tel: URL
export function createTelUrl(phone: string): string {
  const cleanPhone = phone.replace(/[^0-9+]/g, "");
  return `tel:${cleanPhone}`;
}

// Member registration form schema
export const memberRegistrationSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  nieDni: nieSchema,
  addressLine1: addressSchema,
  addressLine2: z.string().max(200).optional(),
  city: z.string().trim().min(1, "City is required").max(100),
  province: z.string().trim().min(1, "Province is required").max(100),
  postalCode: postalCodeSchema,
  specialInstructions: notesSchema,
});

// Emergency contact schema
export const emergencyContactSchema = z.object({
  contactName: nameSchema,
  relationship: z.string().trim().min(1, "Relationship is required").max(50),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal("")),
  speaksSpanish: z.boolean(),
  notes: notesSchema,
});

// Medical information schema
export const medicalInfoSchema = z.object({
  bloodType: z.string().max(10).optional(),
  medicalConditions: z.array(z.string().max(100)).optional(),
  medications: z.array(z.string().max(100)).optional(),
  allergies: z.array(z.string().max(100)).optional(),
  doctorName: z.string().max(100).optional(),
  doctorPhone: phoneSchema.optional().or(z.literal("")),
  hospitalPreference: z.string().max(200).optional(),
  additionalNotes: notesSchema,
});

export type MemberRegistration = z.infer<typeof memberRegistrationSchema>;
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;
export type MedicalInfo = z.infer<typeof medicalInfoSchema>;
