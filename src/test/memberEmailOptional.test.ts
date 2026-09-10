// @vitest-environment node
//
// D-19 item 3: `members.email` becomes optional, and gets an OWNER.
//
// `email TEXT NOT NULL UNIQUE` was the single biggest reason one of Lee's clients landed as a
// CRM contact rather than a member — most of them have no email at all. The import worked around
// it by inventing plus-tagged addresses (`mary+john@…`) so a second row could claim a shared one:
// addresses nobody reads, on the column the platform treats as the way to reach the member.
//
// THE WORST OUTCOME THIS PREVENTS, and the reason the owner column exists rather than just
// dropping NOT NULL: one daughter looking after both her parents gives the same address on both
// rows. Keyed on email, the second row would MATCH THE FIRST and the import would patch her
// father's details onto her mother's record — one member where there are two, with one set of
// emergency contacts and one pendant between them. An SOS from the other pendant then resolves
// to a person it is not.
//
// The database half — the partial unique index, the CHECK, the dropped NOT NULL — is exercised
// against real PostgreSQL 16; see the migration test below for what is pinned in the file, and
// the PR body for the six behaviours run against a live cluster.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv, emailOwnerFromText, resolveSharedEmails } from "../lib/iceCrmImport";
import { planRowWrites, dedupeKeysFor } from "../lib/crmImportWriter";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const FILE = "20260910170000_member_email_optional.sql";
const sqlWithComments = readFileSync(join(MIGRATIONS, FILE), "utf8");
/**
 * THE STATEMENTS, WITHOUT THE COMMENTS — and this is not tidiness.
 *
 * The first version of these tests matched the whole file, and two mutants survived because of
 * it: changing the real `CREATE UNIQUE INDEX` to drop the owner predicate, and changing it to be
 * case-sensitive again, both left the header comment (which quotes the intended index) matching.
 * A test that reads the prose about the code passes whatever the code does.
 */
const sql = sqlWithComments.replace(/^\s*--.*$/gm, "");
const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const mapped = mapIceCsv(readFileSync(FIXTURE, "utf8"));
const plans = mapped.map(planRowWrites);
const byId = (id: string) => {
  const p = plans.find((x) => x.sourceId === id);
  if (!p) throw new Error(`no plan for ${id}`);
  return p;
};

describe("no email no longer means no member", () => {
  it("has rows with no email at all", () => {
    // Guards everything below from passing over an empty set.
    expect(plans.filter((p) => p.parsedMember.email === null).length).toBeGreaterThan(0);
  });

  it("makes a member of a row with no email, given everything else", () => {
    const p = byId("9002"); // no email; a name, a phone, a DD/MM birthday and a full address
    expect(p.outcome).toBe("member");
    expect(p.member?.email).toBeNull();
    expect(p.blockers).toEqual([]);
  });

  it("no longer lists 'no email' as a reason for anything", () => {
    for (const p of plans) {
      expect(p.blockers.join("; ")).not.toContain("no email");
    }
  });

  it("still refuses a member with no date of birth", () => {
    // The list did not become empty — it lost one entry. 9008's Birthday is unreadable and `Dob`
    // is only a fallback for a BLANK Birthday, so this row genuinely cannot be a member.
    const p = byId("9008");
    expect(p.outcome).toBe("crm_contact");
    expect(p.blockers).toContain("no date of birth");
  });

  it("invents no address to fill the column", () => {
    // The plus-tag workaround is gone: no `+` local part, anywhere.
    const emails = plans.map((p) => p.parsedMember.email).filter(Boolean) as string[];
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) expect(e.split("@")[0]).not.toContain("+");
  });
});

describe("a carer's address is marked, not mangled", () => {
  it("marks BOTH rows that share an address, not just the second", () => {
    // The first row to appear is not more entitled to it. If two members share an address, it is
    // nobody's login.
    expect(byId("9009").parsedMember.email).toBe("daughter@example.com");
    expect(byId("9010").parsedMember.email).toBe("daughter@example.com");
    expect(byId("9009").parsedMember.email_owner).toBe("carer");
    expect(byId("9010").parsedMember.email_owner).toBe("carer");
  });

  it("makes members of both of them", () => {
    // Lee's case, stated as a test: a carer email shared by two members, and both become members.
    expect(byId("9009").outcome).toBe("member");
    expect(byId("9010").outcome).toBe("member");
  });

  it("says so in a warning a human can act on", () => {
    expect(byId("9009").warnings.join(" ")).toMatch(/appears on more than one row/);
  });

  it("leaves a unique address owned by the member", () => {
    expect(byId("9006").parsedMember.email_owner).toBe("member");
  });

  it("reads the row's own words when the address is unique in the file", () => {
    for (const hint of [
      "daughter's email", "use her carer", "pays for mum", "son handles it",
      "next of kin", "hija", "vecina", "power of attorney",
    ]) {
      expect(emailOwnerFromText(hint), `"${hint}" should read as somebody else's`).toBe("carer");
    }
  });

  it("does not see a carer in ordinary notes", () => {
    for (const plain of ["", "deaf, text first", "keeps a dog", "prefers Spanish", "Mrs Jones"]) {
      expect(emailOwnerFromText(plain), `"${plain}" is not a carer hint`).toBeNull();
    }
  });

  it("is case-insensitive about a shared address", () => {
    // `Mary@Example.com` and `mary@example.com` are one address, and the old UNIQUE constraint
    // was case-SENSITIVE — so the uniqueness it promised was never what anybody assumed.
    const rows = resolveSharedEmails([
      { ...mapped[0], member: { ...mapped[0].member, email: "Shared@Example.COM", email_owner: "member" } },
      { ...mapped[1], member: { ...mapped[1].member, email: "shared@example.com", email_owner: "member" } },
    ]);
    expect(rows[0].member.email_owner).toBe("carer");
    expect(rows[1].member.email_owner).toBe("carer");
  });
});

