import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * On navigation: scroll to the #hash target if present (so anchors like /#pricing and the
 * footer #how-it-works work), otherwise scroll to top. Previously this ignored the hash,
 * which made the Pricing nav anchor dead.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.replace(/^#/, "");
      // Defer so the target section is mounted before we scroll to it.
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.scrollTo(0, 0);
        }
      });
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
