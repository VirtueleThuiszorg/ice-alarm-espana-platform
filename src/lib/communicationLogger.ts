import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type InteractionType = 
  | "call_inbound"
  | "call_outbound"
  | "sms_sent"
  | "sms_received"
  | "whatsapp_sent"
  | "whatsapp_received"
  | "email_sent"
  | "email_received"
  | "note_added"
  | "alert_received"
  | "alert_resolved"
  | "payment_received"
  | "profile_updated"
  | "device_assigned"
  | "subscription_changed";

interface LogInteractionParams {
  memberId: string;
  staffId?: string;
  interactionType: InteractionType;
  description?: string;
  metadata?: Record<string, Json>;
}

interface LogSmsParams {
  memberId: string;
  staffId: string;
  phoneNumber: string;
  messageContent: string;
  twilioSid?: string;
  conversationId?: string;
  direction?: "outbound" | "inbound";
}

interface LogCallParams {
  memberId: string;
  staffId: string;
  phoneNumber: string;
  callSid?: string;
  direction?: "outbound" | "inbound";
}

interface UpdateCallParams {
  interactionId: string;
  durationSeconds: number;
  recordingUrl?: string;
  notes?: string;
}

interface LogWhatsAppParams {
  memberId: string;
  staffId: string;
  phoneNumber: string;
  messageContent: string;
  twilioSid?: string;
  conversationId?: string;
  direction?: "outbound" | "inbound";
}

/**
 * Log a generic member interaction
 */
export async function logInteraction({
  memberId,
  staffId,
  interactionType,
  description,
  metadata,
}: LogInteractionParams) {
  const { data, error } = await supabase
    .from("member_interactions")
    .insert({
      member_id: memberId,
      staff_id: staffId || null,
      interaction_type: interactionType,
      description: description || null,
      metadata: (metadata as Json) || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to log interaction:", error);
    throw error;
  }

  return data;
}

/**
 * Log an SMS message and optionally add to conversation
 */
export async function logSms({
  memberId,
  staffId,
  phoneNumber,
  messageContent,
  twilioSid,
  conversationId,
  direction = "outbound",
}: LogSmsParams) {
  // Log to member_interactions
  const interaction = await logInteraction({
    memberId,
    staffId,
    interactionType: direction === "outbound" ? "sms_sent" : "sms_received",
    description: messageContent,
    metadata: {
      twilio_sid: twilioSid ?? null,
      to: phoneNumber,
      direction,
    },
  });

  // Also add to conversation if exists
  if (conversationId) {
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_type: direction === "outbound" ? "staff" : "member",
      sender_id: direction === "outbound" ? staffId : null,
      content: messageContent,
      message_type: "sms",
      metadata: {
        twilio_sid: twilioSid ?? null,
        phone: phoneNumber,
      },
    });

    if (msgError) {
      console.error("Failed to add message to conversation:", msgError);
    }
  }

  return interaction;
}

/**
 * Log an outbound call start
 */
export async function logCallStart({
  memberId,
  staffId,
  phoneNumber,
  callSid,
  direction = "outbound",
}: LogCallParams) {
  const interaction = await logInteraction({
    memberId,
    staffId,
    interactionType: direction === "outbound" ? "call_outbound" : "call_inbound",
    description: `Call ${direction === "outbound" ? "to" : "from"} ${phoneNumber}`,
    metadata: {
      twilio_sid: callSid ?? null,
      phone: phoneNumber,
      direction,
      status: "in_progress",
    },
  });

  return interaction;
}

/**
 * Update call interaction with duration and recording when call ends
 */
export async function logCallEnd({
  interactionId,
  durationSeconds,
  recordingUrl,
  notes,
}: UpdateCallParams) {
  const { data, error } = await supabase
    .from("member_interactions")
    .update({
      description: `Call duration: ${formatDuration(durationSeconds)}${notes ? ` - ${notes}` : ""}`,
      metadata: {
        duration_seconds: durationSeconds,
        recording_url: recordingUrl ?? null,
        status: "completed",
      },
    })
    .eq("id", interactionId)
    .select()
    .single();

  if (error) {
    console.error("Failed to update call interaction:", error);
    throw error;
  }

  return data;
}

