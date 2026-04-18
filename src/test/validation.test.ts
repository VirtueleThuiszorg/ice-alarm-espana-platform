import { describe, it, expect } from "vitest";
import {
  emailSchema,
  phoneSchema,
  nameSchema,
  passwordSchema,
  nieSchema,
  postalCodeSchema,
  addressSchema,
  notesSchema,
} from "@/hooks/useInputValidation";

describe("emailSchema", () => {
  it("accepts valid emails", () => {
    expect(emailSchema.safeParse("user@ice.es").success).toBe(true);
    expect(emailSchema.safeParse("name@subdomain.domain.co.uk").success).toBe(true);
    expect(emailSchema.safeParse("test+tag@example.com").success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(emailSchema.safeParse("").success).toBe(false);
  });

  it("rejects invalid emails", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("@no-user.com").success).toBe(false);
    expect(emailSchema.safeParse("missing@").success).toBe(false);
  });

  it("rejects emails over 255 characters", () => {
    const long = "a".repeat(250) + "@b.com";
    expect(emailSchema.safeParse(long).success).toBe(false);
  });

  it("trims whitespace", () => {
    const result = emailSchema.safeParse("  user@ice.es  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("user@ice.es");
    }
  });
});

describe("phoneSchema", () => {
  it("accepts Spanish phone numbers", () => {
    expect(phoneSchema.safeParse("+34 612 345 678").success).toBe(true);
    expect(phoneSchema.safeParse("+34612345678").success).toBe(true);
  });

  it("accepts UK phone numbers", () => {
    expect(phoneSchema.safeParse("+44 7911 123456").success).toBe(true);
  });

  it("accepts numbers with dashes and parens", () => {
    expect(phoneSchema.safeParse("+1 (555) 123-4567").success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(phoneSchema.safeParse("").success).toBe(false);
  });

  it("rejects phone numbers with letters", () => {
    expect(phoneSchema.safeParse("+34 abc def").success).toBe(false);
  });

  it("rejects numbers over 20 characters", () => {
    expect(phoneSchema.safeParse("+1234567890123456789012").success).toBe(false);
  });
});

describe("nameSchema", () => {
  it("accepts simple names", () => {
    expect(nameSchema.safeParse("John").success).toBe(true);
    expect(nameSchema.safeParse("Lee Wakeman").success).toBe(true);
  });

  it("accepts names with accents (Spanish)", () => {
    expect(nameSchema.safeParse("José María García-López").success).toBe(true);
    expect(nameSchema.safeParse("María del Carmen").success).toBe(true);
  });

  it("accepts names with apostrophes", () => {
    expect(nameSchema.safeParse("O'Brien").success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(nameSchema.safeParse("").success).toBe(false);
  });

  it("rejects names with numbers", () => {
    expect(nameSchema.safeParse("John123").success).toBe(false);
  });

  it("rejects names with special characters", () => {
    expect(nameSchema.safeParse("Robert; DROP TABLE").success).toBe(false);
    expect(nameSchema.safeParse("<script>alert(1)</script>").success).toBe(false);
  });

  it("rejects names over 100 characters", () => {
    expect(nameSchema.safeParse("A".repeat(101)).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts valid passwords", () => {
    expect(passwordSchema.safeParse("Abcdefg1").success).toBe(true);
    expect(passwordSchema.safeParse("StrongP@ss1").success).toBe(true);
  });

  it("rejects without uppercase", () => {
    expect(passwordSchema.safeParse("abcdefg1").success).toBe(false);
  });

  it("rejects without lowercase", () => {
    expect(passwordSchema.safeParse("ABCDEFG1").success).toBe(false);
  });

  it("rejects without number", () => {
    expect(passwordSchema.safeParse("Abcdefgh").success).toBe(false);
  });

  it("rejects under 8 characters", () => {
    expect(passwordSchema.safeParse("Ab1cdef").success).toBe(false);
  });

  it("rejects over 100 characters", () => {
    expect(passwordSchema.safeParse("Aa1" + "x".repeat(98)).success).toBe(false);
  });
});

describe("nieSchema", () => {
  it("accepts valid NIE formats", () => {
    expect(nieSchema.safeParse("X1234567A").success).toBe(true);
    expect(nieSchema.safeParse("X1234567-A").success).toBe(true);
  });

  it("accepts valid DNI formats", () => {
    expect(nieSchema.safeParse("12345678Z").success).toBe(true);
  });

  it("accepts empty string (optional)", () => {
    expect(nieSchema.safeParse("").success).toBe(true);
  });

  it("rejects invalid characters", () => {
    expect(nieSchema.safeParse("X1234567@A").success).toBe(false);
    expect(nieSchema.safeParse("X1234567 A").success).toBe(false);
  });

  it("rejects over 15 characters", () => {
    expect(nieSchema.safeParse("X".repeat(16)).success).toBe(false);
  });
});

describe("postalCodeSchema", () => {
  it("accepts Spanish postal codes", () => {
    expect(postalCodeSchema.safeParse("03180").success).toBe(true);
    expect(postalCodeSchema.safeParse("28001").success).toBe(true);
  });

  it("accepts UK postcodes", () => {
    expect(postalCodeSchema.safeParse("SW1A 1AA").success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(postalCodeSchema.safeParse("").success).toBe(false);
  });

  it("rejects special characters", () => {
    expect(postalCodeSchema.safeParse("031;80").success).toBe(false);
  });
});

describe("addressSchema", () => {
  it("accepts valid addresses", () => {
    expect(addressSchema.safeParse("Calle Test 123").success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(addressSchema.safeParse("").success).toBe(false);
  });

  it("rejects over 200 characters", () => {
    expect(addressSchema.safeParse("A".repeat(201)).success).toBe(false);
  });
});

describe("notesSchema", () => {
  it("accepts normal notes", () => {
    expect(notesSchema.safeParse("Some notes here").success).toBe(true);
  });

  it("accepts empty string (optional)", () => {
    expect(notesSchema.safeParse("").success).toBe(true);
  });

  it("accepts undefined (optional)", () => {
    expect(notesSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects over 2000 characters", () => {
    expect(notesSchema.safeParse("A".repeat(2001)).success).toBe(false);
  });
});
