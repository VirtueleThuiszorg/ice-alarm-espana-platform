import { useTranslation } from "react-i18next";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * "Keep me signed in on this device" — the control that decides how long a session lasts.
 *
 * ONE COMPONENT, TWO LOGIN PAGES, TWO DEFAULTS. The wording and the explanation are identical
 * for staff and members; only the default differs, and it differs for a reason worth stating on
 * the screen rather than only in a comment:
 *
 *   MEMBERS default ON. It is their own phone or laptop, and making somebody re-enter a
 *   password to look at their own alarm history is friction on the least sensitive surface we
 *   have.
 *
 *   STAFF AND ADMINS default OFF. A call-centre machine is shared between shifts. With the box
 *   clear the session lives in `sessionStorage` and never reaches that disk, so closing the
 *   browser at the end of a shift really does end the session — the next operator gets their
 *   own login, not the last one's.
 *
 * THE HINT CHANGES WITH THE STATE, because "what happens when I close the browser" is the only
 * question this control answers and a static label cannot answer it. A checkbox whose
 * consequence is invisible is a checkbox people tick to make the form go away.
 */
export function KeepSignedInCheckbox({
  checked,
  onChange,
  disabled,
  /** Staff terminals get the sharper hint. */
  audience = "member",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  audience?: "member" | "staff";
}) {
  const { t } = useTranslation();

  const hint = checked
    ? t(
        "auth.keepSignedInOn",
        "You will stay signed in on this device until you sign out.",
      )
    : audience === "staff"
      ? t(
          "auth.keepSignedInOffStaff",
          "You will be signed out when the browser closes — leave this clear on a shared machine.",
        )
      : t(
          "auth.keepSignedInOff",
          "You will be signed out when you close the browser.",
        );

  return (
    <div className="space-y-1.5" data-testid="keep-signed-in">
      <div className="flex items-center gap-2">
        <Checkbox
          id="keep-signed-in"
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <Label htmlFor="keep-signed-in" className="cursor-pointer text-sm font-normal">
          {t("auth.keepSignedIn", "Keep me signed in on this device")}
        </Label>
      </div>
      {/*
        `aria-live` so a screen-reader user hears the consequence change when they toggle it.
        Without it the hint is a visual-only explanation of a security decision.
      */}
      <p className="pl-6 text-xs text-muted-foreground" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
