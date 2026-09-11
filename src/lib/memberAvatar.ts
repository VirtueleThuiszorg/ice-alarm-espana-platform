/**
 * THE MEMBER'S OWN PHOTOGRAPH — the path, the limits, and the arithmetic, all in one place and
 * none of it touching a browser API.
 *
 * `members.photo_url` has existed since the very first migration (20260121143325) and nothing
 * has ever written it. The Profile page rendered an avatar of initials and, underneath, the one
 * sentence MEMBER_UX_RULES R6 explicitly bans: *"contact support to change"*. R7 asks for the
 * opposite — *"Members upload their own photo (Supabase storage, size-limited, RLS: own bucket
 * path)"*.
 *
 * WHY THE ARITHMETIC IS HERE RATHER THAN IN THE COMPONENT. Resizing needs a `<canvas>`, which
 * jsdom does not implement, so a resize written inline in a component is a resize no test can
 * reach. The DECISIONS — how big, which format, when to stop compressing, whether a file is
 * even acceptable — are pure functions with no DOM in them, and `memberAvatar.test.ts` presses
 * every one. What is left in the browser wrapper is `drawImage` and `toBlob`.
 */

/** The bucket. Private, and created with its policies in 20260910150000. */
export const MEMBER_AVATAR_BUCKET = "member-avatars";

/**
 * THE LONGEST EDGE, in pixels. R7 says size-limited; 512 is the largest this is ever displayed
 * at (the Profile card's 128px avatar on a 2× screen is 256, and the staff record's is smaller),
 * so anything above it is bytes nobody sees.
 */
export const MAX_AVATAR_EDGE = 512;

/** The target after compression. The bucket refuses at 512 KB — see `imageQualityLadder`. */
export const MAX_AVATAR_BYTES = 300 * 1024;

/**
 * What a phone camera will hand us. `image/heic` is deliberately absent: an iPhone's native
 * format cannot be decoded by `drawImage` in most browsers, and accepting it would produce a
 * blank photograph rather than an error. Safari converts to JPEG when the input's `accept`
 * excludes HEIC, which is why the list is also what the file input advertises.
 */
export const ACCEPTED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** What we UPLOAD, which is not the same list. The bucket's `allowed_mime_types` matches this. */
export const UPLOAD_AVATAR_TYPES = ["image/webp", "image/jpeg"] as const;
export type UploadAvatarType = (typeof UPLOAD_AVATAR_TYPES)[number];

/**
 * A HARD CEILING ON WHAT WE WILL EVEN OPEN. 20 MB is a generous modern phone photo; beyond that
 * something is wrong, and decoding it into a canvas on a five-year-old Android is how a member's
 * browser tab dies while they are trying to add their picture. Refusing with a sentence is
 * kinder than a crash.
 */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export type AvatarRejection = "type" | "tooLarge";

/** Is this file worth trying to resize? `null` means yes. */
export function rejectAvatarFile(file: { type: string; size: number }): AvatarRejection | null {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type as (typeof ACCEPTED_AVATAR_TYPES)[number])) {
    return "type";
  }
  if (file.size > MAX_SOURCE_BYTES) return "tooLarge";
  return null;
}

/**
 * The dimensions to draw at, preserving aspect ratio and never ENLARGING.
 *
 * Upscaling a 200px photo to 512 makes it blurrier and the file bigger — two costs and no
 * benefit — so a picture already inside the limit is left exactly as it is.
 *
 * Rounded, and floored at 1: a 3000×2 panorama scales to 512×0.34, and a canvas of height 0
 * throws `IndexSizeError` rather than producing a small image.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_AVATAR_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * THE QUALITY LADDER. Encode, measure, and if it is still too big, encode again lower.
 *
 * WHY A LADDER AND NOT ONE CLEVER NUMBER. The bytes an encoder produces depend on the picture:
 * a face against a plain wall compresses to a tenth of what a garden does at the same quality.
 * A single fixed quality therefore either wastes bytes on the easy pictures or overshoots the
 * limit on the hard ones — and overshooting means the upload is REFUSED BY THE BUCKET, which
 * reaches the member as an opaque storage error on the one screen where they were trying to do
 * something nice.
 *
 * It stops at 0.5. Below that a photograph of a person is visibly mushy, and a member whose
 * picture looks bad will assume the product is bad. If 0.5 at 512px is still over 300 KB the
 * caller falls back to a smaller edge rather than a worse quality — see `nextAvatarEdge`.
 */
export const AVATAR_QUALITY_LADDER = [0.82, 0.72, 0.62, 0.5] as const;

/**
 * If even the bottom of the ladder is too big, shrink the picture instead of degrading it
 * further. `null` when there is nowhere sensible left to go — 128px is the smallest this is ever
 * shown at, and a member is better served by an honest failure than by a thumbnail.
 */
export function nextAvatarEdge(edge: number): number | null {
  if (edge > 384) return 384;
  if (edge > 256) return 256;
  if (edge > 128) return 128;
  return null;
}

/**
 * WHERE THE OBJECT LIVES, and this string IS the security model.
 *
 * Every policy in 20260910150000 compares `(storage.foldername(name))[1]` against the caller's
 * own `members.id`. So the first segment must be exactly the member id and nothing else — no
 * prefix, no nesting, no folder per year. A path built any other way is refused, which is the
 * correct outcome and an unhelpful one to debug, so it is built here once.
 *
 * THE FILENAME CHANGES ON EVERY UPLOAD. It used to be tempting to write `<id>/avatar.webp` and
 * upsert: one object per member, tidy. But a signed URL is issued against a path, and browsers
 * and CDNs cache by URL — so replacing the object under the same name shows the member their OLD
 * photograph until the cache expires, which reads as "the upload did not work". A new name per
 * upload cannot be stale. `removeMemberAvatar` deletes the previous object, so the tidiness is
 * kept without the staleness.
 */
export function memberAvatarPath(
  memberId: string,
  type: UploadAvatarType,
  now: number = Date.now(),
): string {
  const extension = type === "image/webp" ? "webp" : "jpg";
  return `${memberId}/${now}.${extension}`;
}

/** Is this stored path inside the given member's own folder? */
export function isOwnAvatarPath(path: string, memberId: string): boolean {
  const [folder, ...rest] = path.split("/");
  return folder === memberId && rest.length === 1 && rest[0].length > 0;
}

/**
 * The value written to `members.photo_url`: the object PATH, not a URL.
 *
 * WHY NOT A URL. The bucket is private, so the only URL that works is a signed one, and a signed
 * URL expires. Storing one would put a dead link in the column within the hour and make the
 * staff record show a broken image — and, worse, a signed URL in a database row is a credential
 * at rest. The path is stable, means nothing to anyone without a policy that admits them, and
 * `useMemberAvatar` signs it on demand.
 *
 * THE COLUMN THEREFORE HOLDS TWO SHAPES. Rows imported from the old CRM may hold an absolute
 * `https://…` URL; anything this code writes is a path. `avatarUrlIsPath` is how a reader tells
 * them apart, so an imported photo keeps working instead of being signed as if it were a path
 * and rendering as nothing.
 */
export function avatarUrlIsPath(value: string | null | undefined): boolean {
  if (!value) return false;
  return !/^(https?:)?\/\//i.test(value) && !value.startsWith("data:");
}

/** How long a signed URL lasts. Long enough to read a page, short enough to be worth signing. */
export const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
