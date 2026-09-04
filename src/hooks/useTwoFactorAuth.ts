import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface TOTPFactor {
  id: string;
  type: "totp";
  totp: {
    qr_code: string;
    secret: string;
    uri: string;
  };
}

/**
 * A suffix that cannot repeat, so two enrolment attempts never share a
 * friendlyName. `randomUUID` where available, with a fallback for older
 * WebViews — this must not throw, because throwing here means no 2FA at all.
 */
function newEnrolmentSuffix(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Hook for managing TOTP-based two-factor authentication via Supabase MFA.
 */
export function useTwoFactorAuth() {
  const { user } = useAuth();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The user's factors.
   *
   * `verified` reads `data.all`, not `data.totp`, for the same reason
   * `hasVerifiedMfaFactor` does: `all` is every factor of every type, and a
   * passkey-only admin holds a `webauthn` factor. Reading `data.totp` made this
   * page say "not enrolled" to a user the mandatory-2FA gate considers enrolled
   * — the settings page and the gate disagreeing about the same account.
   *
   * `unverified` stays TOTP-only on purpose: it exists to feed the "cancel
   * pending setup" path below, and this component can only clear a TOTP
   * enrolment it knows how to start.
   */
  const getFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const all = data.all || [];
    return {
      totp: data.totp || [],
      all,
      verified: all.filter((f) => (f.status as string) === "verified"),
      unverified: (data.totp || []).filter(
        (f) => (f.status as string) === "unverified"
      ),
    };
  };

  /**
   * Start TOTP enrollment — returns QR code and secret.
   *
   * THE DEADLOCK THIS AVOIDS (2026-09-03, locked Lee out of /admin and needed
   * manual `auth.mfa_factors` surgery):
   *
   *   1. an enrolment is abandoned before the code is entered, leaving a factor
   *      in `unverified` state;
   *   2. `enroll()` used a hardcoded `friendlyName`, so every later attempt
   *      failed with "a factor with the friendly name ... already exists";
   *   3. the mandatory-2FA gate in ProtectedRoute refuses every admin route
   *      because no *verified* factor exists.
   *
   * No UI path cleared the pending factor, so the account was stuck: it could
   * not enrol, and it could not get in without enrolling.
   *
   * Two independent fixes, either of which breaks the loop, because this locked
   * a real person out of a life-safety product and one fix is not enough:
   *   - clear stale `unverified` TOTP factors first, so a retry starts clean;
   *   - stop reusing one friendlyName, so a collision cannot arise even if a
   *     stale factor survives (a concurrent session, a failed unenroll).
   *
   * Deliberately NOT changed: the mandatory-2FA gate. It is correct, its
   * reasoning is in ProtectedRoute.tsx, and the bug was never that it fired —
   * it was that enrolment could not be completed.
   */
  const enroll = async (): Promise<TOTPFactor | null> => {
    setIsEnrolling(true);
    setError(null);
    try {
      // Clear abandoned enrolments before asking for a new one. Best-effort:
      // an unenroll that fails must not block the attempt, because the unique
      // friendlyName below means a survivor is no longer fatal.
      try {
        const { data: existing } = await supabase.auth.mfa.listFactors();
        const stale = (existing?.totp || []).filter(
          (f) => (f.status as string) === "unverified"
        );
        for (const factor of stale) {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      } catch {
        // fall through — the unique friendlyName is the second line of defence
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        // Unique per attempt. A fixed name is what turned one abandoned
        // enrolment into a permanent lockout.
        //
        // Randomness, not a timestamp: `toISOString()` is millisecond-resolution,
        // so two attempts in the same millisecond — a double-click, a retry loop
        // — collide and reproduce the very bug this line exists to prevent.
        // The test for this caught exactly that.
        friendlyName: `ICE Alarm España Authenticator ${newEnrolmentSuffix()}`,
      });
      if (enrollError) throw enrollError;
      return data as TOTPFactor;
    } catch (e) {
      setError((e instanceof Error ? e.message : "") || "Failed to start 2FA enrollment");
      return null;
    } finally {
      setIsEnrolling(false);
    }
  };

  /** Verify a TOTP code to complete enrollment or challenge */
  const verify = async (factorId: string, code: string): Promise<boolean> => {
    setIsVerifying(true);
    setError(null);
    try {
      // Create a challenge
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      // Verify the code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      return true;
    } catch (e) {
      setError((e instanceof Error ? e.message : "") || "Invalid verification code");
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  /** Unenroll (remove) a TOTP factor */
  const unenroll = async (factorId: string): Promise<boolean> => {
    setError(null);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) throw unenrollError;
      return true;
    } catch (e) {
      setError((e instanceof Error ? e.message : "") || "Failed to disable 2FA");
      return false;
    }
  };

  return {
    isEnrolling,
    isVerifying,
    error,
    getFactors,
    enroll,
    verify,
    unenroll,
    isEnabled: user != null,
  };
}
