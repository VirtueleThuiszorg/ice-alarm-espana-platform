import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "default" | "white" | "dark" | "sidebar";
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

/**
 * ICE Alarm España — "The Guardian"
 *
 * A shield for protection, a heartbeat for what is protected. The heartbeat is
 * KNOCKED OUT of the shield rather than drawn over it: one shape, so it engraves,
 * embroiders and prints in a single colour pass and cannot come apart at 16px.
 *
 * Canonical vector source is `public/icon.svg` — the geometry below must stay in
 * step with it. Every raster in the icon set is exported from that file.
 *
 * Primary lockup is the FULL NAME ON ONE LINE ("ICE Alarm España"), matching the
 * registered company. The stacked form is for narrow columns; below ~150px wide
 * use `showText={false}` and let the mark stand alone.
 *
 * Props are unchanged from the previous component so no caller breaks.
 */

const SHIELD_D =
  "M50 7 L87 21 V50 C87 71.5 71 87.5 50 93.5 C29 87.5 13 71.5 13 50 V21 Z";
const HEARTBEAT_D = "M25 52 H37 L43 38 L52 66 L58 52 H75";

export const Logo = forwardRef<HTMLDivElement, LogoProps>(
  function Logo({ variant = "default", size = "md", showText = true, className }, ref) {
    const sizeClasses = {
      sm: "h-8",
      md: "h-10",
      lg: "h-14",
    };

    const iconSizes = {
      sm: "w-7 h-7",
      md: "w-9 h-9",
      lg: "w-12 h-12",
    };

    const textSizes = {
      sm: "text-base",
      md: "text-xl",
      lg: "text-2xl",
    };

    /**
     * shield = the solid body, beat = the heartbeat knocked out of it.
     * On dark grounds the shield goes white and the beat takes the ground colour,
     * so the mark reverses without a second asset.
     */
    const markColors = {
      default: { shield: "hsl(350, 85%, 42%)", beat: "hsl(0, 0%, 100%)" },
      white: { shield: "hsl(0, 0%, 100%)", beat: "hsl(218, 22%, 10%)" },
      dark: { shield: "hsl(218, 22%, 10%)", beat: "hsl(30, 33%, 98%)" },
      sidebar: { shield: "hsl(0, 0%, 100%)", beat: "hsl(218, 22%, 10%)" },
    };

    const textColors = {
      default: { main: "text-foreground", accent: "text-muted-foreground" },
      white: { main: "text-white", accent: "text-white/75" },
      dark: { main: "text-slate-900", accent: "text-slate-500" },
      sidebar: { main: "text-white", accent: "text-white/70" },
    };

    const { shield, beat } = markColors[variant];
    const text = textColors[variant];

    return (
      <div ref={ref} className={cn("flex items-center gap-2.5", sizeClasses[size], className)}>
        <svg
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("shrink-0", iconSizes[size])}
          role="img"
          aria-label="ICE Alarm España"
        >
          <path d={SHIELD_D} fill={shield} />
          <path
            d={HEARTBEAT_D}
            fill="none"
            stroke={beat}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {showText && (
          /* Primary lockup: one line, Archivo 700 for "ICE Alarm", 500 for "España". */
          <span
            className={cn(
              "font-display font-bold tracking-tight leading-none whitespace-nowrap",
              textSizes[size],
              text.main,
            )}
          >
            ICE Alarm <span className={cn("font-medium", text.accent)}>España</span>
          </span>
        )}
      </div>
    );
  },
);
