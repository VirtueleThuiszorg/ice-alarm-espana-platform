-- THE MEMBER'S OWN PHOTO — a private bucket, and a member reaches exactly one folder in it.
--
-- WHY A PHOTO AT ALL. MEMBER_UX_RULES R7: *"Members upload their own photo (Supabase storage,
-- size-limited, RLS: own bucket path)."* `members.photo_url` has existed since the very first
-- migration (20260121143325) and NOTHING has ever written it: the member's Profile page rendered
-- an avatar with initials and, underneath, the sentence R6 explicitly bans — "contact support to
-- change". The column was a promise nothing kept.
--
-- WHY PRIVATE, WHEN EVERY OTHER BUCKET IN THIS PROJECT IS PUBLIC. The other ten are website
-- images, agent avatars, marketing decks and video exports — things whose whole purpose is to be
-- served to strangers. This one holds photographs of vulnerable people at their home addresses.
-- A public bucket serves any object to anyone who can guess or is given its path, and a member's
-- id is not a secret: it appears in staff URLs and in exports. So the bucket is private and every
-- read goes through a signed URL, which is short-lived and cannot be shared into a search index.
--
-- `staff-documents` (20260301135110) is the precedent and this file follows its shape
-- deliberately, including `storage.foldername(name))[1]` as the scoping mechanism.
--
-- THE PATH IS `<memberId>/<file>`, AND THAT IS THE WHOLE SECURITY MODEL. Every policy below
-- compares the first path segment against the caller's own `members.id`. A member who uploads to
-- somebody else's folder is refused by `WITH CHECK`; a member who asks for somebody else's object
-- gets no row from `USING`. There is no second mechanism and nothing in the client is trusted.

-- ── the bucket ─────────────────────────────────────────────────────────────
--
-- `public = false`. The two limits are enforced by storage itself rather than only by the
-- browser: the client resizes to ≤512px and re-encodes under 300 KB before uploading, but a
-- client-side limit is a limit anybody with the anon key can skip.
--
-- 512 KB, not 300 KB: the client aims for 300 and the server refuses at 512. A ceiling set to
-- exactly the client's target turns a few bytes of encoder variance into a failed upload, and
-- the member cannot tell that from "photos do not work".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'member-avatars',
  'member-avatars',
  false,
  524288,
  ARRAY['image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 524288,
      allowed_mime_types = ARRAY['image/jpeg', 'image/webp'];

-- ON CONFLICT DO UPDATE, not DO NOTHING, and only here: if a bucket of this name already exists
-- from an experiment it may be PUBLIC, and inheriting that would publish every member's
-- photograph. This is the one setting where "leave whatever is there" is the wrong default.

-- ── who may do what ────────────────────────────────────────────────────────
--
-- Named with the bucket in the policy name so `storage.objects` — one table carrying every
-- bucket's rules — stays readable as the list of buckets grows.
DROP POLICY IF EXISTS "Members upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Members read own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Members update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Members delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Staff read member avatars" ON storage.objects;

-- INSERT. `WITH CHECK` and not `USING`: on an insert there is no existing row to test, so a
-- policy written with `USING` alone would allow every upload.
CREATE POLICY "Members upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'member-avatars'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

-- SELECT. This is what a signed URL is issued against: `createSignedUrl` evaluates the caller's
-- policies, so a member can only ever mint a URL for their own object.
CREATE POLICY "Members read own avatar"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'member-avatars'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

-- UPDATE. `upsert: true` on the client is an UPDATE when the object already exists, so without
-- this a member could set a photo once and never replace it — and the failure would arrive as an
-- opaque storage error on their second attempt.
--
-- BOTH `USING` and `WITH CHECK`: `USING` decides which row may be changed, `WITH CHECK` decides
-- what it may become. With only `USING`, an update could MOVE an object into another member's
-- folder — the row being changed is the caller's own, so `USING` is satisfied, and nothing then
-- constrains the new `name`.
CREATE POLICY "Members update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'member-avatars'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'member-avatars'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

-- DELETE. "Remove photo" is a member's own decision about their own likeness; requiring a phone
-- call to take a photograph down is the kind of thing R6 bans for ordinary fields, and it
-- matters more here than for a postcode.
CREATE POLICY "Members delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'member-avatars'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

-- STAFF READ ALL, AND ONLY READ. An operator taking an SOS needs to know who they are looking
-- for, and the staff member record shows the photo beside the name.
--
-- No staff INSERT, UPDATE or DELETE. Staff can already change almost everything on a member's
-- record; a member's photograph of themselves is not one of those things, and the absence of
-- those policies is the enforcement rather than a convention.
CREATE POLICY "Staff read member avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'member-avatars'
    AND public.is_staff(auth.uid())
  );

-- TO REVERSE:
--   DROP POLICY IF EXISTS "Members upload own avatar"  ON storage.objects;
--   DROP POLICY IF EXISTS "Members read own avatar"    ON storage.objects;
--   DROP POLICY IF EXISTS "Members update own avatar"  ON storage.objects;
--   DROP POLICY IF EXISTS "Members delete own avatar"  ON storage.objects;
--   DROP POLICY IF EXISTS "Staff read member avatars"  ON storage.objects;
--   DELETE FROM storage.objects WHERE bucket_id = 'member-avatars';
--   DELETE FROM storage.buckets WHERE id = 'member-avatars';
-- The objects have to go before the bucket: `storage.objects.bucket_id` references it.
-- `members.photo_url` is left alone — it predates this migration by seven months.
