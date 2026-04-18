/**
 * CRM Import utilities for parsing KarmaCRM CSV exports
 */

export interface KarmaCRMRow {
  [key: string]: string;
}

// Sensitive payment fields that should NEVER be stored in structured tables
// These are kept ONLY in crm_import_rows.raw for admin review
export const SENSITIVE_PAYMENT_FIELDS = [
  'Credit Card Details',
  'credit_card',
  '20 Digit Bank No',
  'bank_number',
  'Bank Account',
  'IBAN',
  'Card Number',
  'CVV',
  'card_cvv',
  'Account Number',
];

// Safe billing metadata that can be imported
export const SAFE_BILLING_FIELDS = [
  'Payment Type', // DD/TVP
  'Monthly Fee',
  'Monthly Payment Date',
  'Membership Type',
];

export interface BillingMetadata {
  paymentType: string | null;
  monthlyFee: number | null;
  monthlyPaymentDate: string | null;
}

export interface ParsedCRMRow {
  firstName: string;
  lastName: string;
  fullName: string;
  emailPrimary: string;
  phonePrimary: string;
  status: string;
  stage: string;
  referralSource: string;
  city: string;
  postalCode: string;
  country: string;
  membershipType: string;
  deviceImei: string;
  notes: string;
  addressLine1: string;
  addressLine2: string;
  province: string;
  dateOfBirth: string;
  // Extra contact methods
  extraEmails: { label: string; value: string }[];
  extraPhones: { label: string; value: string }[];
  // Medical info
  medicalConditions: string;
  medications: string;
  allergies: string;
  bloodType: string;
  doctorName: string;
  doctorPhone: string;
  hospitalPreference: string;
  // Emergency contacts
  emergencyContact1: { name: string; phone: string; relationship: string } | null;
  emergencyContact2: { name: string; phone: string; relationship: string } | null;
  emergencyContact3: { name: string; phone: string; relationship: string } | null;
  // Billing metadata (safe fields only)
  billingMetadata: BillingMetadata;
  // Raw data
  raw: KarmaCRMRow;
  dedupeKey: string;
  canBeMember: boolean;
  importTarget: 'member' | 'crm_contact' | 'skip';
  // Flags
  hasSensitivePaymentData: boolean;
}

// KarmaCRM column mappings
const COLUMN_MAPPINGS = {
  firstName: ['First', 'First Name', 'first_name'],
  lastName: ['Last', 'Last Name', 'last_name'],
  fullName: ['Name', 'Full Name', 'full_name'],
  emailWork: ['Email(w)', 'Email (w)', 'Work Email', 'email_work'],
  emailHome: ['Email(h)', 'Email (h)', 'Home Email', 'email_home'],
  emailOther: ['Email(o)', 'Email (o)', 'Other Email', 'email_other'],
  phoneMain: ['Phone(m)', 'Phone (m)', 'Main Phone', 'phone_main', 'Phone'],
  phoneWork: ['Phone(w)', 'Phone (w)', 'Work Phone', 'phone_work'],
  phoneHome: ['Phone(h)', 'Phone (h)', 'Home Phone', 'phone_home'],
  status: ['Status', 'status'],
  stage: ['Stage', 'stage'],
  referralSource: ['Referral source', 'Referral Source', 'referral_source', 'Source'],
  city: ['City', 'City/Town', 'city'],
  postalCode: ['Postal Code', 'Postal code', 'postal_code', 'Zip'],
  country: ['Country', 'country'],
  province: ['Region', 'Province', 'State', 'region', 'province'],
  street: ['Street', 'Address', 'address_line_1', 'Street 1'],
  street2: ['Street 2', 'Address 2', 'address_line_2'],
  membershipType: ['Membership Type', 'Membership type', 'membership_type', 'Plan'],
  deviceImei: ['Pendant IMEI', 'Device IMEI', 'IMEI', 'pendant_imei'],
  notes: ['Recent notes', 'Notes', 'notes'],
  dateOfBirth: ['Date of Birth', 'DOB', 'Birthday', 'date_of_birth', 'Birth Date'],
  // Medical
  medicalConditions: ['Medical Conditions', 'Conditions', 'medical_conditions'],
  medications: ['Medications', 'medications'],
  allergies: ['Allergies', 'allergies'],
  bloodType: ['Blood Type', 'blood_type'],
  doctorName: ['Doctor Name', 'Doctor', 'doctor_name'],
  doctorPhone: ['Doctor Phone', 'doctor_phone'],
  hospitalPreference: ['Hospital Preference', 'Preferred Hospital', 'hospital'],
  // Emergency contacts
  emergencyContact1Name: ['Emergency Contact 1', 'EC1 Name', 'emergency_contact_1_name'],
  emergencyContact1Phone: ['EC1 Phone', 'emergency_contact_1_phone'],
  emergencyContact1Relationship: ['EC1 Relationship', 'emergency_contact_1_relationship'],
  emergencyContact2Name: ['Emergency Contact 2', 'EC2 Name', 'emergency_contact_2_name'],
  emergencyContact2Phone: ['EC2 Phone', 'emergency_contact_2_phone'],
  emergencyContact2Relationship: ['EC2 Relationship', 'emergency_contact_2_relationship'],
  emergencyContact3Name: ['Emergency Contact 3', 'EC3 Name', 'emergency_contact_3_name'],
  emergencyContact3Phone: ['EC3 Phone', 'emergency_contact_3_phone'],
  emergencyContact3Relationship: ['EC3 Relationship', 'emergency_contact_3_relationship'],
};

