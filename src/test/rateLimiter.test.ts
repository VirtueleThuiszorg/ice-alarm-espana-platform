import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, rateLimits } from "@/lib/rateLimiter";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows actions within the limit", () => {
    expect(checkRateLimit("test-action", 3, 60_000)).toBe(true);
    expect(checkRateLimit("test-action", 3, 60_000)).toBe(true);
    expect(checkRateLimit("test-action", 3, 60_000)).toBe(true);
  });

  it("blocks actions exceeding the limit", () => {
    expect(checkRateLimit("block-test", 2, 60_000)).toBe(true);
    expect(checkRateLimit("block-test", 2, 60_000)).toBe(true);
    expect(checkRateLimit("block-test", 2, 60_000)).toBe(false);
  });

  it("resets after the time window expires", () => {
    expect(checkRateLimit("reset-test", 1, 1_000)).toBe(true);
    expect(checkRateLimit("reset-test", 1, 1_000)).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(1_001);

    expect(checkRateLimit("reset-test", 1, 1_000)).toBe(true);
  });

  it("uses separate counters for different keys", () => {
    expect(checkRateLimit("key-a", 1, 60_000)).toBe(true);
    expect(checkRateLimit("key-b", 1, 60_000)).toBe(true);

    // key-a is now exhausted, but key-b should still work
    expect(checkRateLimit("key-a", 1, 60_000)).toBe(false);
    expect(checkRateLimit("key-b", 1, 60_000)).toBe(false);
  });

  it("uses a sliding window (not fixed window)", () => {
    // Fill the limit
    expect(checkRateLimit("sliding", 2, 10_000)).toBe(true); // t=0
    vi.advanceTimersByTime(5_000);
    expect(checkRateLimit("sliding", 2, 10_000)).toBe(true); // t=5000
    expect(checkRateLimit("sliding", 2, 10_000)).toBe(false); // t=5000, limit hit

    // Advance past first timestamp's window (t=0 + 10000 = t=10000)
    vi.advanceTimersByTime(5_001); // t=10001
    // First entry expired, so we should have room for one more
    expect(checkRateLimit("sliding", 2, 10_000)).toBe(true);
  });
});

describe("rateLimits presets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auth: allows 5 attempts per 15 minutes", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimits.auth()).toBe(true);
    }
    expect(rateLimits.auth()).toBe(false);

    // Still blocked after 14 minutes
    vi.advanceTimersByTime(14 * 60_000);
    expect(rateLimits.auth()).toBe(false);

    // Allowed after 15 minutes
    vi.advanceTimersByTime(1 * 60_000 + 1);
    expect(rateLimits.auth()).toBe(true);
  });

  it("formSubmit: allows 5 per minute per key", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimits.formSubmit("contact")).toBe(true);
    }
    expect(rateLimits.formSubmit("contact")).toBe(false);

    // Different form key should work independently
    expect(rateLimits.formSubmit("registration")).toBe(true);
  });

  it("chat: allows 15 per minute", () => {
    for (let i = 0; i < 15; i++) {
      expect(rateLimits.chat()).toBe(true);
    }
    expect(rateLimits.chat()).toBe(false);
  });
});
