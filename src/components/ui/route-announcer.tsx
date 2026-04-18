import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Announces route changes to screen readers using an aria-live region.
 * This ensures screen reader users know when the page content has changed
 * after client-side navigation.
 */
export function RouteAnnouncer() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Extract a meaningful page title from the pathname
    const path = location.pathname;
    const segments = path.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] || "Home";
    const title =
      document.title ||
      lastSegment
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    // Small delay so the announcement happens after the new page renders
    const timer = setTimeout(() => {
      setAnnouncement(`Navigated to ${title}`);
    }, 100);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}
