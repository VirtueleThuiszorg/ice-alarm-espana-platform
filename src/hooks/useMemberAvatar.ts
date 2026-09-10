import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AVATAR_SIGNED_URL_TTL_SECONDS,
  MEMBER_AVATAR_BUCKET,
  avatarUrlIsPath,
  memberAvatarPath,
  rejectAvatarFile,
} from "@/lib/memberAvatar";
import { resizeAvatar } from "@/lib/resizeImage";

/**
 * A MEMBER'S PHOTOGRAPH: signing it for display, replacing it, removing it.
 *
 * THE BUCKET IS PRIVATE, so there is no URL that just works. Every read mints a short-lived
 * signed URL, which is why this is a query with a stale time rather than a string on the record:
 * storing a signed URL in `members.photo_url` would put a dead link in the database within the
 * hour AND leave a credential at rest. The column holds the object PATH; `avatarUrlIsPath` tells
 * a path from an absolute URL, because rows imported from the old CRM carry the latter and must
 * keep working.
 */

export const memberAvatarQueryKey = (memberId: string | null | undefined, path: string | null | undefined) =>
  ["member-avatar", memberId ?? null, path ?? null] as const;

/**
 * The displayable URL for a stored `photo_url`, or null.
 *
 * A FAILED SIGN IS NULL, NOT AN ERROR. The consumer is an `<Avatar>`, whose fallback is the
 * member's initials — which is a perfectly good thing to show. Surfacing "could not sign avatar
 * URL" on a member's dashboard would be alarming about nothing.
 */
export function useMemberAvatarUrl(
  memberId: string | null | undefined,
  photoUrl: string | null | undefined,
) {
  return useQuery({
    queryKey: memberAvatarQueryKey(memberId, photoUrl),
    enabled: !!photoUrl,
    // Comfortably inside the URL's own hour, so a member reading a long page never meets an
    // expired one.
    staleTime: (AVATAR_SIGNED_URL_TTL_SECONDS - 300) * 1000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      if (!photoUrl) return null;
      // An absolute URL from the CRM import is already displayable; signing it would produce
      // nonsense.
      if (!avatarUrlIsPath(photoUrl)) return photoUrl;
      const { data, error } = await supabase.storage
        .from(MEMBER_AVATAR_BUCKET)
        .createSignedUrl(photoUrl, AVATAR_SIGNED_URL_TTL_SECONDS);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });
}

export type AvatarUploadFailure = "type" | "tooLarge" | "resize" | "upload" | "record";

export class AvatarError extends Error {
  constructor(readonly reason: AvatarUploadFailure, message: string) {
    super(message);
    this.name = "AvatarError";
  }
}

/**
 * Replace a member's photograph.
 *
 * THE ORDER MATTERS, AND IT IS: upload, then point the record at it, then delete the old object.
 *
 *   - Upload first, because a record pointing at an object that does not exist renders as a
 *     broken image for everyone including the operator taking their SOS.
 *   - Delete last, and only after the record has moved. Deleting first means a failed upload
 *     leaves the member with no photograph at all — they came to CHANGE it, not to lose it.
 *   - A failed delete is swallowed deliberately. The member's photo is already correct by then;
 *     an orphaned object costs a few kilobytes, and telling somebody their photo failed when it
 *     visibly worked is the worse outcome. It is logged, not raised.
 */
export function useMemberAvatarUpload(memberId: string | null | undefined) {
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async ({ file, previousPath }: { file: File; previousPath?: string | null }) => {
      if (!memberId) throw new AvatarError("record", "No membership for this account");

      const rejection = rejectAvatarFile(file);
      if (rejection === "type") {
        throw new AvatarError("type", "That file is not a photo we can use");
      }
      if (rejection === "tooLarge") {
        throw new AvatarError("tooLarge", "That photo is too large to open");
      }

      let resized;
      try {
        resized = await resizeAvatar(file);
      } catch (error) {
        throw new AvatarError(
          "resize",
          error instanceof Error ? error.message : "That photo could not be read",
        );
      }

      const path = memberAvatarPath(memberId, resized.type);
      const { error: uploadError } = await supabase.storage
        .from(MEMBER_AVATAR_BUCKET)
        .upload(path, resized.blob, { contentType: resized.type, upsert: false });
      if (uploadError) {
        throw new AvatarError("upload", "Your photo could not be uploaded");
      }

      /*
        THE RECORD, and this is the only column this write touches.

        `members` has a member self-UPDATE policy — the route `clientWriteSweep.test.ts` pins as
        allowed self-service — and a guard trigger that refuses `status`. Sending one column
        keeps it that way: a payload carrying anything else would be a new client-side write to
        a sensitive table, which is the class that sweep exists to catch.
      */
      const { error: recordError } = await supabase
        .from("members")
        .update({ photo_url: path })
        .eq("id", memberId);
      if (recordError) {
        // The object is uploaded but unreferenced. Remove it rather than leaving a photograph
        // of a member in a bucket that nothing points at.
        await supabase.storage.from(MEMBER_AVATAR_BUCKET).remove([path]).catch(() => undefined);
        throw new AvatarError("record", "Your photo could not be saved to your record");
      }

      if (previousPath && avatarUrlIsPath(previousPath) && previousPath !== path) {
        const { error } = await supabase.storage
          .from(MEMBER_AVATAR_BUCKET)
          .remove([previousPath]);
        // Swallowed on purpose — see the doc comment. Logged without the path, which contains
        // the member id.
        if (error) console.warn("[memberAvatar] the previous photo could not be removed");
      }

      return path;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["member-profile"] });
      queryClient.invalidateQueries({ queryKey: ["member-avatar"] });
      queryClient.invalidateQueries({ queryKey: ["member-dashboard"] });
    },
  });

  const remove = useMutation({
    mutationFn: async ({ path }: { path: string | null | undefined }) => {
      if (!memberId) throw new AvatarError("record", "No membership for this account");

      /*
        THE RECORD IS CLEARED FIRST HERE, which is the opposite order to the upload, and for the
        same reason: the outcome the member asked for is "my photo is gone from the portal". A
        cleared column achieves that even if the object lingers, whereas a deleted object with
        the column still set leaves a broken image where their face was.
      */
      const { error } = await supabase
        .from("members")
        .update({ photo_url: null })
        .eq("id", memberId);
      if (error) throw new AvatarError("record", "Your photo could not be removed");

      if (path && avatarUrlIsPath(path)) {
        const { error: removeError } = await supabase.storage
          .from(MEMBER_AVATAR_BUCKET)
          .remove([path]);
        if (removeError) console.warn("[memberAvatar] the photo file could not be deleted");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["member-profile"] });
      queryClient.invalidateQueries({ queryKey: ["member-avatar"] });
      queryClient.invalidateQueries({ queryKey: ["member-dashboard"] });
    },
  });

  return { upload, remove };
}
