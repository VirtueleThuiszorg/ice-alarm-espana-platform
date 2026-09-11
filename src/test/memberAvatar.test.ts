/**
 * THE MEMBER'S OWN PHOTOGRAPH — the arithmetic, the path, and the two shapes the column holds.
 *
 * MEMBER_UX_RULES R7: *"Members upload their own photo (Supabase storage, size-limited, RLS: own
 * bucket path). "* `members.photo_url` has existed since the very first migration
 * (20260121143325) and nothing has ever written it: the Profile page showed initials over the
 * one sentence R6 explicitly bans — *"contact support to change"* — above a column no support
 * call could have filled either.
 *
 * WHAT IS PROVED WHERE, because this feature spans three places that can each fail alone:
 *
 *   - THE POLICIES are proved by `scripts/rls/isolation.sql`, against real PostgreSQL: member A
 *     cannot read, overwrite, move into or delete from member B's folder; staff can read and
 *     cannot delete. A unit test cannot ask a policy anything.
 *   - THE BROWSER HALF (`resizeImage.ts`) cannot be unit tested at all — jsdom implements
 *     neither canvas nor `createImageBitmap` — which is exactly why every DECISION was pulled
 *     out of it into `memberAvatar.ts`. This file presses those.
 *   - THE MIGRATION is asserted below as text, because "the bucket is private" is a claim about
 *     a file that CI applies but this process does not.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ACCEPTED_AVATAR_TYPES,
  AVATAR_QUALITY_LADDER,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_EDGE,
  MAX_SOURCE_BYTES,
  MEMBER_AVATAR_BUCKET,
  UPLOAD_AVATAR_TYPES,
  avatarUrlIsPath,
  fitWithin,
  isOwnAvatarPath,
  memberAvatarPath,
  nextAvatarEdge,
  rejectAvatarFile,
} from "@/lib/memberAvatar";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function migration(): string {
  const dir = join(ROOT, "supabase/migrations");
  const f = readdirSync(dir).find((m) => m.includes("member_avatars_bucket"));
  expect(f, "the bucket migration must exist").toBeDefined();
  return readFileSync(join(dir, f!), "utf8");
}

// ── the size the picture is drawn at ───────────────────────────────────────
describe("fitting a photograph inside the limit", () => {
  it("scales the LONGEST edge to 512 and keeps the aspect ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 512, height: 384 });
    // Portrait: the same rule, the other way up. A phone photo is usually this one.
    expect(fitWithin(3024, 4032)).toEqual({ width: 384, height: 512 });
  });

  it("NEVER ENLARGES a picture that is already small enough", () => {
    /*
      Upscaling a 200px photo to 512 makes it blurrier AND the file bigger — two costs and no
      benefit. A `scale = max/longest` written without this guard does exactly that.
    */
    expect(fitWithin(200, 150)).toEqual({ width: 200, height: 150 });
    expect(fitWithin(512, 512)).toEqual({ width: 512, height: 512 });
    expect(fitWithin(511, 300)).toEqual({ width: 511, height: 300 });
  });

  it("never produces a zero dimension — a canvas of height 0 throws", () => {
    // A 3000×2 panorama scales to 512×0.34. `IndexSizeError` is not a photograph.
    expect(fitWithin(3000, 2)).toEqual({ width: 512, height: 1 });
    expect(fitWithin(2, 3000)).toEqual({ width: 1, height: 512 });
  });

  it("survives a degenerate source rather than dividing by zero", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
    expect(fitWithin(-10, 20)).toEqual({ width: 1, height: 1 });
  });

  it("honours a smaller edge when the ladder falls back to one", () => {
    expect(fitWithin(4032, 3024, 256)).toEqual({ width: 256, height: 192 });
  });
});

