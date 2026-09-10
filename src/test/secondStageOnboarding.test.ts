/**
 * Item 6 — the second stage, and the account that makes it reachable.
 *
 * THE DEFECT THESE HOLD CLOSED (REVIEW_JOIN_PATH.md F6 — the safety-relevant one). The wizard
 * stopped collecting emergency contacts and medical data; they moved to a post-payment second
 * stage (ONBOARDING_SPLIT.md option B). But nothing on the payment path ever minted the token
 * that second stage needs, and nothing ever created an auth user, so a member who paid was
 * left with:
 *
 *   - no emergency contacts at all, so an operator answering their SOS had nobody to ring
 *   - `member_monitoring_readiness` unable to be true for them, ever
 *   - a welcome email saying "sign in to your dashboard" for an account that did not exist
 *   - a confirmation screen advising "add them yourself once you sign in" — advice nobody
 *     could follow
 *
 * The modules are driven for real against doubles. The two source-text blocks at the end cover
 * what execution cannot reach: an edge function body inside `serve()`, and a React screen whose
 * rendering is asserted by its own tests elsewhere.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* eslint-disable @typescript-eslint/no-explicit-any */
const STAGE_MOD = "../../supabase/functions/_shared/second-stage.ts";
const AUTH_MOD = "../../supabase/functions/_shared/member-auth.ts";

const { ensureSecondStageToken, secondStageLink, SECOND_STAGE_FIELDS, SECOND_STAGE_TOKEN_DAYS } =
  (await import(/* @vite-ignore */ STAGE_MOD)) as any;
const { ensureMemberAuthUser } = (await import(/* @vite-ignore */ AUTH_MOD)) as any;
/* eslint-enable @typescript-eslint/no-explicit-any */
import { requestedIncludesContacts, updateFormFields } from "@/lib/memberUpdateForm";
/* eslint-disable @typescript-eslint/no-explicit-any */

function code(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

type Write = { table: string; op: "insert" | "update"; payload: any; filters: [string, unknown][] };

/**
 * A recording double. Reads answer from a per-table script; writes are recorded with the
 * filters that were attached, so an assertion can be about what the code DID.
 */
function makeDb(reads: Record<string, unknown> = {}, writeErrors: Record<string, string> = {}) {
  const writes: Write[] = [];
  const db: any = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
        is: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
        gt: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
        in: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
        order: () => chain,
        limit: () => chain,
        insert: async (payload: any) => {
          writes.push({ table, op: "insert", payload, filters });
          return { error: writeErrors[table] ? { message: writeErrors[table] } : null };
        },
        update: (payload: any) => {
          writes.push({ table, op: "update", payload, filters });
          return chain;
        },
        maybeSingle: async () => (reads[table] ?? { data: null, error: null }),
        single: async () => (reads[table] ?? { data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          resolve(
            writeErrors[table]
              ? { data: null, error: { message: writeErrors[table] } }
              : (reads[table] ?? { data: null, error: null }),
          ),
      };
      return chain;
    },
  };
  return { db, writes };
}

const MEMBER = "11111111-1111-1111-1111-111111111111";

