import { ReactNode } from "react";

/**
 * Hides content visually but keeps it accessible to screen readers.
 * Use for labels, descriptions, and headings that sighted users don't need
 * but assistive technology requires.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
}