// ── the quality ladder ─────────────────────────────────────────────────────
describe("the quality ladder", () => {
  it("descends, and stops before a face turns to mush", () => {
    /*
      A single fixed quality either wastes bytes on the easy pictures (a face against a plain
      wall) or overshoots the limit on the hard ones (a garden) — and overshooting means the
      BUCKET refuses the upload, which reaches the member as an opaque storage error.

      It stops at 0.5 because below that a photograph of a person is visibly mushy, and a member
      whose picture looks bad will assume the product is bad. Past the bottom, the caller
      shrinks instead.
    */
    expect(AVATAR_QUALITY_LADDER.length).toBeGreaterThan(1);
    const rungs = [...AVATAR_QUALITY_LADDER];
    expect(rungs).toEqual([...rungs].sort((a, b) => b - a));
    expect(Math.min(...rungs)).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...rungs)).toBeLessThanOrEqual(0.9);
  });

  it("falls back to a smaller edge, and eventually gives up", () => {
    expect(nextAvatarEdge(512)).toBe(384);
    expect(nextAvatarEdge(384)).toBe(256);
    expect(nextAvatarEdge(256)).toBe(128);
    // 128 is the smallest this is ever shown at. A member is better served by an honest failure
    // than by a thumbnail of their own face.
    expect(nextAvatarEdge(128)).toBeNull();
  });

  it("the fallback terminates — no edge loops forever", () => {
    let edge: number | null = MAX_AVATAR_EDGE;
    let steps = 0;
    while (edge !== null && steps < 20) {
      const next: number | null = nextAvatarEdge(edge);
      if (next !== null) expect(next).toBeLessThan(edge);
      edge = next;
      steps++;
    }
    expect(edge, "the ladder must end").toBeNull();
  });

  it("WebP is tried before JPEG", () => {
    // A face at 512px is roughly a third smaller as WebP at matched quality, which is the
    // difference between one encode and three on a phone.
    expect(UPLOAD_AVATAR_TYPES[0]).toBe("image/webp");
    expect(UPLOAD_AVATAR_TYPES).toContain("image/jpeg");
  });
});

// ── what we refuse to open ─────────────────────────────────────────────────
describe("which files are even attempted", () => {
  it("accepts the three a phone or a laptop will offer", () => {
    for (const type of ACCEPTED_AVATAR_TYPES) {
      expect(rejectAvatarFile({ type, size: 1_000_000 }), type).toBeNull();
    }
  });

  it("refuses HEIC by name rather than failing to decode it", () => {
    /*
      An iPhone's native format cannot be decoded by `drawImage` in most browsers. Accepting it
      would produce a BLANK photograph rather than an error — and because `accept` excludes it,
      Safari converts to JPEG on the way out of the picker, so the member never meets this.
    */
    expect(rejectAvatarFile({ type: "image/heic", size: 1000 })).toBe("type");
    expect(ACCEPTED_AVATAR_TYPES).not.toContain("image/heic" as never);
  });

  it("refuses a PDF, an SVG and a video", () => {
    for (const type of ["application/pdf", "image/svg+xml", "video/mp4", ""]) {
      expect(rejectAvatarFile({ type, size: 1000 }), type).toBe("type");
    }
  });

  it("refuses something absurdly large before decoding it", () => {
    // Decoding a 60 MB image into a canvas on a five-year-old Android kills the tab, and the
    // member reads that as "the site is broken", not "that photo was too big".
    expect(rejectAvatarFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 })).toBe("tooLarge");
    expect(rejectAvatarFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES })).toBeNull();
  });

  it("the source ceiling is far above the upload ceiling, on purpose", () => {
    // The member picks a normal phone photo (2-8 MB) and we make it small. Refusing at 300 KB
    // on the way IN would refuse every real photograph.
    expect(MAX_SOURCE_BYTES).toBeGreaterThan(MAX_AVATAR_BYTES * 20);
  });
});

// ── the path, which IS the security model ──────────────────────────────────
describe("where the object goes", () => {
  const MEMBER = "aaaaaaaa-0000-0000-0000-000000000001";

  it("the FIRST path segment is the member id, and nothing else", () => {
    /*
      Every policy in the migration compares `(storage.foldername(name))[1]` against the
      caller's own `members.id`. A prefix, a nesting, or a folder-per-year would be refused —
      correctly, and unhelpfully to debug — so the path is built in one place.
    */
    const path = memberAvatarPath(MEMBER, "image/webp", 1_700_000_000_000);
    expect(path.split("/")[0]).toBe(MEMBER);
    expect(path.split("/")).toHaveLength(2);
  });

  it("uses the extension the type actually is", () => {
    expect(memberAvatarPath(MEMBER, "image/webp", 1)).toBe(`${MEMBER}/1.webp`);
    expect(memberAvatarPath(MEMBER, "image/jpeg", 1)).toBe(`${MEMBER}/1.jpg`);
  });

  it("the FILENAME CHANGES on every upload — a stable name serves a stale photo", () => {
    /*
      `<id>/avatar.webp` + upsert is tidier and wrong: a signed URL is issued against a path,
      and browsers and CDNs cache by URL, so replacing the object under the same name shows the
      member their OLD photograph until the cache expires. That reads as "the upload did not
      work". The previous object is deleted by the hook, so tidiness survives without staleness.
    */
    const a = memberAvatarPath(MEMBER, "image/webp", 1_700_000_000_000);
    const b = memberAvatarPath(MEMBER, "image/webp", 1_700_000_000_001);
    expect(a).not.toBe(b);
  });

  it("recognises its own folder, and only its own", () => {
    expect(isOwnAvatarPath(`${MEMBER}/1.webp`, MEMBER)).toBe(true);
    expect(isOwnAvatarPath("bbbbbbbb-0000-0000-0000-000000000002/1.webp", MEMBER)).toBe(false);
    // No nesting: a deeper path would put the id somewhere the policy does not look.
    expect(isOwnAvatarPath(`${MEMBER}/2026/1.webp`, MEMBER)).toBe(false);
    expect(isOwnAvatarPath(MEMBER, MEMBER)).toBe(false);
    expect(isOwnAvatarPath(`${MEMBER}/`, MEMBER)).toBe(false);
  });
});