describe("the second-stage token is minted by the payment path", () => {
  it("mints one with issued_via post_payment and NO staff member", async () => {
    const { db, writes } = makeDb();
    const result = await ensureSecondStageToken(db, MEMBER);

    const insert = writes.find((w) => w.table === "member_update_tokens" && w.op === "insert")!;
    expect(insert, "no token was minted").toBeTruthy();
    // 20260908120200's CHECK enforces exactly this pairing: an automated token names no
    // operator, because that FK is ON DELETE SET NULL and a bare NULL would be ambiguous
    // between "automatic" and "issued by somebody who has since left".
    expect(insert.payload.issued_via).toBe("post_payment");
    expect(insert.payload.created_by).toBeNull();
    expect(insert.payload.member_id).toBe(MEMBER);
    expect(result.reused).toBe(false);
  });

  it("asks for contacts AND medical, and nothing the wizard already collected", async () => {
    const { db, writes } = makeDb();
    await ensureSecondStageToken(db, MEMBER);
    const fields: string[] = writes[0].payload.requested_fields;

    expect(fields).toContain("contacts_count");
    expect(fields).toContain("blood_type");
    expect(fields).toContain("medications");
    // The wizard already offers NIE/DNI, so asking again is asking twice.
    expect(fields).not.toContain("nie_dni");
  });

  it("uses the vocabulary MemberUpdatePage actually renders", () => {
    /*
      A typo here renders a form with a silently missing section rather than an error, which is
      how a member ends up submitting a "complete" second stage with no contacts on it.

      This was a substring scan of the page. The page is now driven from `memberUpdateForm.ts`
      — it no longer names any token itself — so the property is asserted by EXECUTION instead:
      every second-stage token must resolve to a control the member can actually answer. That
      is what the scan was standing in for, and it survives the page being rewritten again.
    */
    const rendered = updateFormFields([...SECOND_STAGE_FIELDS]).map((f) => f.key);
    for (const field of SECOND_STAGE_FIELDS) {
      if (field === "contacts_count" || field === "contacts_email") {
        expect(requestedIncludesContacts([field]), `"${field}" renders no contact editor`).toBe(
          true,
        );
        continue;
      }
      expect(rendered, `"${field}" renders no control`).toContain(field);
    }
  });

  it("is 64 hex characters of CSPRNG, like the staff-issued ones", async () => {
    const { db, writes } = makeDb();
    await ensureSecondStageToken(db, MEMBER);
    expect(writes[0].payload.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expires far enough out that the member is not told their link is invalid", async () => {
    // The staff flow uses 7 days and follows it up on a call the same week. This one is handed
    // to somebody at the end of a checkout; a link that has quietly expired is worse than a
    // long one, because they click it, are told it is invalid, and give up.
    expect(SECOND_STAGE_TOKEN_DAYS).toBeGreaterThanOrEqual(14);

    const { db, writes } = makeDb();
    await ensureSecondStageToken(db, MEMBER);
    const days = (new Date(writes[0].payload.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(SECOND_STAGE_TOKEN_DAYS - 1);
    expect(days).toBeLessThan(SECOND_STAGE_TOKEN_DAYS + 1);
  });

  it("REUSES an open token instead of minting a second — the webhook is retried", async () => {
    // Two live links for one member means the one the member kept may not be the one the
    // readiness queue is watching, and "was a link ever issued" stops having one answer.
    const { db, writes } = makeDb({
      member_update_tokens: { data: { token: "a".repeat(64), expires_at: "2027-01-01", used_at: null }, error: null },
    });
    const result = await ensureSecondStageToken(db, MEMBER);

    expect(result).toMatchObject({ token: "a".repeat(64), reused: true });
    expect(writes.filter((w) => w.op === "insert")).toHaveLength(0);
  });

  it("looks only for an UNUSED, UNEXPIRED, automated token when deciding to reuse", () => {
    // Asserted through the source: the reuse lookup is a READ, and the recording double
    // records writes — so driving it would prove nothing about the filters that were attached.
    const source = code("supabase/functions/_shared/second-stage.ts");
    expect(source).toMatch(/\.eq\("issued_via", "post_payment"\)/);
    expect(source).toMatch(/\.is\("used_at", null\)/);
    expect(source).toMatch(/\.gt\("expires_at", nowIso\)/);
  });

  it("returns null rather than throwing when the insert fails", async () => {
    // The caller is the payment path. A member who has paid must be activated whether or not
    // this succeeded; the paid-but-not-ready queue is what catches them.
    const { db } = makeDb({}, { member_update_tokens: "rls denied" });
    await expect(ensureSecondStageToken(db, MEMBER)).resolves.toBeNull();
  });

  it("builds a link MemberUpdatePage can read", () => {
    expect(secondStageLink("https://icealarm.es", "abc123")).toBe(
      "https://icealarm.es/member-update?token=abc123",
    );
    // A trailing slash on the setting must not produce a double slash.
    expect(secondStageLink("https://icealarm.es/", "abc123")).toBe(
      "https://icealarm.es/member-update?token=abc123",
    );
    expect(code("src/pages/MemberUpdatePage.tsx")).toMatch(/searchParams\.get\("token"\)/);
  });
});

describe("the paid member gets an account they can sign into", () => {
  const PARAMS = {
    memberId: MEMBER,
    email: "ana@example.com",
    firstName: "Ana",
    lastName: "Ruiz",
    language: "es",
    redirectTo: "https://icealarm.es/dashboard",
  };

  function withAuth(
    db: any,
    responses: Array<{ data?: any; error?: { message: string } }>,
  ) {
    const calls: any[] = [];
    let i = 0;
    db.auth = {
      admin: {
        generateLink: vi.fn(async (args: any) => {
          calls.push(args);
          return responses[Math.min(i++, responses.length - 1)];
        }),
      },
    };
    return calls;
  }

  it("creates the user, takes the link, and points members.user_id at it", async () => {
    const { db, writes } = makeDb();
    const calls = withAuth(db, [
      { data: { user: { id: "user-1" }, properties: { action_link: "https://magic" } } },
    ]);

    const result = await ensureMemberAuthUser(db, PARAMS);

    expect(result).toMatchObject({ userId: "user-1", actionLink: "https://magic", existed: false, error: null });
    // This is the write that turns every member-facing RLS policy on for this person.
    const link = writes.find((w) => w.table === "members" && w.op === "update")!;
    expect(link.payload).toEqual({ user_id: "user-1" });
    expect(link.filters).toContainEqual(["id", MEMBER]);
    expect(calls[0].type).toBe("invite");
  });

  it("sends no email of its own — generateLink returns the link, inviteUserByEmail would mail it", async () => {
    const source = code("supabase/functions/_shared/member-auth.ts");
    expect(source).toContain("generateLink");
    // Supabase's own template would arrive alongside ours, about the same event, in a locale
    // we do not control.
    expect(source).not.toContain("inviteUserByEmail");
    expect(source).not.toContain("sendEmail");
  });

  it("short-circuits when the member is already linked, but still mints a fresh link", async () => {
    // A retry must not create a second user; the welcome email still needs a CTA that works,
    // and the one from the first delivery has almost certainly expired.
    const { db, writes } = makeDb({ members: { data: { user_id: "user-existing" }, error: null } });
    const calls = withAuth(db, [
      { data: { user: { id: "user-existing" }, properties: { action_link: "https://fresh" } } },
    ]);

    const result = await ensureMemberAuthUser(db, PARAMS);

    expect(result).toMatchObject({ userId: "user-existing", actionLink: "https://fresh", existed: true });
    expect(calls[0].type).toBe("magiclink");
    expect(writes.filter((w) => w.table === "members")).toHaveLength(0);
  });

  it("falls back to a magic link when the email already has an account", async () => {
    // A partner in a couple can be an existing member's emergency contact who signed up
    // earlier, and households share an inbox often enough that iceCrmImport has a strategy
    // for it.
    const { db, writes } = makeDb();
    const calls = withAuth(db, [
      { error: { message: "A user with this email address has already been registered" } },
      { data: { user: { id: "user-old" }, properties: { action_link: "https://magic2" } } },
    ]);

    const result = await ensureMemberAuthUser(db, PARAMS);

    expect(result).toMatchObject({ userId: "user-old", actionLink: "https://magic2", existed: true });
    expect(calls.map((c) => c.type)).toEqual(["invite", "magiclink"]);
    // And the existing user is linked to this member row, or the member signs in and sees
    // nothing.
    expect(writes.find((w) => w.table === "members")!.payload).toEqual({ user_id: "user-old" });
  });

  it("reports a real invite failure instead of retrying it as a magic link", async () => {
    const { db } = makeDb();
    const calls = withAuth(db, [{ error: { message: "email address is invalid" } }]);

    const result = await ensureMemberAuthUser(db, PARAMS);
    expect(result.userId).toBeNull();
    expect(result.error).toMatch(/invalid/);
    // THE CALL COUNT IS THE ASSERTION. Checking only the message let a mutation that retried
    // EVERY invite error as a magic link pass: the retry failed the same way, so the same
    // message came back. Only one attempt is made, so a genuinely bad address is reported
    // rather than papered over with a second request.
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe("invite");
  });

  it("reports, rather than throws, when linking fails", async () => {
    const { db } = makeDb({}, { members: "rls denied" });
    withAuth(db, [{ data: { user: { id: "user-1" }, properties: { action_link: "https://magic" } } }]);

    const result = await ensureMemberAuthUser(db, PARAMS);
    expect(result.userId).toBe("user-1");
    expect(result.error).toMatch(/link failed/);
  });

  it("never throws even if the client does", async () => {
    const exploding: any = { from: () => { throw new Error("boom"); } };
    await expect(ensureMemberAuthUser(exploding, PARAMS)).resolves.toMatchObject({
      userId: null,
      error: "boom",
    });
  });

  it("logs no PII", () => {
    const source = code("supabase/functions/_shared/member-auth.ts");
    const logs = source.match(/console\.(log|warn|error)\([\s\S]{0,300}?\);/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line, line.slice(0, 70)).not.toMatch(/\$\{email\}|\bemail\b,/);
    }
  });
});

/**
 * These are source-POSITION checks, and they are the weaker half of the proof deliberately:
 * the ordering is also asserted BEHAVIOURALLY, from the recorded writes, in
 * `webhookActivationContract.test.ts` ("the second stage is set up by the payment path"). Both
 * are kept because they fail for different reasons — these when the code is reordered, those
 * when a reorder changes what actually reaches the database.
 */
describe("post-payment does the onboarding in the right order", () => {
  const source = code("supabase/functions/_shared/post-payment.ts");

  it("activates the member BEFORE onboarding them", () => {
    // A member who has paid must be activated whatever else fails.
    expect(source.indexOf('status: "active" })')).toBeLessThan(
      source.indexOf("ensureMemberAuthUser("),
    );
  });

  it("onboards BEFORE allocating a device and long before the emails", () => {
    // The token is the safety-relevant one: until it exists and is used, an operator
    // answering this person's SOS has nobody to ring.
    expect(source.indexOf("ensureSecondStageToken(")).toBeLessThan(
      source.indexOf('from("devices")'),
    );
    expect(source.indexOf("ensureSecondStageToken(")).toBeLessThan(
      source.indexOf("buildMemberWelcomeEmail("),
    );
  });

  it("onboards the partner too — one token each, not one per household", () => {
    expect(source).toMatch(/\[memberId, \.\.\.\(partnerMemberId \? \[partnerMemberId\] : \[\]\)\]/);
  });

  it("makes the welcome email CTA the sign-in link, not a bare /dashboard URL", () => {
    // It used to ask somebody who had never had an account — and, until this item, could not
    // have had one — to log in.
    expect(source).toMatch(/const dashboardUrl = primaryActionLink \?\?/);
    expect(source).not.toMatch(/const dashboardUrl = "https:\/\/icealarm\.es\/dashboard"/);
  });
});

describe("join-order-status hands out no token it should not", () => {
  const fn = code("supabase/functions/join-order-status/index.ts");

  it("is keyed on the Stripe session id, never on the order number", () => {
    // Order numbers are SEQUENTIAL (ICE-20260909-00007), so an endpoint keyed on one would
    // hand out other people's medical-form links to anybody counting upwards.
    expect(fn).toMatch(/SESSION_ID\.test\(sessionId\)/);
    expect(fn).toMatch(/\^cs_/);
    expect(fn).not.toMatch(/\.eq\("order_number"/);
  });

  it("validates the session id BEFORE it reaches a query", () => {
    expect(fn.indexOf("SESSION_ID.test(sessionId)")).toBeLessThan(fn.indexOf('.like("notes"'));
  });

  it("finds the session in payments.notes, which the payment path does not overwrite", () => {
    // `handleSuccessfulPayment` replaces `stripe_payment_id` with the PaymentIntent id, so the
    // column that looks like the right one stops matching at exactly the moment this endpoint
    // becomes useful.
    expect(fn).toMatch(/\.like\("notes"/);
    const postPayment = code("supabase/functions/_shared/post-payment.ts");
    const paymentUpdate = postPayment.slice(
      postPayment.indexOf("const paymentUpdate"),
      postPayment.indexOf('from("payments").update(paymentUpdate)'),
    );
    expect(paymentUpdate).not.toMatch(/notes/);
  });

  it("also verifies the match exactly, since _ is a LIKE wildcard", () => {
    expect(fn).toMatch(/p\.notes\?\.includes\(sessionId\)/);
  });

  it("returns links ONLY once the order is confirmed", () => {
    const beforeConfirmed = fn.slice(0, fn.indexOf("if (!confirmed)"));
    expect(beforeConfirmed).not.toMatch(/secondStageLink\(/);
    expect(fn.indexOf("if (!confirmed)")).toBeLessThan(fn.indexOf("secondStageLink("));
  });

  it("returns only unused, unexpired, automated tokens", () => {
    expect(fn).toMatch(/\.eq\("issued_via", "post_payment"\)/);
    expect(fn).toMatch(/\.is\("used_at", null\)/);
    expect(fn).toMatch(/\.gt\("expires_at"/);
  });

  it("is rate limited, because it is also how somebody would test session ids in bulk", () => {
    expect(fn).toMatch(/checkRateLimit\(getClientIp\(req\)/);
  });

  it("survives orders.partner_member_id not existing yet", () => {
    // It is in the held schema PR. The query stands alone so its failure costs the partner's
    // link rather than the primary's.
    expect(fn).toMatch(/partner_member_id/);
    expect(fn).toMatch(/if \(partnerError\)/);
  });
});

describe("the confirmation screen waits for the truth", () => {
  const step = code("src/components/join/steps/JoinConfirmationStep.tsx");
  const wizard = code("src/pages/join/JoinWizard.tsx");
  const checkout = code("supabase/functions/create-checkout/index.ts");

  it("Stripe is asked to hand the session id back", () => {
    expect(checkout).toContain("session_id={CHECKOUT_SESSION_ID}");
  });

  it("the wizard captures it before clearing the URL", () => {
    expect(wizard).toMatch(/searchParams\.get\("session_id"\)/);
    expect(wizard.indexOf('searchParams.get("session_id")')).toBeLessThan(
      wizard.indexOf('navigate("/join", { replace: true })'),
    );
    expect(wizard).toMatch(/stripeSessionId: sessionId/);
  });

  it("the screen polls instead of asserting success from a query parameter", () => {
    expect(step).toContain("useJoinOrderStatus");
    expect(step).toMatch(/order\.status === "polling"/);
    // The old unconditional claim.
    expect(step).toMatch(/confirmingPayment/);
  });

  it("shows the link only when the order is confirmed", () => {
    expect(step).toMatch(/order\.status === "confirmed" && order\.secondStage\.length > 0/);
  });

  it("still offers the phone route, and renders no number when there is none", () => {
    expect(step).toMatch(/phoneHref \?/);
    expect(step).toMatch(/oneThingLeftHowNoPhone/);
  });

  it("gives up rather than spinning for ever", () => {
    const hook = code("src/hooks/useJoinOrderStatus.ts");
    expect(hook).toMatch(/TIMEOUT_MS/);
    expect(hook).toMatch(/status: "timeout"/);
    // And it stops on unmount, or a poll outlives the screen.
    expect(hook).toMatch(/stopped\.current = true/);
    expect(hook).toMatch(/clearTimeout\(timer\)/);
  });
});
