import { describe, it, expect } from "vitest";
import {
  sanitizeHtml,
  stripHtml,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUrl,
  sanitizeSearchQuery,
  sanitizeFormValues,
} from "@/lib/sanitize";

// ============================================================
//  sanitizeHtml
// ============================================================

describe("sanitizeHtml", () => {
  it("keeps safe HTML tags", () => {
    const input = "<b>bold</b> <i>italic</i> <a href='https://ice.es'>link</a>";
    const result = sanitizeHtml(input);
    expect(result).toContain("<b>bold</b>");
    expect(result).toContain("<i>italic</i>");
    expect(result).toContain("<a");
  });

  it("strips script tags", () => {
    const input = '<script>alert("xss")</script><p>safe</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>safe</p>");
  });

  it("strips event handlers", () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("onerror");
  });

  it("strips iframe tags", () => {
    const input = '<iframe src="https://evil.com"></iframe><p>ok</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>ok</p>");
  });

  it("strips javascript: URLs in hrefs", () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
  });

  it("strips data attributes", () => {
    const input = '<div data-evil="payload">content</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("data-evil");
  });
});

// ============================================================
//  stripHtml
// ============================================================

describe("stripHtml", () => {
  it("removes all HTML tags", () => {
    expect(stripHtml("<b>bold</b> and <i>italic</i>")).toBe("bold and italic");
  });

  it("returns empty string for script-only content", () => {
    expect(stripHtml('<script>alert("xss")</script>')).toBe("");
  });

  it("handles plain text passthrough", () => {
    expect(stripHtml("no html here")).toBe("no html here");
  });
});

// ============================================================
//  sanitizeText
// ============================================================

describe("sanitizeText", () => {
  it("strips HTML and trims whitespace", () => {
    expect(sanitizeText("  <b>Hello</b>  ")).toBe("Hello");
  });

  it("returns plain text for normal input", () => {
    expect(sanitizeText("John Doe")).toBe("John Doe");
  });

  it("removes script injection attempts", () => {
    expect(sanitizeText('<script>alert("xss")</script>Test')).toBe("Test");
  });
});

// ============================================================
//  sanitizeEmail
// ============================================================

describe("sanitizeEmail", () => {
  it("lowercases and trims email", () => {
    expect(sanitizeEmail("  User@ICE.ES  ")).toBe("user@ice.es");
  });

  it("removes angle brackets", () => {
    expect(sanitizeEmail("<user@test.com>")).toBe("user@test.com");
  });

  it("removes single and double quotes", () => {
    expect(sanitizeEmail("user'\"@test.com")).toBe("user@test.com");
  });
});

// ============================================================
//  sanitizePhone
// ============================================================

describe("sanitizePhone", () => {
  it("keeps valid phone characters", () => {
    expect(sanitizePhone("+34 900 123 456")).toBe("+34 900 123 456");
  });

  it("keeps parentheses and dashes", () => {
    expect(sanitizePhone("(+34) 900-123-456")).toBe("(+34) 900-123-456");
  });

  it("strips letters and special characters", () => {
    expect(sanitizePhone("+34abc!@#900")).toBe("+34900");
  });

  it("trims whitespace", () => {
    expect(sanitizePhone("  +34 900  ")).toBe("+34 900");
  });
});

// ============================================================
//  sanitizeUrl
// ============================================================

describe("sanitizeUrl", () => {
  it("allows https URLs", () => {
    expect(sanitizeUrl("https://ice.es/join")).toBe("https://ice.es/join");
  });

  it("allows http URLs", () => {
    expect(sanitizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("allows relative URLs", () => {
    expect(sanitizeUrl("/dashboard")).toBe("/dashboard");
  });

  it("blocks javascript: URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
  });

  it("blocks data: URLs", () => {
    expect(sanitizeUrl("data:text/html,<script>")).toBe("");
  });

  it("blocks bare strings", () => {
    expect(sanitizeUrl("evil.com")).toBe("");
  });

  it("trims input", () => {
    expect(sanitizeUrl("  https://ice.es  ")).toBe("https://ice.es");
  });
});

// ============================================================
//  sanitizeSearchQuery
// ============================================================

describe("sanitizeSearchQuery", () => {
  it("removes SQL wildcards", () => {
    expect(sanitizeSearchQuery("test%")).toBe("test");
    expect(sanitizeSearchQuery("test_name")).toBe("testname");
  });

  it("removes regex special characters", () => {
    expect(sanitizeSearchQuery("test.*+?{}[]()^$|")).toBe("test.+");
  });

  it("trims and limits length to 200 characters", () => {
    const long = "a".repeat(300);
    expect(sanitizeSearchQuery(long)).toHaveLength(200);
  });

  it("passes through normal search terms", () => {
    expect(sanitizeSearchQuery("John Smith")).toBe("John Smith");
  });
});

// ============================================================
//  sanitizeFormValues
// ============================================================

describe("sanitizeFormValues", () => {
  it("sanitizes all string values in a form object", () => {
    const result = sanitizeFormValues({
      name: "  <b>John</b>  ",
      email: "test@test.com",
      age: 25,
    });

    expect(result.name).toBe("John");
    expect(result.email).toBe("test@test.com");
    expect(result.age).toBe(25);
  });

  it("does not modify non-string values", () => {
    const result = sanitizeFormValues({
      count: 42,
      active: true,
      data: null,
    });

    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.data).toBeNull();
  });
});
