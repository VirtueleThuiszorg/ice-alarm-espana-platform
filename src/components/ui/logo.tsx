import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "default" | "white" | "dark" | "sidebar";
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

/**
 * Care Conneqt Logo
 * Two interlocking "C" shapes — teal + navy — forming the "Connected" mark.
 * API preserved from ICE v1's Logo component so no other usages break.
 */
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
      sm: "text-lg",
      md: "text-xl",
      lg: "text-2xl",
    };

    // Brand colors for the two-C mark
    // Left C = teal, Right C = deep blue (matches Care Conneqt reference)
    const markColors = {
      default: { left: "hsl(185, 75%, 45%)", right: "hsl(215, 85%, 35%)" },
      white:   { left: "hsl(0, 0%, 100%)",   right: "hsl(0, 0%, 100%)" },
      dark:    { left: "hsl(185, 75%, 45%)", right: "hsl(215, 85%, 35%)" },
      sidebar: { left: "hsl(185, 75%, 45%)", right: "hsl(215, 85%, 35%)" },
    };

    const textColors = {
      default: { main: "text-foreground", accent: "text-primary" },
      white:   { main: "text-white",       accent: "text-white/80" },
      dark:    { main: "text-slate-900",   accent: "text-primary" },
      sidebar: { main: "text-white",       accent: "text-[hsl(185,75%,55%)]" },
    };

    const { left: leftColor, right: rightColor } = markColors[variant];
    const text = textColors[variant];

    return (
      <div ref={ref} className={cn("flex items-center gap-2", sizeClasses[size], className)}>
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={iconSizes[size]}
          aria-label="Care Conneqt"
        >
          {/* Left C */}
          <path
            d="M0 20 C0 8.95 8.95 0 20 0 L50 0 L50 25 L25 25 C22.24 25 20 27.24 20 30 L20 45 L50 45 L50 70 L20 70 C8.95 70 0 61.05 0 50 L0 20 Z"
            fill={leftColor}
          />
          {/* Right C */}
          <path
            d="M100 80 C100 91.05 91.05 100 80 100 L50 100 L50 75 L75 75 C77.76 75 80 72.76 80 70 L80 55 L50 55 L50 30 L80 30 C91.05 30 100 38.95 100 50 L100 80 Z"
            fill={rightColor}
          />
        </svg>

        {showText && (
          <div className="flex flex-col leading-none">
            {/* Wordmark — Fraunces (display/serif), weight ~600. Tagline stays sans. */}
            <span className={cn("font-semibold tracking-tight font-display", textSizes[size], text.main)}>
              Care Conneqt
            </span>
            <span className={cn("text-xs font-medium", text.accent)}>
              Connected Health
            </span>
          </div>
        )}
      </div>
    );
  }
);
