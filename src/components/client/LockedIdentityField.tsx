import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Label } from "@/components/ui/label";

/**
 * A FIELD A MEMBER CANNOT EDIT — AND WHY, WHICH IS THE WHOLE POINT.
 *
 * R7: *"DOB and NIE stay locked with a reason: 'Call us to change this — we need to verify who
 * you are.'"* R6, about everything else: *"Never 'contact support to change'."*
 *
 * Those two are not in tension. R6 bans the sentence for fields the member could perfectly well
 * edit themselves, where it is an apology for a missing feature. R7 sanctions a lock where there
 * is a real reason a stranger with the account should not be able to rewrite an identity
 * document number — and it asks for the reason to be ON the screen.
 *
 * `ProfilePage` had four locked fields and got all four of them wrong in one of two ways:
 *
 *   date of birth   "Cannot be changed"                              — what, not why
 *   NIE / DNI       "Cannot be changed"                              — what, not why
 *   email           "Contact support to change your email address"   — R6's banned sentence
 *   country         (nothing at all)                                 — locked with no reason
 *
 * So `reason` is a REQUIRED prop, not an optional one. A locked field with no reason is exactly
 * the complaint R6 is making, and a component that allows one invites it back — the same
 * argument as `MEMBER_ACCESS_FIELDS.secret` and `MemberActionSpec.destructive`.
 *
 * WHAT THIS COMPONENT IS NOT. It is not the enforcement. Two of these four fields —
 * `date_of_birth` and `nie_dni` — are still writable by the member through PostgREST, because
 * "Members can update own profile" is `FOR UPDATE` with no column restriction and the guard
 * trigger added in 20260904180000 names only `status`. The padlock is a label until that trigger
 * covers them; `PENDING_FOR_LEE.md` D-14 carries the migration and why it is not merged here.
 */
export function LockedIdentityField({
  label,
  value,
  reason,
  icon,
  testId,
}: {
  label: ReactNode;
  /** `null` renders an em dash — "we have not got this" rather than an empty box. */
  value: ReactNode | null;
  /** Why it is locked. REQUIRED — see the module comment. */
  reason: ReactNode;
  icon?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <Label className="flex items-center gap-2">
        <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        {label}
      </Label>
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 font-medium text-muted-foreground">
        {icon}
        {value ?? "—"}
      </div>
      {/* R10's 13px label floor, in rem so the A/A control moves it. */}
      <p className="text-[0.8125rem] text-muted-foreground" data-testid={testId ? `${testId}-reason` : undefined}>
        {reason}
      </p>
    </div>
  );
}
