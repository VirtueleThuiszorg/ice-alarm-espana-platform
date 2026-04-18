import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type DeletionStatus = "idle" | "pending" | "submitting" | "submitted" | "error";

export function useGdprDeletion() {
  const { user, memberId } = useAuth();
  const [status, setStatus] = useState<DeletionStatus>("idle");

  /**
   * First call: moves to "pending" state (requires user confirmation).
   * Second call (confirm): actually submits the deletion request.
   */
  const requestDeletion = async () => {
    if (!user || !memberId) {
      toast.error("You must be logged in to request account deletion.");
      return;
    }

    if (status === "idle") {
      // Move to pending - user must confirm
      setStatus("pending");
      return;
    }

    if (status === "pending") {
      setStatus("submitting");

      try {
        // Log the deletion request in activity_logs
        const { error } = await supabase.from("activity_logs").insert({
          action: "deletion_requested",
          entity_type: "member",
          entity_id: memberId,
          new_values: {
            user_id: user.id,
            email: user.email,
            requested_at: new Date().toISOString(),
            reason: "GDPR Article 17 - Right to erasure",
          },
        });

        if (error) {
          throw new Error(`Failed to submit deletion request: ${error.message}`);
        }

        setStatus("submitted");
        toast.success(
          "Your account deletion request has been submitted. Our team will process it within 30 days as required by GDPR."
        );
      } catch (error) {
        console.error("GDPR deletion request failed:", error);
        setStatus("error");
        toast.error(
          "Failed to submit your deletion request. Please try again or contact support."
        );
      }
    }
  };

  const cancelDeletion = () => {
    setStatus("idle");
  };

  const reset = () => {
    setStatus("idle");
  };

  return {
    status,
    requestDeletion,
    cancelDeletion,
    reset,
    isPending: status === "pending",
    isSubmitting: status === "submitting",
    isSubmitted: status === "submitted",
    isAvailable: !!user && !!memberId,
  };
}
