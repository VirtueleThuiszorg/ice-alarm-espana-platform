import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export type FeedbackCategory = "service" | "app" | "support" | "other";

export interface FeedbackData {
  rating: number; // NPS scale 0-10
  comment?: string;
  category: FeedbackCategory;
}

const FEEDBACK_COOLDOWN_KEY = "ice_feedback_cooldown";
const FEEDBACK_DISMISSED_KEY = "ice_feedback_dismissed";
const COOLDOWN_DAYS = 30;
const MIN_ACCOUNT_AGE_DAYS = 7;

export function useFeedback() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, memberId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Submit NPS/feedback data.
   * Stores in activity_logs with entity_type "feedback".
   */
  const submitFeedback = useCallback(
    async (data: FeedbackData) => {
      if (!user) return false;

      setIsSubmitting(true);

      try {
        const { error } = await supabase.from("activity_logs").insert({
          user_id: user.id,
          entity_type: "feedback",
          entity_id: memberId || user.id,
          action: "feedback_submitted",
          details: {
            rating: data.rating,
            comment: data.comment || null,
            category: data.category,
            nps_category:
              data.rating >= 9
                ? "promoter"
                : data.rating >= 7
                  ? "passive"
                  : "detractor",
            submitted_at: new Date().toISOString(),
          },
        });

        if (error) throw error;

        // Set cooldown in localStorage
        const cooldownUntil = new Date();
        cooldownUntil.setDate(cooldownUntil.getDate() + COOLDOWN_DAYS);
        localStorage.setItem(FEEDBACK_COOLDOWN_KEY, cooldownUntil.toISOString());

        toast({
          title: t("feedback.thankYouTitle", "Thank you for your feedback!"),
          description: t(
            "feedback.thankYouDescription",
            "Your input helps us improve our service."
          ),
        });

        setIsSubmitting(false);
        return true;
      } catch (error: any) {
        console.error("Failed to submit feedback:", error);
        toast({
          title: t("feedback.errorTitle", "Feedback submission failed"),
          description:
            error.message ||
            t("feedback.errorDescription", "Please try again later."),
          variant: "destructive",
        });
        setIsSubmitting(false);
        return false;
      }
    },
    [user, memberId, toast, t]
  );

  /**
   * Check whether the user has a pending/cooldown feedback prompt.
   * Returns true if they should NOT be shown the feedback widget.
   */
  const hasPendingFeedback = useCallback((): boolean => {
    // Check if permanently dismissed
    const dismissed = localStorage.getItem(FEEDBACK_DISMISSED_KEY);
    if (dismissed === "true") return true;

    // Check cooldown period
    const cooldownUntil = localStorage.getItem(FEEDBACK_COOLDOWN_KEY);
    if (cooldownUntil) {
      const cooldownDate = new Date(cooldownUntil);
      if (new Date() < cooldownDate) return true;
    }

    return false;
  }, []);

  /**
   * Check if the user's account is old enough to be prompted.
   * Only shows feedback widget after MIN_ACCOUNT_AGE_DAYS.
   */
  const isAccountOldEnough = useCallback((): boolean => {
    if (!user?.created_at) return false;
    const createdAt = new Date(user.created_at);
    const now = new Date();
    const daysDiff = Math.floor(
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysDiff >= MIN_ACCOUNT_AGE_DAYS;
  }, [user]);

  /**
   * Dismiss the feedback prompt temporarily (30-day cooldown).
   */
  const dismissFeedback = useCallback(() => {
    const cooldownUntil = new Date();
    cooldownUntil.setDate(cooldownUntil.getDate() + COOLDOWN_DAYS);
    localStorage.setItem(FEEDBACK_COOLDOWN_KEY, cooldownUntil.toISOString());
  }, []);

  /**
   * Permanently dismiss the feedback prompt ("Don't ask again").
   */
  const dismissFeedbackPermanently = useCallback(() => {
    localStorage.setItem(FEEDBACK_DISMISSED_KEY, "true");
  }, []);

  /**
   * Determine if the feedback widget should be shown.
   */
  const shouldShowFeedback = useCallback((): boolean => {
    if (!user) return false;
    if (!memberId) return false;
    if (hasPendingFeedback()) return false;
    if (!isAccountOldEnough()) return false;
    return true;
  }, [user, memberId, hasPendingFeedback, isAccountOldEnough]);

  return {
    submitFeedback,
    hasPendingFeedback,
    isAccountOldEnough,
    dismissFeedback,
    dismissFeedbackPermanently,
    shouldShowFeedback,
    isSubmitting,
  };
}
