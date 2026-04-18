import { forwardRef } from "react";
import { Heart, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "default" | "white" | "dark" | "sidebar";
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export const Logo = forwardRef<HTMLDivElement, LogoProps>(
  function Logo({ variant = "default", size = "md", showText = true, className }, ref) {
    const sizeClasses = {
      sm: "h-8",
      md: "h-10",
      lg: "h-14",
    };

    const iconSizes = {
      sm: "w-5 h-5",
      md: "w-6 h-6",
      lg: "w-8 h-8",
    };

    const textSizes = {
      sm: "text-lg",
      md: "text-xl",
      lg: "text-2xl",
    };

    const colorClasses = {
      default: {
        icon: "text-primary",
        text: "text-foreground",
        accent: "text-primary",
      },
      white: {
        icon: "text-white",
        text: "text-white",
        accent: "text-white/80",
      },
      dark: {
        icon: "text-primary",
        text: "text-slate-900",
        accent: "text-primary",
      },
      sidebar: {
        icon: "text-primary",
        text: "text-white",
        accent: "text-primary",
      },
    };

    const colors = colorClasses[variant];

    return (
      <div ref={ref} className={cn("flex items-center gap-2", sizeClasses[size], className)}>
        <div className="relative">
          <div className={cn(
            "flex items-center justify-center rounded-xl bg-primary/10 p-2",
            variant === "white" && "bg-white/20"
          )}>
            <Heart className={cn(iconSizes[size], colors.icon, "fill-current")} />
          </div>
          <Phone className={cn(
            "absolute -bottom-1 -right-1 w-3 h-3",
            colors.icon,
            size === "lg" && "w-4 h-4"
          )} />
        </div>
        {showText && (
          <div className="flex flex-col leading-none">
            <span className={cn("font-bold tracking-tight", textSizes[size], colors.text)}>
              ICE Alarm
            </span>
            <span className={cn("text-xs font-medium", colors.accent)}>
              España
            </span>
          </div>
        )}
      </div>
    );
  }
);