/**
 * Log a WhatsApp message and optionally add to conversation
 */
export async function logWhatsApp({
  memberId,
  staffId,
  phoneNumber,
  messageContent,
  twilioSid,
  conversationId,
  direction = "outbound",
}: LogWhatsAppParams) {
  // Log to member_interactions
  const interaction = await logInteraction({
    memberId,
    staffId,
    interactionType: direction === "outbound" ? "whatsapp_sent" : "whatsapp_received",
    description: messageContent,
    metadata: {
      twilio_sid: twilioSid ?? null,
      to: phoneNumber,
      direction,
      channel: "whatsapp",
    },
  });

  // Also add to conversation if exists
  if (conversationId) {
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_type: direction === "outbound" ? "staff" : "member",
      sender_id: direction === "outbound" ? staffId : null,
      content: messageContent,
      message_type: "whatsapp",
      metadata: {
        twilio_sid: twilioSid ?? null,
        phone: phoneNumber,
      },
    });

    if (msgError) {
      console.error("Failed to add WhatsApp message to conversation:", msgError);
    }
  }

  return interaction;
}

/**
 * Log an email sent/received
 */
export async function logEmail({
  memberId,
  staffId,
  emailAddress,
  subject,
  content,
  direction = "outbound",
}: {
  memberId: string;
  staffId?: string;
  emailAddress: string;
  subject: string;
  content: string;
  direction?: "outbound" | "inbound";
}) {
  return logInteraction({
    memberId,
    staffId,
    interactionType: direction === "outbound" ? "email_sent" : "email_received",
    description: `${subject}: ${content.slice(0, 100)}${content.length > 100 ? "..." : ""}`,
    metadata: {
      email: emailAddress,
      subject,
      direction,
    },
  });
}

/**
 * Log an alert received
 */
export async function logAlertReceived({
  memberId,
  alertId,
  alertType,
  staffId,
}: {
  memberId: string;
  alertId: string;
  alertType: string;
  staffId?: string;
}) {
  return logInteraction({
    memberId,
    staffId,
    interactionType: "alert_received",
    description: `${alertType} alert received`,
    metadata: {
      alert_id: alertId,
      alert_type: alertType,
    },
  });
}

/**
 * Log an alert resolved
 */
export async function logAlertResolved({
  memberId,
  alertId,
  staffId,
  resolutionNotes,
}: {
  memberId: string;
  alertId: string;
  staffId: string;
  resolutionNotes?: string;
}) {
  return logInteraction({
    memberId,
    staffId,
    interactionType: "alert_resolved",
    description: resolutionNotes || "Alert resolved",
    metadata: {
      alert_id: alertId,
    },
  });
}

/**
 * Log a payment received
 */
export async function logPaymentReceived({
  memberId,
  staffId,
  amount,
  paymentId,
  paymentType,
}: {
  memberId: string;
  staffId?: string;
  amount: number;
  paymentId: string;
  paymentType: string;
}) {
  return logInteraction({
    memberId,
    staffId,
    interactionType: "payment_received",
    description: `Payment of €${amount.toFixed(2)} received for ${paymentType}`,
    metadata: {
      payment_id: paymentId,
      amount,
      payment_type: paymentType,
    },
  });
}

/**
 * Log a note added
 */
export async function logNoteAdded({
  memberId,
  staffId,
  noteId,
  noteType,
  preview,
}: {
  memberId: string;
  staffId: string;
  noteId: string;
  noteType: string;
  preview: string;
}) {
  return logInteraction({
    memberId,
    staffId,
    interactionType: "note_added",
    description: `${noteType} note: ${preview}`,
    metadata: {
      note_id: noteId,
      note_type: noteType,
    },
  });
}

/**
 * Helper to format duration in human-readable format
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Hook to use communication logger with current staff context
 */
export function useCommunicationLogger() {
  // This would typically get the current staff ID from auth context
  // For now, we'll return the functions that require staffId to be passed
  return {
    logInteraction,
    logSms,
    logCallStart,
    logCallEnd,
    logWhatsApp,
    logEmail,
    logAlertReceived,
    logAlertResolved,
    logPaymentReceived,
    logNoteAdded,
  };
}
