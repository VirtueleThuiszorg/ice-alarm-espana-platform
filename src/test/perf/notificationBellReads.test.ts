import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * THE BELL IS IN EVERY AUTHENTICATED LAYOUT, so what it costs, every page pays.
 *
 * It issued FOUR `notification_log` requests on every page load. Two of them were
 * for nobody: `NotificationBell` resolved the signed-in user with an async
 * `supabase.auth.getUser()` inside an effect, so `userId` was `null` on the first
 * render and the real id on the second — and `useNotifications` reads twice per
 * identity (the list and the unread count).
 *
 * Both halves are pinned here, by cause rather than by a count, because a count
 * test would go red for a dozen unrelated reasons and a cause test says what to
 * fix.
 */

const SRC = path.resolve(__dirname, "../..");

/**
 * Comments are stripped before any of this is asserted, and it is not pedantry:
 * the comment explaining why `supabase.auth.getUser()` was REMOVED contains the
 * string `supabase.auth.getUser()`, so the first version of this file failed on
 * the very explanation of the fix. Same shape the repo already uses in
 * paymentGateway.test.ts and settingsKeyParity.test.ts.
 */
const stripComments = (src: string) =>
  src
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

const read = (rel: string) => stripComments(fs.readFileSync(path.join(SRC, rel), "utf8"));
const BELL = read("components/notifications/NotificationBell.tsx");
const HOOK = read("hooks/useNotifications.ts");

describe("the notification bell", () => {
  it("takes the signed-in user from context, not from a fresh auth round trip", () => {
    /*
      ASSERTED ON THE IMPORT, not on the absence of the string
      "supabase.auth.getUser()". The comment in NotificationBell explaining why
      that call was removed CONTAINS that string, so a substring check failed on
      the very explanation of the fix — twice, because line-based comment
      stripping does not reach the body of a block comment.

      The import is the honest signal and a comment cannot fake it: the bell has
      no remaining use for the Supabase client, so if it is imported again
      something started talking to the network from a component that already has
      what it needs.
    */
    expect(
      /^import .*\bsupabase\b.* from ["']@\/integrations\/supabase\/client["']/m.test(BELL),
      "NotificationBell imports the Supabase client again. useAuth() already holds the " +
        "session the app is running on — an auth round trip here costs a request AND makes " +
        "userId null on the first render, which doubles every read below it.",
    ).toBe(false);
    expect(BELL).toContain("useAuth()");
  });

  it("does not read notification_log for an identity that has not resolved", () => {
    expect(BELL).toMatch(/enabled:\s*!!userId/);
  });
});

describe("useNotifications", () => {
  it("can be told not to read at all", () => {
    // `userId` alone cannot answer "should I read": ABSENT means unscoped (the
    // admin mobile home wants everything), while NULL means either signed out or
    // not yet resolved. Only the caller can tell those apart.
    expect(HOOK).toContain("enabled?: boolean");
    expect(HOOK).toMatch(/enabled\s*=\s*true/);
  });

  it("honours it in BOTH reads, not just the list", () => {
    // The unread count is a second request. Guarding only the list would have
    // halved the waste and left the bell still asking about nobody.
    const countFn = HOOK.slice(HOOK.indexOf("const fetchUnreadCount"), HOOK.indexOf("// Fetch notifications"));
    expect(countFn).toContain("if (!enabled) return;");
    const listFn = HOOK.slice(HOOK.indexOf("const fetchNotifications"), HOOK.indexOf("// Mark a single notification"));
    expect(listFn).toContain("if (!enabled)");
  });

  it("re-reads when `enabled` flips, or a signed-in user would see an empty bell for ever", () => {
    // Both fetchers are useCallbacks that effects depend on. If `enabled` were not
    // in their dependency lists, the callbacks captured while disabled would never
    // be replaced and the bell would stay empty after sign-in.
    expect(HOOK).toMatch(/\[userId, enabled\]/);
    expect(HOOK).toMatch(/\[userId, typeFilter, readFilter, pageSize, enabled\]/);
  });
});
