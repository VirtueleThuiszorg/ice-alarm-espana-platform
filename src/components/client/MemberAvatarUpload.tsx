import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEditableCard } from "@/components/editableCardContext";
import { ACCEPTED_AVATAR_TYPES, MAX_AVATAR_EDGE } from "@/lib/memberAvatar";
import { useMemberAvatarUpload, useMemberAvatarUrl } from "@/hooks/useMemberAvatar";

/**
 * THE MEMBER'S OWN PHOTOGRAPH, ADDED BY THE MEMBER — MEMBER_UX_RULES R7.
 *
 * *"Members upload their own photo (Supabase storage, size-limited, RLS: own bucket path)."*
 *
 * WHAT WAS THERE. A 128px avatar of their initials and, underneath, the one sentence R6
 * explicitly bans: *"contact support to change"*. `members.photo_url` has existed since the
 * first migration and nothing has ever written it, so the sentence was not even a workaround —
 * ringing support would not have got a member a photograph either.
 *
 * THE CAMERA ON A PHONE. `accept` lists the image types and `capture` is deliberately ABSENT.
 * With `capture="user"` a phone goes straight to the selfie camera and the member cannot choose
 * the picture their daughter took of them last summer; without it, the OS offers both camera and
 * library. Most of these members have a photograph they already like better than one taken at
 * arm's length.
 *
 * IT LIVES INSIDE THE PROFILE CARD'S EDIT MODE. Read-only it is just the picture, like every
 * other field on the page — a member reading their own account is not one stray tap from
 * replacing their photograph.
 */
export interface MemberAvatarUploadProps {
  memberId: string | null | undefined;
  /** `members.photo_url` — an object path, or an absolute URL on a CRM-imported row. */
  photoUrl: string | null | undefined;
  initials: string;
}

export function MemberAvatarUpload({ memberId, photoUrl, initials }: MemberAvatarUploadProps) {
  const { t } = useTranslation();
  const { editing } = useEditableCard();
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data: signedUrl } = useMemberAvatarUrl(memberId, photoUrl);
  const { upload, remove } = useMemberAvatarUpload(memberId);
  const busy = upload.isPending || remove.isPending;

  const choose = () => fileInput.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await upload.mutateAsync({ file, previousPath: photoUrl });
      toast.success(t("profile.photoSaved", "Your photo has been updated"));
    } catch (error) {
      // The message on an `AvatarError` is already written for a member to read; anything else
      // gets a sentence rather than a DOM exception.
      toast.error(
        error instanceof Error
          ? error.message
          : t("profile.photoFailed", "Your photo could not be saved"),
      );
    } finally {
      // Cleared either way, so choosing the SAME file again still fires `change`.
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-center gap-4" data-testid="member-avatar">
      <div className="relative">
        <Avatar className="h-32 w-32">
          <AvatarImage src={signedUrl ?? undefined} alt="" data-testid="member-avatar-image" />
          <AvatarFallback className="bg-primary/10 text-3xl text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex w-full flex-col items-center gap-2">
          {/*
            A REAL FILE INPUT, HIDDEN, DRIVEN BY A REAL BUTTON. `opacity-0` over the button
            would put an invisible input in the tab order and read as an unlabelled control to a
            screen reader. `sr-only` plus a click through the ref keeps one focusable, named
            control.
          */}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_AVATAR_TYPES.join(",")}
            className="sr-only"
            data-testid="member-avatar-input"
            aria-label={t("profile.choosePhoto", "Choose a photo")}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            className="touch-target w-full"
            disabled={busy}
            onClick={choose}
            data-testid="member-avatar-choose"
          >
            <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
            {photoUrl
              ? t("profile.changePhoto", "Change photo")
              : t("profile.addPhoto", "Add a photo")}
          </Button>

          {photoUrl && (
            <Button
              type="button"
              variant="ghost"
              className="touch-target w-full text-muted-foreground"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
              data-testid="member-avatar-remove"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("profile.removePhoto", "Remove photo")}
            </Button>
          )}

          <p className="text-center text-[0.8125rem] text-muted-foreground">
            {t("profile.photoHelp", {
              defaultValue:
                "A photo helps our operators recognise you. We shrink it to {{edge}} pixels on your phone before it is sent, and only you and our team can see it.",
              edge: MAX_AVATAR_EDGE,
            })}
          </p>
        </div>
      ) : (
        /*
          R6 — NEVER "contact support to change". Read-only, the card says what the photo is for
          rather than apologising for a control that is one press away.
        */
        <p className="text-center text-[0.8125rem] text-muted-foreground">
          {photoUrl
            ? t("profile.photoPrivate", "Only you and our team can see this.")
            : t("profile.photoNone", "No photo yet. Press Edit to add one.")}
        </p>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("profile.removePhotoTitle", "Remove your photo?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "profile.removePhotoBody",
                "Your account will show your initials instead. You can add a photo again whenever you like.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="member-avatar-remove-confirm"
              onClick={async () => {
                try {
                  await remove.mutateAsync({ path: photoUrl });
                  toast.success(t("profile.photoRemoved", "Your photo has been removed"));
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : t("profile.photoFailed", "Your photo could not be saved"),
                  );
                }
              }}
            >
              {t("profile.removePhoto", "Remove photo")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
