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

  // Save draft to database
  const saveDraft = useCallback(async (currentStep: number, wizardData: JoinWizardData) => {
    if (!sessionId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase.functions.invoke("save-registration-draft", {
        body: {
          sessionId,
          currentStep,
          wizardData,
        },
      });

      if (error) {
        console.error("Failed to save draft:", error);
      } else {
        setLastSaved(new Date());
      }
    } catch (err) {
      console.error("Error saving draft:", err);
    } finally {
      setIsSaving(false);
    }
  }, [sessionId]);

  // Mark draft as converted after successful payment
  const markAsConverted = useCallback(async (memberId: string) => {
    if (!sessionId) return;

    try {
      // Use supabase directly since we need service role for this
      // The edge function will handle this with service role
      await supabase.functions.invoke("save-registration-draft", {
        body: {
          sessionId,
          currentStep: 9,
          wizardData: { converted: true },
          status: "converted",
          convertedMemberId: memberId,
        },
      });
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
