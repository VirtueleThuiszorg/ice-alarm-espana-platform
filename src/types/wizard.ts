// Shared wizard data types for both admin and public registration flows

export interface MemberDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  nieDni: string;
  preferredLanguage: "en" | "es";
  preferredContactMethod?: "whatsapp" | "phone" | "email";
  preferredContactTime?: "morning" | "afternoon" | "evening" | "anytime";
  specialInstructions?: string;
}

export interface AddressDetails {
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface MedicalDetails {
  bloodType: string;
  allergies: string[];
  medications: string[];
  medicalConditions: string[];
  doctorName: string;
  doctorPhone: string;
  hospitalPreference: string;
  additionalNotes: string;
}

export interface EmergencyContact {
  contactName: string;
  relationship: string;
  phone: string;
  email: string;
  speaksSpanish: boolean;
  notes: string;
}

export interface JoinWizardData {
  // Step 1: Membership Type
  membershipType: "single" | "couple";

  // Step 2: Personal Details
  primaryMember: MemberDetails;
  partnerMember?: MemberDetails;

  // Step 3: Address
  address: AddressDetails;
  separateAddresses?: boolean;
  partnerAddress?: AddressDetails;

  // Step 4: Emergency Contacts
  emergencyContacts: EmergencyContact[];

  // Step 5: Medical Information
  medicalInfo: MedicalDetails;
  partnerMedicalInfo?: MedicalDetails;

  // Step 6: Pendant Option
  includePendant: boolean;
  pendantCount: number;

  // Step 7: Billing & Summary
  billingFrequency: "monthly" | "annual";

  // Step 8: Terms & Payment
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  paymentComplete: boolean;

  // Generated after submission
  orderId?: string;
  memberId?: string;
}

export const initialJoinWizardData: JoinWizardData = {
  membershipType: "single",
  primaryMember: {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    nieDni: "",
    preferredLanguage: "es",
    preferredContactMethod: undefined,
    preferredContactTime: undefined,
    specialInstructions: undefined,
  },
  address: {
    addressLine1: "",
    addressLine2: "",
    city: "",
    province: "",
    postalCode: "",
    country: "Spain",
  },
  separateAddresses: false,
  emergencyContacts: [],
  medicalInfo: {
    bloodType: "",
    allergies: [],
    medications: [],
    medicalConditions: [],
    doctorName: "",
    doctorPhone: "",
    hospitalPreference: "",
    additionalNotes: "",
  },
  includePendant: true,
  pendantCount: 1,
  billingFrequency: "monthly",
  acceptTerms: false,
  acceptPrivacy: false,
  paymentComplete: false,
};