// ── the two shapes the column holds ────────────────────────────────────────
describe("photo_url holds a path OR an absolute URL, and readers must tell them apart", () => {
  it("a stored object path is a path", () => {
    expect(avatarUrlIsPath("aaaaaaaa-0000-0000-0000-000000000001/1.webp")).toBe(true);
  });

  it("a CRM-imported absolute URL is NOT", () => {
    /*
      Rows imported from the old CRM carry `https://…`. Signing one as if it were a path
      produces nonsense and the imported photo silently disappears from the staff record — so
      the reader passes it through untouched instead.
    */
    for (const url of [
      "https://example.test/photo.jpg",
      "http://example.test/photo.jpg",
      "//example.test/photo.jpg",
      "data:image/png;base64,AAAA",
    ]) {
      expect(avatarUrlIsPath(url), url).toBe(false);
    }
  });

  it("absent is neither", () => {
    expect(avatarUrlIsPath(null)).toBe(false);
    expect(avatarUrlIsPath(undefined)).toBe(false);
    expect(avatarUrlIsPath("")).toBe(false);
  });

  it("nothing writes a SIGNED URL into the column", () => {
    /*
      A signed URL in a database row is two defects: a dead link within the hour, and a
      credential at rest. The hook writes `path` and nothing else, and this reads the code
      because the failure would look fine for about fifty minutes.
    */
    const hook = read("src/hooks/useMemberAvatar.ts");
    expect(hook).toMatch(/\.update\(\{ photo_url: path \}\)/);
    expect(hook).not.toMatch(/photo_url:\s*(data\??\.)?signedUrl/);
  });

  it("the upload write touches ONE column, so the client-write sweep stays honest", () => {
    // `members` is a sensitive table with a member self-UPDATE policy and a guard trigger on
    // `status`. A payload carrying anything more would be a new client-side sensitive write.
    const hook = read("src/hooks/useMemberAvatar.ts");
    const updates = hook.match(/\.update\(\{[^}]*\}\)/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) {
      expect(update, `${update} writes more than photo_url`).toMatch(/^\.update\(\{ photo_url: [^,}]+ \}\)$/);
    }
  });
});