describe("the dedupe key", () => {
  it("uses an address the member owns", () => {
    expect(dedupeKeysFor(byId("9006")).email).toBe("david.evans@example.com");
  });

  it("NEVER uses a carer's address — the two parents cannot collapse into one member", () => {
    // The load-bearing assertion of this whole PR. Keyed on email, the second parent would match
    // the first and be patched onto their record.
    expect(dedupeKeysFor(byId("9009")).email).toBeNull();
    expect(dedupeKeysFor(byId("9010")).email).toBeNull();
    // And they are still distinguishable, by the key that is genuinely theirs.
    expect(dedupeKeysFor(byId("9009")).phone).not.toBe(dedupeKeysFor(byId("9010")).phone);
  });

  it("still has NIE first, then own email, then phone", () => {
    const keys = dedupeKeysFor(byId("9006"));
    expect(keys.nie).toBe("Y7654321X");
    expect(keys.email).toBe("david.evans@example.com");
    expect(keys.phone).toBe("+34655666777");
  });
});

describe("the migration", () => {
  it("exists exactly once", () => {
    expect(readdirSync(MIGRATIONS).filter((f) => f.includes("member_email_optional"))).toEqual([FILE]);
  });

  it("drops NOT NULL", () => {
    expect(sql).toMatch(/ALTER TABLE public\.members ALTER COLUMN email DROP NOT NULL/);
  });

  it("replaces the blanket UNIQUE rather than leaving it alongside", () => {
    // Two uniqueness rules on one column is two answers to "may these rows coexist", and the
    // stricter one silently wins.
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS members_email_key/);
  });

  it("makes the new index partial, case-insensitive, and member-owned only", () => {
    /* Asserted as ONE statement, not three separate matches against the file.
       The three-match version let a mutant through: there are TWO indexes on `lower(email)`
       here — the partial unique one and the non-unique search one — so changing the unique
       index to `(email)` still matched the other index's line and the test passed. */
    const stmt = sql.match(
      /CREATE UNIQUE INDEX IF NOT EXISTS members_member_email_unique_idx[\s\S]*?;/
    );
    expect(stmt, "no unique index statement in the migration").toBeTruthy();
    expect(stmt![0]).toMatch(/ON public\.members \(lower\(email\)\)/);
    expect(stmt![0]).toMatch(/WHERE email IS NOT NULL AND email_owner = 'member'/);
  });

  it("constrains the owner to the four values and defaults to member", () => {
    expect(sql).toMatch(/CHECK \(email_owner IN \('member', 'carer', 'payer', 'family'\)\)/);
    // A default of carer would quietly exempt real addresses from the unique index.
    expect(sql).toMatch(/email_owner text NOT NULL DEFAULT 'member'/);
  });

  it("keeps a non-unique index for searching on any address", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS members_email_lower_idx/);
  });

  it("says in its rollback that NOT NULL cannot simply be restored", () => {
    // Deliberately the un-stripped text: a rollback note IS a comment.
    expect(sqlWithComments).toMatch(/ROLLBACK:/);
    expect(sqlWithComments).toMatch(/Restoring NOT NULL requires every NULL to be given an address/);
  });
});

describe("the paths that send email", () => {
  const post = readFileSync(join(process.cwd(), "supabase/functions/_shared/post-payment.ts"), "utf8");

  it("does not try to make a login for a member with no address", () => {
    // Written for staff-created members and already defensive — pinned here so it stays that
    // way now that NULL is the normal case rather than the impossible one.
    expect(post).toMatch(/if \(!person\?\.email\)/);
  });

  it("sends the welcome email only when there is somewhere to send it", () => {
    expect(post).toMatch(/if \(memberData\?\.email\) \{/);
  });
});
