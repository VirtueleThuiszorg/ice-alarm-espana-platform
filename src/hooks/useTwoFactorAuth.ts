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
 * Hook for managing TOTP-based two-factor authentication via Supabase MFA.
 */
export function useTwoFactorAuth() {
  const { user } = useAuth();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Check if user has any verified TOTP factors */
  const getFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return {
      totp: data.totp || [],
      verified: (data.totp || []).filter(
        (f) => (f.status as string) === "verified"
      ),
      unverified: (data.totp || []).filter(
        (f) => (f.status as string) === "unverified"
      ),
    };
  };

  /** Start TOTP enrollment — returns QR code and secret */
  const enroll = async (): Promise<TOTPFactor | null> => {
    setIsEnrolling(true);
    setError(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "ICE Alarm Authenticator",
      });
      if (enrollError) throw enrollError;
      return data as TOTPFactor;
    } catch (e: any) {
      setError(e.message || "Failed to start 2FA enrollment");
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
    } catch (e: any) {
      setError(e.message || "Invalid verification code");
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
    } catch (e: any) {
      setError(e.message || "Failed to disable 2FA");
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
