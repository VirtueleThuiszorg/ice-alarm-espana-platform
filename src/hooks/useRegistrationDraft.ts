import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JoinWizardData } from "@/types/wizard";

const SESSION_STORAGE_KEY = "join_wizard_session_id";

function generateSessionId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function useRegistrationDraft() {
  const [sessionId, setSessionId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Initialize or restore session ID
  useEffect(() => {
    let storedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    
    if (!storedSessionId) {
      storedSessionId = generateSessionId();
      localStorage.setItem(SESSION_STORAGE_KEY, storedSessionId);
    }
    
    setSessionId(storedSessionId);
  }, []);

  // Save draft to database. Returns { success } so callers can decide how to
  // surface a failure — the wizard shows a non-blocking warning and continues.
  // schemaVersion travels with the step, because a step number is meaningless without knowing
  // which wizard produced it. v1 = the nine-step wizard (contacts at 4, medical at 5), v2 = the
  // seven-step wizard. ONBOARDING_SPLIT.md §4-B.
  const saveDraft = useCallback(async (currentStep: number, wizardData: JoinWizardData, schemaVersion = 2): Promise<{ success: boolean }> => {
    if (!sessionId) return { success: false };

    setIsSaving(true);
    try {
      const { error } = await supabase.functions.invoke("save-registration-draft", {
        body: {
          sessionId,
          currentStep,
          wizardData,
          schemaVersion,
        },
      });

      if (error) {
        console.error("Failed to save draft:", error);
        return { success: false };
      }

      setLastSaved(new Date());
      return { success: true };
    } catch (err) {
      console.error("Error saving draft:", err);
      return { success: false };
    } finally {
      setIsSaving(false);
    }
  }, [sessionId]);

  // Mark draft as converted after successful payment
  const markAsConverted = useCallback(async (memberId: string) => {
    if (!sessionId) return;

    try {
      // Use supabase directly since we need service role for this
      // The edge function will handle this with service role.
      // NB: invoke resolves with { error } rather than throwing — destructure
      // it, or a failed conversion mark passes silently.
      const { error } = await supabase.functions.invoke("save-registration-draft", {
        body: {
          sessionId,
          // The final step of the CURRENT wizard, not a literal that silently ages.
          currentStep: 7,
          schemaVersion: 2,
          wizardData: { converted: true },
          status: "converted",
          convertedMemberId: memberId,
        },
      });
      if (error) {
        console.error("Error marking draft as converted:", error);
      }
    } catch (err) {
      console.error("Error marking draft as converted:", err);
    }
  }, [sessionId]);

  // Clear session on completion
  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId("");
  }, []);

  // Generate a new session
  const resetSession = useCallback(() => {
    const newSessionId = generateSessionId();
    localStorage.setItem(SESSION_STORAGE_KEY, newSessionId);
    setSessionId(newSessionId);
    return newSessionId;
  }, []);

  return {
    sessionId,
    isSaving,
    lastSaved,
    saveDraft,
    markAsConverted,
    clearSession,
    resetSession,
  };
}