function findColumnValue(row: KarmaCRMRow, possibleNames: string[]): string {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name].trim() !== '') {
      return row[name].trim();
    }
  }
  return '';
}

function normalizePhone(phone: string): string {
  if (!phone) return '';
  // Remove all non-digit characters except +
  return phone.replace(/[^\d+]/g, '');
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: '', lastName: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

export function parseCSVRow(row: KarmaCRMRow): ParsedCRMRow {
  // Extract names
  let firstName = findColumnValue(row, COLUMN_MAPPINGS.firstName);
  let lastName = findColumnValue(row, COLUMN_MAPPINGS.lastName);
  const fullName = findColumnValue(row, COLUMN_MAPPINGS.fullName);
  
  // If no first/last name but have full name, split it
  if (!firstName && !lastName && fullName) {
    const split = splitFullName(fullName);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  // Extract emails (find primary + extras)
  const emailWork = findColumnValue(row, COLUMN_MAPPINGS.emailWork);
  const emailHome = findColumnValue(row, COLUMN_MAPPINGS.emailHome);
  const emailOther = findColumnValue(row, COLUMN_MAPPINGS.emailOther);
  
  const allEmails = [
    { label: 'work', value: emailWork },
    { label: 'home', value: emailHome },
    { label: 'other', value: emailOther },
  ].filter(e => e.value);
  
  const emailPrimary = allEmails[0]?.value || '';
  const extraEmails = allEmails.slice(1);

  // Extract phones (find primary + extras)
  const phoneMain = findColumnValue(row, COLUMN_MAPPINGS.phoneMain);
  const phoneWork = findColumnValue(row, COLUMN_MAPPINGS.phoneWork);
  const phoneHome = findColumnValue(row, COLUMN_MAPPINGS.phoneHome);
  
  const allPhones = [
    { label: 'main', value: phoneMain },
    { label: 'work', value: phoneWork },
    { label: 'home', value: phoneHome },
  ].filter(p => p.value);
  
  const phonePrimary = allPhones[0]?.value || '';
  const extraPhones = allPhones.slice(1);

  // Extract other fields
  const status = findColumnValue(row, COLUMN_MAPPINGS.status);
  const stage = findColumnValue(row, COLUMN_MAPPINGS.stage);
  const referralSource = findColumnValue(row, COLUMN_MAPPINGS.referralSource);
  const city = findColumnValue(row, COLUMN_MAPPINGS.city);
  const postalCode = findColumnValue(row, COLUMN_MAPPINGS.postalCode);
  const country = findColumnValue(row, COLUMN_MAPPINGS.country);
  const province = findColumnValue(row, COLUMN_MAPPINGS.province);
  const addressLine1 = findColumnValue(row, COLUMN_MAPPINGS.street);
  const addressLine2 = findColumnValue(row, COLUMN_MAPPINGS.street2);
  const membershipType = findColumnValue(row, COLUMN_MAPPINGS.membershipType);
  const deviceImei = findColumnValue(row, COLUMN_MAPPINGS.deviceImei);
  const notes = findColumnValue(row, COLUMN_MAPPINGS.notes);
  const dateOfBirth = findColumnValue(row, COLUMN_MAPPINGS.dateOfBirth);

  // Medical info
  const medicalConditions = findColumnValue(row, COLUMN_MAPPINGS.medicalConditions);
  const medications = findColumnValue(row, COLUMN_MAPPINGS.medications);
  const allergies = findColumnValue(row, COLUMN_MAPPINGS.allergies);
  const bloodType = findColumnValue(row, COLUMN_MAPPINGS.bloodType);
  const doctorName = findColumnValue(row, COLUMN_MAPPINGS.doctorName);
  const doctorPhone = findColumnValue(row, COLUMN_MAPPINGS.doctorPhone);
  const hospitalPreference = findColumnValue(row, COLUMN_MAPPINGS.hospitalPreference);

  // Emergency contacts
  const ec1Name = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact1Name);
  const ec1Phone = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact1Phone);
  const ec1Rel = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact1Relationship);
  
  const ec2Name = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact2Name);
  const ec2Phone = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact2Phone);
  const ec2Rel = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact2Relationship);
  
  const ec3Name = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact3Name);
  const ec3Phone = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact3Phone);
  const ec3Rel = findColumnValue(row, COLUMN_MAPPINGS.emergencyContact3Relationship);

  // Check for sensitive payment data (GDPR/PCI compliance)
  const hasSensitivePaymentData = SENSITIVE_PAYMENT_FIELDS.some(field => {
    const value = row[field];
    return value && value.trim() !== '';
  });

  // Extract safe billing metadata only
  const paymentTypeRaw = findColumnValue(row, ['Payment Type', 'payment_type']);
  const monthlyFeeRaw = findColumnValue(row, ['Monthly Fee', 'monthly_fee']);
  const monthlyPaymentDateRaw = findColumnValue(row, ['Monthly Payment Date', 'monthly_payment_date']);
  
  const billingMetadata: BillingMetadata = {
    paymentType: paymentTypeRaw || null,
    monthlyFee: monthlyFeeRaw ? parseFloat(monthlyFeeRaw.replace(/[^0-9.]/g, '')) || null : null,
    monthlyPaymentDate: monthlyPaymentDateRaw || null,
  };

  // Compute dedupe key
  const dedupeKey = emailPrimary 
    ? emailPrimary.toLowerCase() 
    : normalizePhone(phonePrimary);

  // Determine if can be a member (has required fields)
  // Members table requires: first_name, last_name, email, phone, date_of_birth, address_line_1, city, postal_code, province
  const hasName = Boolean(firstName && lastName) || Boolean(fullName);
  const hasContact = Boolean(emailPrimary || phonePrimary);
  const hasAddress = Boolean(addressLine1 && city && postalCode);
  const hasDOB = Boolean(dateOfBirth);
  
  const canBeMember = hasName && hasContact && hasAddress && hasDOB;
  
  // Determine import target
  let importTarget: 'member' | 'crm_contact' | 'skip' = 'crm_contact';
  if (!hasName && !hasContact) {
    importTarget = 'skip';
  } else if (canBeMember) {
    importTarget = 'member';
  }

  return {
    firstName,
    lastName,
    fullName: fullName || `${firstName} ${lastName}`.trim(),
    emailPrimary,
    phonePrimary,
    status,
    stage,
    referralSource,
    city,
    postalCode,
    country: country || 'Spain',
    membershipType,
    deviceImei,
    notes,
    addressLine1,
    addressLine2,
    province,
    dateOfBirth,
    extraEmails,
    extraPhones,
    medicalConditions,
    medications,
    allergies,
    bloodType,
    doctorName,
    doctorPhone,
    hospitalPreference,
    emergencyContact1: ec1Name ? { name: ec1Name, phone: ec1Phone, relationship: ec1Rel || 'Other' } : null,
    emergencyContact2: ec2Name ? { name: ec2Name, phone: ec2Phone, relationship: ec2Rel || 'Other' } : null,
    emergencyContact3: ec3Name ? { name: ec3Name, phone: ec3Phone, relationship: ec3Rel || 'Other' } : null,
    billingMetadata,
    raw: row,
    dedupeKey,
    canBeMember,
    importTarget,
    hasSensitivePaymentData,
  };
}

export function parseCSV(csvText: string): KarmaCRMRow[] {
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return [];

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  // Parse data rows
  const rows: KarmaCRMRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    const row: KarmaCRMRow = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    rows.push(row);
  }
  
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  result.push(current.trim());
  return result;
}

export function getImportStats(rows: ParsedCRMRow[]): {
  total: number;
  members: number;
  crmContacts: number;
  skipped: number;
} {
  return {
    total: rows.length,
    members: rows.filter(r => r.importTarget === 'member').length,
    crmContacts: rows.filter(r => r.importTarget === 'crm_contact').length,
    skipped: rows.filter(r => r.importTarget === 'skip').length,
  };
}
