import { cn } from "@/lib/utils";

interface ResponseRippleProps {
  className?: string;
  /** When true, the arcs play one gentle staggered expansion (hero only).
   *  Automatically suppressed under prefers-reduced-motion. */
  animate?: boolean;
}

/**
 * Signature "response ripple" (FRONTEND_REDESIGN.md §3): concentric rounded arcs
 * radiating from a central point — "press once, help radiates out". Decorative
 * only (aria-hidden); colour comes from the current text colour, so callers set
 * it with a text-* class (typically the warm brand accent). Reduced-motion is
 * respected via Tailwind's `motion-safe` variant.
 */
export function ResponseRipple({ className, animate = false }: ResponseRippleProps) {
  const rings = [30, 54, 78, 100];
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("text-[hsl(var(--brand-accent))]", className)}
    >
      {rings.map((r, i) => (
        <circle
          key={r}
          cx="100"
          cy="100"
          r={r}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeOpacity={0.55 - i * 0.12}
          style={{ transformOrigin: "100px 100px", animationDelay: `${i * 0.55}s` }}
          className={cn(animate && "motion-safe:animate-[response-ripple_3.2s_ease-out_infinite]")}
        />
      ))}
      <circle cx="100" cy="100" r="13" fill="currentColor" />
    </svg>
  );
}
