/**
 * INTERNAL STAFF NOTES WERE VISIBLE TO THE MEMBER — WP6, G4.
 *
 * `20260907100400_messaging_schema.sql` added `staff_internal` to `messages.sender_type` and the
 * RESTRICTIVE policy that gives it meaning. Its own header says why:
 *
 *   "The existing member policy is 'Members can view messages in own conversations', which is
 *    scoped by conversation and says nothing about sender_type — so the moment `staff_internal`
 *    becomes a legal value, an internal note written in a member's own conversation would be
 *    visible to them. Adding the value without this policy would be the bug."
 *
 * **The internal-note feature predates that migration and wrote `sender_type: "system"`.**
 *
 * `system` is not `staff_internal`. The RESTRICTIVE policy does not cover it. The member's thread
 * selects `*` from their conversation with no sender_type filter and renders every row. So an
 * operator's note appeared in the member's own message thread — with `[Internal Note]` still on
 * the front of it, and, on the admin surface, written under a placeholder that says
 * *"only visible to staff"*.
 *
 * Two writers had the same wrong literal. The value that decides who can read a message is not a
 * thing to retype, so it is a constant now and these tests pin it.
 *
 * ROWS ALREADY WRITTEN AS `system` ARE STILL VISIBLE — that is data, and `PENDING_FOR_LEE.md`
 * S13 carries the query.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { STAFF_INTERNAL_SENDER_TYPE, staffSenderType } from "@/lib/messageSenderType";
import { stripComments } from "./helpers/stripComments";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const STAFF_WRITERS = [
  "src/pages/call-centre/MessagesPage.tsx",
  "src/pages/admin/MessagesPage.tsx",
];

describe("the value that decides who can read a message", () => {
  it("is the one the RESTRICTIVE policy names", () => {
    const migration = read("supabase/migrations/20260907100400_messaging_schema.sql");
    expect(migration).toContain("AS RESTRICTIVE");
    expect(migration).toMatch(
      new RegExp(`sender_type <> '${STAFF_INTERNAL_SENDER_TYPE}'[\\s\\S]{0,80}is_staff`),
    );
  });

  it("is in the CHECK constraint, so the write is legal", () => {
    const migration = read("supabase/migrations/20260907100400_messaging_schema.sql");
    const check = migration.match(
      /ADD CONSTRAINT messages_sender_type_check\s+CHECK \(sender_type IN \(([^)]*)\)\)/,
    );
    expect(check, "the sender_type CHECK was not found").toBeTruthy();
    expect(check![1]).toContain(`'${STAFF_INTERNAL_SENDER_TYPE}'`);
  });

  it("maps an internal note to staff_internal and a reply to staff", () => {
    expect(staffSenderType(true)).toBe("staff_internal");
    expect(staffSenderType(false)).toBe("staff");
  });

  it("is NEVER `system` — that is the value that leaked", () => {
    expect(staffSenderType(true)).not.toBe("system");
  });
});

describe("both staff surfaces write it, and neither retypes it", () => {
  it.each(STAFF_WRITERS)("%s uses the shared helper", (file) => {
    const src = read(file);
    expect(src).toContain("staffSenderType(isInternalNote)");
  });

  it.each(STAFF_WRITERS)("%s no longer writes `system` as a sender_type", (file) => {
    const src = read(file);
    // Asserted on the sender_type ASSIGNMENT, not on the word: `message_type: "system"` is a
    // different column and is deliberately unchanged, and the comments explaining the fix name
    // the old value. Matching prose is a mistake this codebase has made four times.
    expect(src).not.toMatch(/sender_type:\s*isInternalNote\s*\?\s*"system"/);
    expect(src).not.toMatch(/sender_type:\s*"system"/);
  });

  it("no file anywhere writes an internal note as a `system` sender_type", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, name.name);
        if (name.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name.name)) {
          const rel = path.relative(ROOT, full);
          if (rel.includes("src/test/")) continue;
          // Comments stripped: the module explaining the fix names the old value in prose, and
          // a scanner that reads prose flags the fix as the bug.
          const code = stripComments(readFileSync(full, "utf8"));
          if (/sender_type:\s*(isInternalNote\s*\?\s*)?"system"/.test(code)) {
            offenders.push(rel);
          }
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("and an internal note still raises no member notification", () => {
    // It never did — the notify call is already guarded — but a note that is invisible in the
    // thread and announced by a bell would be worse than the bug it replaces.
    for (const file of STAFF_WRITERS) {
      expect(read(file)).toMatch(/if \(!isInternalNote/);
    }
  });
});

describe("the member side needs no filter, and must not grow one", () => {
  it("re-fetches on realtime rather than trusting the pushed payload", () => {
    /*
      The INSERT handler ignores `payload.new` and calls `fetchMessages`, which goes back through
      the RLS-protected query. If it appended the payload directly, an internal note could flash
      into the member's thread live regardless of the policy.
    */
    const src = read("src/pages/client/MessagesPage.tsx");
    const at = src.indexOf("client-messages-");
    const block = src.slice(at, at + 700);
    expect(block).toContain("fetchMessages(selectedConversation.id)");
    expect(block).not.toMatch(/payload\.new/);
  });

  it("relies on RLS, not on a client-side sender_type filter", () => {
    /*
      Deliberate. A client filter would be a SECOND place that decides who reads an internal
      note, and the two would drift — which is exactly the shape of the defect being fixed. The
      RESTRICTIVE policy is the rule, `scripts/rls/isolation.sql` proves it, and the client
      simply asks for the conversation.
    */
    const src = read("src/pages/client/MessagesPage.tsx");
    expect(src).not.toContain("staff_internal");
  });
});

describe("the proof, in the RLS harness", () => {
  it("seeds an internal note in a member's OWN conversation and asserts they read zero", () => {
    const harness = read("scripts/rls/isolation.sql");
    expect(harness).toContain("staff_internal");
    expect(harness).toMatch(/a member NEVER reads a staff_internal message/);
    // Both directions: 0 for the member, 1 for staff. A test that only checks the member could
    // pass against a policy that hides the note from everybody.
    const at = harness.indexOf("a member NEVER reads a staff_internal message");
    const block = harness.slice(at, at + 800);
    expect(block).toMatch(/= 0/);
    expect(block).toMatch(/= 1/);
  });
});
