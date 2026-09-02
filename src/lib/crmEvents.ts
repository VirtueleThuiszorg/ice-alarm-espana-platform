import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * CRM Event Types for partner referral system
 */
export type CrmEventType =
  | "partner_created"
  | "invite_sent"
  | "member_registered"
  | "order_paid"
  | "pendant_delivered"
  | "commission_created"
  | "commission_approved"
  | "commission_paid";

/**
 * Log a CRM event to the crm_events table.
 * This is a placeholder for future CRM integration (KarmaCRM or other).
 * Currently writes to crm_events table for tracking and later processing.
 * 
 * @param eventType - The type of CRM event
 * @param payload - Event-specific data payload
 * @returns The created event ID or null if failed
 */
export async function logCrmEvent(
  eventType: CrmEventType,
  payload: Record<string, unknown>
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("crm_events")
      .insert({
        event_type: eventType,
        payload: payload as unknown as Json,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`Failed to log CRM event (${eventType}):`, error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error(`Exception logging CRM event (${eventType}):`, error);
    return null;
  }
}

/**
 * Batch log multiple CRM events
 */
export async function logCrmEvents(
  events: Array<{ eventType: CrmEventType; payload: Record<string, unknown> }>
): Promise<void> {
  try {
    const { error } = await supabase.from("crm_events").insert(
      events.map((e) => ({
        event_type: e.eventType,
        payload: e.payload as unknown as Json,
      }))
    );

    if (error) {
      console.error("Failed to batch log CRM events:", error);
    }
  } catch (error) {
    console.error("Exception batch logging CRM events:", error);
  }
}

/**
 * Generate a clean referral link for a partner.
 * Format: https://icealarm.es/r/CODE
 *
 * This produces a short, professional link that partners can share.
 * UTM tracking is handled server-side by the ReferralRedirect component.
 */
export function generateReferralLink(referralCode: string): string {
  const siteUrl = typeof window !== "undefined"
    ? window.location.origin
    : "https://icealarm.es";
  return `${siteUrl}/r/${referralCode}`;
}

/**
 * Extract UTM parameters from URL search params
 */
export function extractUtmParams(searchParams: URLSearchParams): Record<string, string> {
  const utmParams: Record<string, string> = {};
  const utmKeys = ["utm_source", "utm_campaign", "utm_medium", "utm_content", "utm_term"];
  
  utmKeys.forEach((key) => {
    const value = searchParams.get(key);
    if (value) {
      utmParams[key] = value;
    }
  });
  
  return utmParams;
}

/**
 * Store referral and UTM data in localStorage
 */
export function storeReferralData(
  referralCode: string,
  utmParams: Record<string, string>
): void {
  const existingRef = localStorage.getItem("partner_ref");
  
  // First-touch attribution - don't overwrite existing
  if (!existingRef) {
    localStorage.setItem("partner_ref", referralCode);
    
    if (Object.keys(utmParams).length > 0) {
      localStorage.setItem("partner_utm", JSON.stringify(utmParams));
    }
    
  }
}

/**
 * Retrieve stored referral data
 * Checks both tracked link storage (partner_referral) and regular referral (partner_ref)
 */
export function getStoredReferralData(): {
  referralCode: string | null;
  refPostId: string | null;
  utmParams: Record<string, string>;
} {
  // First, check for tracked link referral (partner_referral) - set by /r/<code>/<slug> links
  const trackedReferral = localStorage.getItem("partner_referral");
  if (trackedReferral) {
    try {
      const data = JSON.parse(trackedReferral);
      // Check if not expired
      if (data.ref_expires && data.ref_expires > Date.now()) {
        return {
          referralCode: data.ref_partner_code || null,
          refPostId: data.ref_post_id || null,
          utmParams: {},
        };
      }
    } catch (e) {
      console.error("Failed to parse tracked referral:", e);
    }
  }
  
  // Fall back to regular referral (partner_ref) - set by /?ref=CODE links
  const referralCode = localStorage.getItem("partner_ref");
  let utmParams: Record<string, string> = {};
  
  const utmJson = localStorage.getItem("partner_utm");
  if (utmJson) {
    try {
      utmParams = JSON.parse(utmJson);
    } catch (e) {
      console.error("Failed to parse UTM data:", e);
    }
  }
  
  return { referralCode, refPostId: null, utmParams };
}

/**
 * Clear stored referral data (call after successful registration)
 */
export function clearReferralData(): void {
  localStorage.removeItem("partner_ref");
  localStorage.removeItem("partner_utm");
  localStorage.removeItem("partner_referral"); // Also clear tracked link data
}
