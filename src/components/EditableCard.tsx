import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Lock, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

/**
 * LOCKED UNTIL EDIT — one shell, not twelve copies of the same three buttons.
 *
 * WHAT WAS WRONG. Every field of a member's record was a live input the moment the tab opened.
 * A staff member reading a record to somebody on the phone was one stray keypress from
 * changing their address; a tab left open on a shared screen was an edit waiting to happen;
 * and there was no moment at which anybody decided "I am changing this now". For a
 * life-safety record — the address an ambulance is sent to, the allergies read out to a crew —
 * read-by-default is not a nicety.
 *
 * WHY A `fieldset`, AND WHY THAT MATTERS. The lock is one `<fieldset disabled>` around the
 * body, not a `disabled` prop threaded through forty inputs. A per-field flag is a flag
 * somebody forgets on the forty-first, and the forgetting is invisible — the field looks the
 * same and simply stays editable. The fieldset cannot be forgotten: it is the container, it is
 * native, and assistive technology announces the whole group as disabled without any ARIA of
 * ours. The header actions sit OUTSIDE it, so Edit and Save are never disabled by the lock
 * they control.
 *
 * WHAT IT DOES NOT DO. It is not a permission. Anyone who can open this page can press Edit;
 * the lock is against accident, not against intent. What may actually be written is RLS's job
 * and the guard triggers', and neither of them can see this component.
 *
 * WHY IT LIVES AT THE TOP OF `src/components` rather than under `admin/member-detail`, where it
 * was written: the member's own pages need the same behaviour, for the same reason. A member
 * reading their medical record to a relative should not be one keypress from rewriting it
 * either. Leaving it in an admin folder would have meant a second copy on the client surface,
 * and the two would have disagreed within a month about what Cancel does with an unsaved
 * change. It knows nothing about members, staff or Supabase — it takes a title, a dirty flag
 * and an onSave.
 */
export interface EditableCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Anything that belongs beside the title — a "last updated" line, a badge. */
  headerExtra?: ReactNode;
  /**
   * Has anything changed? Drives the unsaved-changes warning. Passing `false` for a form that
   * can in fact change is how the warning quietly stops appearing, so callers wire it to the
   * form's own dirty state rather than to a hand-kept boolean.
   */
  isDirty?: boolean;
  saving?: boolean;
  /** Return false to keep the card in edit mode (a validation failure, a refused write). */
  onSave: () => void | boolean | Promise<void | boolean>;
  /** Put the form back as it was. Called on Cancel, and after a confirmed discard. */
  onCancel?: () => void;
  onEditStart?: () => void;
  children: ReactNode;
  testId?: string;
}

export function EditableCard({
  title,
  description,
  headerExtra,
  isDirty = false,
  saving = false,
  onSave,
  onCancel,
  onEditStart,
  children,
  testId,
}: EditableCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  /*
    THE BROWSER'S OWN WARNING, for the ways out this component cannot see: the back button, a
    closed tab, a link to another page. The in-app Cancel is guarded below; this covers
    everything else, and it is removed the moment the card is clean so a reader never meets it.
  */
  useEffect(() => {
    if (!editing || !isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, isDirty]);

  const startEditing = () => {
    setEditing(true);
    onEditStart?.();
  };

  const leaveEditing = () => {
    setEditing(false);
    onCancel?.();
  };

  const requestCancel = () => {
    if (isDirty) setConfirmDiscard(true);
    else leaveEditing();
  };

  const save = async () => {
    const result = await onSave();
    // `false` means the save did not happen — a validation failure, or a write the database
    // refused. Closing the card on that would throw away what the person typed and tell them
    // it was saved.
    if (result !== false) setEditing(false);
  };

  return (
    <>
      <Card data-testid={testId}>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              {title}
              {editing ? null : (
                <Lock
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                  data-testid={testId ? `${testId}-lock` : undefined}
                />
              )}
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
            {headerExtra}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={requestCancel}
                  disabled={saving}
                  data-testid={testId ? `${testId}-cancel` : undefined}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving}
                  data-testid={testId ? `${testId}-save` : undefined}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t("common.save", "Save")}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={startEditing}
                data-testid={testId ? `${testId}-edit` : undefined}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t("common.edit", "Edit")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/*
            ONE fieldset, not a disabled prop per input. `min-w-0` because a disabled fieldset
            establishes a new layout context that otherwise refuses to shrink inside a grid.
          */}
          <fieldset
            disabled={!editing}
            className="min-w-0 disabled:opacity-100"
            data-testid={testId ? `${testId}-fields` : undefined}
            data-editing={editing ? "true" : "false"}
          >
            {children}
          </fieldset>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("adminMemberDetail.edit.discardTitle", "Discard your changes?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "adminMemberDetail.edit.discardBody",
                "You have changed this card and not saved it. Closing now leaves the record as it was.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("adminMemberDetail.edit.keepEditing", "Keep editing")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={leaveEditing}
              data-testid={testId ? `${testId}-discard` : undefined}
            >
              {t("adminMemberDetail.edit.discard", "Discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
