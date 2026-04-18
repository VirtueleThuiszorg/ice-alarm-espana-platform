import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Generate a unique visitor ID that persists across sessions
function getVisitorId(): string {
  const key = "ice_visitor_id";
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
}

// Generate a session ID that expires after 30 minutes of inactivity
function getSessionId(): string {
  const key = "ice_session_id";
  const timestampKey = "ice_session_timestamp";
  const thirtyMinutes = 30 * 60 * 1000;
  
  const lastTimestamp = localStorage.getItem(timestampKey);
  const now = Date.now();
  
  let sessionId = localStorage.getItem(key);
  
  // If no session or session expired (30 min inactivity)
  if (!sessionId || !lastTimestamp || now - parseInt(lastTimestamp) > thirtyMinutes) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(key, sessionId);
  }
  
  // Update timestamp
  localStorage.setItem(timestampKey, now.toString());
  
  return sessionId;
}

// Detect device type from user agent
function getDeviceType(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

// Parse browser from user agent
function getBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("SamsungBrowser")) return "Samsung Browser";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  if (ua.includes("Edge")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Other";
}

// Parse OS from user agent
function getOperatingSystem(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Other";
}

// Extract UTM parameters from URL
function getUtmParams(search: string): Record<string, string | null> {
  const params = new URLSearchParams(search);
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_term: params.get("utm_term"),
    utm_content: params.get("utm_content"),
  };
}

interface PageTrackerProps {
  enabled?: boolean;
}

export function PageTracker({ enabled = true }: PageTrackerProps) {
  const location = useLocation();
  const lastPath = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;
    
    // Avoid duplicate tracking for same path
    const currentPath = location.pathname + location.search;
    if (currentPath === lastPath.current) return;
    lastPath.current = currentPath;

    const trackPageView = async () => {
      try {
        const visitorId = getVisitorId();
        const sessionId = getSessionId();
        const utmParams = getUtmParams(location.search);

        const eventData = {
          event_type: "page_view",
          page_path: location.pathname,
          page_title: document.title,
          referrer: document.referrer || null,
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
          utm_term: utmParams.utm_term,
          utm_content: utmParams.utm_content,
          device_type: getDeviceType(),
          browser: getBrowser(),
          operating_system: getOperatingSystem(),
          screen_resolution: `${window.screen.width}x${window.screen.height}`,
          user_agent: navigator.userAgent,
          language: navigator.language,
          visitor_id: visitorId,
          session_id: sessionId,
        };

        // Insert event - fire and forget, don't block UI
        await supabase.from("website_events").insert(eventData);
      } catch (error) {
        // Silently fail - analytics should never break the app
        console.debug("Analytics tracking error:", error);
      }
    };

    // Track after a short delay to ensure page is fully loaded
    const timeoutId = setTimeout(trackPageView, 100);
    
    return () => clearTimeout(timeoutId);
  }, [location.pathname, location.search, enabled]);

  // This component doesn't render anything
  return null;
}

// Utility function for tracking custom events
export async function trackEvent(
  eventType: string,
  metadata?: Record<string, string | number | boolean | null>
): Promise<void> {
  try {
    const visitorId = getVisitorId();
    const sessionId = getSessionId();

    await supabase.from("website_events").insert([{
      event_type: eventType,
      page_path: window.location.pathname,
      visitor_id: visitorId,
      session_id: sessionId,
      device_type: getDeviceType(),
      browser: getBrowser(),
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : {},
    }]);
  } catch (error) {
    console.debug("Event tracking error:", error);
  }
}