// ── the bucket ─────────────────────────────────────────────────────────────
describe("the migration", () => {
  it("creates the bucket PRIVATE", () => {
    /*
      The other ten buckets in this project are public, and rightly: website images, agent
      avatars, marketing decks. This one holds photographs of vulnerable people at their home
      addresses, and a public bucket serves any object to anyone holding its path — which a
      member id is not a secret enough to prevent.
    */
    const sql = migration();
    expect(sql).toContain(`'${MEMBER_AVATAR_BUCKET}'`);
    expect(sql).toMatch(/public,\s*file_size_limit/);
    expect(sql).toMatch(/false,\s*\n?\s*524288/);
  });

  it("re-applies as PRIVATE rather than inheriting whatever was there", () => {
    // If a bucket of this name already exists from an experiment it may be public, and
    // `ON CONFLICT DO NOTHING` would inherit that — publishing every member's photograph. This
    // is the one setting where "leave what is there" is the wrong default.
    expect(migration()).toMatch(/ON CONFLICT \(id\) DO UPDATE[\s\S]{0,120}SET public = false/);
  });

  it("restricts the mime types at the SERVER, not only in the browser", () => {
    const sql = migration();
    expect(sql).toMatch(/allowed_mime_types/);
    expect(sql).toContain("'image/jpeg'");
    expect(sql).toContain("'image/webp'");
    // A client-side limit is a limit anybody with the anon key can skip.
    expect(sql).not.toContain("'image/svg+xml'");
  });

  it("the server ceiling is ABOVE the client target, so encoder variance is not a failure", () => {
    // A ceiling set to exactly 300 KB turns a few bytes of variance into a refused upload, and
    // the member cannot tell that from "photos do not work".
    expect(524288).toBeGreaterThan(MAX_AVATAR_BYTES);
  });

  it("scopes every member policy to the first path segment", () => {
    const sql = migration();
    const memberPolicies = [
      "Members upload own avatar",
      "Members read own avatar",
      "Members update own avatar",
      "Members delete own avatar",
    ];
    for (const name of memberPolicies) {
      expect(sql, `${name} must exist`).toContain(`"${name}"`);
    }
    // Four member policies, each comparing folder[1] to the caller's own member id.
    const scoped = sql.match(/\(storage\.foldername\(name\)\)\[1\] IN \(\s*SELECT id::text FROM public\.members WHERE user_id = auth\.uid\(\)/g) ?? [];
    expect(scoped.length, "one per member policy, and UPDATE needs two").toBeGreaterThanOrEqual(5);
  });

  it("the UPDATE policy has BOTH `USING` and `WITH CHECK`", () => {
    /*
      THE SUBTLE ONE. `USING` decides which row may be changed; `WITH CHECK` decides what it may
      become. With only `USING`, an update could MOVE an object into another member's folder —
      the row being changed IS the caller's own, so `USING` is satisfied, and nothing then
      constrains the new `name`. `isolation.sql` presses this against real PostgreSQL.
    */
    const sql = migration();
    // Anchored on CREATE, not on the policy NAME: the file drops all five policies first so it
    // re-applies cleanly, and slicing from the name lands on the DROP line — which contains
    // neither clause and would fail for the wrong reason.
    const update = sql.slice(
      sql.indexOf('CREATE POLICY "Members update own avatar"'),
      sql.indexOf('CREATE POLICY "Members delete own avatar"'),
    );
    expect(update).toMatch(/USING \(/);
    expect(update).toMatch(/WITH CHECK \(/);
  });

  it("staff get SELECT and nothing else", () => {
    // Staff can already change almost everything on a member's record. A member's photograph of
    // themselves is not one of those things, and the ABSENCE of the other policies is the
    // enforcement rather than a convention.
    const sql = migration();
    const staff = sql.slice(sql.indexOf('CREATE POLICY "Staff read member avatars"'));
    expect(staff).toMatch(/FOR SELECT/);
    // Everything after this CREATE is the staff policy and the reversal comment, so a stray
    // grant to staff shows up here.
    expect(staff).not.toMatch(/CREATE POLICY[\s\S]*FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it("says how to reverse itself", () => {
    const sql = migration();
    expect(sql).toMatch(/TO REVERSE/);
    // The objects have to go before the bucket — `storage.objects.bucket_id` references it.
    expect(sql).toMatch(/DELETE FROM storage\.objects[\s\S]*DELETE FROM storage\.buckets/);
  });
});

// ── and the sentence R6 bans is gone ───────────────────────────────────────
describe("R6's banned sentence", () => {
  it("is gone from the Profile page and from all three locales", () => {
    /*
      *"Never 'contact support to change'."* It sat under an avatar of initials, above a column
      no support call could have filled — the page apologised for a missing feature and then
      pointed at a route that did not exist either.
    */
    expect(read("src/pages/client/ProfilePage.tsx")).not.toContain("contactSupportToChange");
    for (const locale of ["en", "es", "nl"]) {
      const json = JSON.parse(read(`src/i18n/locales/${locale}.json`)) as {
        profile: Record<string, string>;
      };
      expect(json.profile, locale).not.toHaveProperty("contactSupportToChange");
    }
  });

  it("the photo card is a `manage` card — there is nothing to Save", () => {
    // Choosing a file uploads it and points the record at it in one go, so a Save here would be
    // a button that saves nothing: the same lie as an Edit that unlocks nothing.
    const page = read("src/pages/client/ProfilePage.tsx");
    const card = page.slice(page.indexOf('testId="profile-card-photo"'));
    expect(card.slice(0, 400)).toContain('mode="manage"');
  });

  it("the portal header and the staff record both SIGN the path", () => {
    // The header passed nothing at all before, and the staff record passed `photo_url` straight
    // to `<AvatarImage src>` — which renders nothing for a private-bucket path.
    for (const file of [
      "src/components/layout/ClientLayout.tsx",
      "src/components/admin/member-detail/MemberHeader.tsx",
    ]) {
      expect(read(file), file).toContain("useMemberAvatarUrl");
    }
    expect(read("src/components/admin/member-detail/MemberHeader.tsx")).not.toMatch(
      /AvatarImage\s+src=\{member\.photo_url/,
    );
  });
});
