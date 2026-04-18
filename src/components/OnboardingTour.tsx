import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface TourStep {
  target: string;       // CSS selector for the element to highlight
  title: string;
  content: string;
  placement: "top" | "bottom" | "left" | "right";
}

export interface OnboardingTourProps {
  steps: TourStep[];
  tourKey: string;
  onComplete: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const STORAGE_PREFIX = "ice_tour_";

function storageKey(tourKey: string) {
  return `${STORAGE_PREFIX}${tourKey}_completed`;
}

function isTourDone(tourKey: string): boolean {
  try {
    return localStorage.getItem(storageKey(tourKey)) === "true";
  } catch {
    return false;
  }
}

function markTourDone(tourKey: string) {
  try {
    localStorage.setItem(storageKey(tourKey), "true");
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
  }
}

/**
 * Compute the absolute position for the tooltip relative to the
 * highlighted target element.
 */
function computeTooltipPosition(
  rect: DOMRect,
  placement: TourStep["placement"],
  tooltipWidth: number,
  tooltipHeight: number,
) {
  const GAP = 14;

  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = rect.bottom + GAP + window.scrollY;
      left = rect.left + rect.width / 2 - tooltipWidth / 2 + window.scrollX;
      break;
    case "top":
      top = rect.top - tooltipHeight - GAP + window.scrollY;
      left = rect.left + rect.width / 2 - tooltipWidth / 2 + window.scrollX;
      break;
    case "right":
      top = rect.top + rect.height / 2 - tooltipHeight / 2 + window.scrollY;
      left = rect.right + GAP + window.scrollX;
      break;
    case "left":
      top = rect.top + rect.height / 2 - tooltipHeight / 2 + window.scrollY;
      left = rect.left - tooltipWidth - GAP + window.scrollX;
      break;
  }

  // Clamp so the tooltip stays within the viewport
  const maxLeft = window.innerWidth - tooltipWidth - 12 + window.scrollX;
  const minLeft = 12 + window.scrollX;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  const minTop = 12 + window.scrollY;
  top = Math.max(minTop, top);

  return { top, left };
}

/**
 * Return CSS for the small arrow / caret that points from the tooltip
 * toward the target element.
 */
function arrowStyle(placement: TourStep["placement"]): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
    borderStyle: "solid",
  };

  const SIZE = 8;

  switch (placement) {
    case "bottom":
      return {
        ...base,
        top: -SIZE,
        left: "50%",
        transform: "translateX(-50%)",
        borderWidth: `0 ${SIZE}px ${SIZE}px ${SIZE}px`,
        borderColor: "transparent transparent #1e293b transparent",
      };
    case "top":
      return {
        ...base,
        bottom: -SIZE,
        left: "50%",
        transform: "translateX(-50%)",
        borderWidth: `${SIZE}px ${SIZE}px 0 ${SIZE}px`,
        borderColor: "#1e293b transparent transparent transparent",
      };
    case "right":
      return {
        ...base,
        left: -SIZE,
        top: "50%",
        transform: "translateY(-50%)",
        borderWidth: `${SIZE}px ${SIZE}px ${SIZE}px 0`,
        borderColor: `transparent #1e293b transparent transparent`,
      };
    case "left":
      return {
        ...base,
        right: -SIZE,
        top: "50%",
        transform: "translateY(-50%)",
        borderWidth: `${SIZE}px 0 ${SIZE}px ${SIZE}px`,
        borderColor: `transparent transparent transparent #1e293b`,
      };
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function OnboardingTour({
  steps,
  tourKey,
  onComplete,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipSize, setTooltipSize] = useState({ w: 340, h: 200 });

  /* ---- Decide whether to show ---- */
  useEffect(() => {
    if (steps.length === 0) return;
    if (isTourDone(tourKey)) return;
    // Small delay so the page has time to render target elements
    const id = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(id);
  }, [steps, tourKey]);

  /* ---- Locate the target element and scroll to it ---- */
  const locateTarget = useCallback(() => {
    const step = steps[currentStep];
    if (!step) return;

    const el = document.querySelector(step.target);
    if (!el) {
      // Target not found; still show tooltip in center
      setTargetRect(null);
      return;
    }

    // Scroll into view if necessary
    const rect = el.getBoundingClientRect();
    const inViewport =
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth;

    if (!inViewport) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Re-measure after scroll
      setTimeout(() => {
        setTargetRect(el.getBoundingClientRect());
      }, 400);
    } else {
      setTargetRect(rect);
    }
  }, [currentStep, steps]);

  useEffect(() => {
    if (!visible) return;
    locateTarget();

    // Re-locate on resize / scroll
    const handleReposition = () => locateTarget();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [visible, locateTarget]);

  /* ---- Measure tooltip so we can centre it properly ---- */
  useEffect(() => {
    if (tooltipRef.current) {
      const { offsetWidth, offsetHeight } = tooltipRef.current;
      setTooltipSize({ w: offsetWidth, h: offsetHeight });
    }
  }, [currentStep, visible, targetRect]);

  /* ---- Navigation handlers ---- */
  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      finish();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSkip = () => {
    finish();
  };

  const finish = () => {
    markTourDone(tourKey);
    setVisible(false);
    onComplete();
  };

  /* ---- Early exit ---- */
  if (!visible || steps.length === 0) return null;

  const step = steps[currentStep];
  const PADDING = 8;

  /* ---- Overlay cutout rects ---- */
  const cutout = targetRect
    ? {
        top: targetRect.top - PADDING + window.scrollY,
        left: targetRect.left - PADDING + window.scrollX,
        width: targetRect.width + PADDING * 2,
        height: targetRect.height + PADDING * 2,
        borderRadius: 8,
      }
    : null;

  /* ---- Tooltip position ---- */
  const tooltipPos = targetRect
    ? computeTooltipPosition(
        targetRect,
        step.placement,
        tooltipSize.w,
        tooltipSize.h,
      )
    : {
        top: window.innerHeight / 2 - tooltipSize.h / 2 + window.scrollY,
        left: window.innerWidth / 2 - tooltipSize.w / 2 + window.scrollX,
      };

  /* ---- Render via portal ---- */
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        pointerEvents: "none",
      }}
      aria-live="polite"
    >
      {/* Dark overlay with cutout */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "auto",
        }}
        onClick={handleSkip}
      >
        <defs>
          <mask id={`tour-mask-${tourKey}`}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {cutout && (
              <rect
                x={cutout.left - window.scrollX}
                y={cutout.top - window.scrollY}
                width={cutout.width}
                height={cutout.height}
                rx={cutout.borderRadius}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask={`url(#tour-mask-${tourKey})`}
        />
      </svg>

      {/* Highlighted ring around target */}
      {cutout && (
        <div
          style={{
            position: "absolute",
            top: cutout.top - window.scrollY,
            left: cutout.left - window.scrollX,
            width: cutout.width,
            height: cutout.height,
            borderRadius: cutout.borderRadius,
            boxShadow: "0 0 0 3px #E74C3C, 0 0 12px rgba(231,76,60,0.4)",
            pointerEvents: "none",
            transition: "all 0.3s ease",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          top: tooltipPos.top - window.scrollY,
          left: tooltipPos.left - window.scrollX,
          width: 340,
          maxWidth: "calc(100vw - 24px)",
          background: "#1e293b",
          color: "#f1f5f9",
          borderRadius: 12,
          padding: "20px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          pointerEvents: "auto",
          transition: "top 0.3s ease, left 0.3s ease",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Arrow */}
        {targetRect && <div style={arrowStyle(step.placement)} />}

        {/* Step counter */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span
            style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}
          >
            {currentStep + 1}/{steps.length}
          </span>
          <button
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 13,
              padding: "2px 6px",
            }}
          >
            Skip
          </button>
        </div>

        {/* Title */}
        <h3
          style={{
            margin: "0 0 8px",
            fontSize: 17,
            fontWeight: 700,
            color: "#ffffff",
          }}
        >
          {step.title}
        </h3>

        {/* Content */}
        <p
          style={{
            margin: "0 0 20px",
            fontSize: 14,
            lineHeight: 1.55,
            color: "#cbd5e1",
          }}
        >
          {step.content}
        </p>

        {/* Navigation buttons */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            style={{
              background: "transparent",
              border: "1px solid #475569",
              color: currentStep === 0 ? "#475569" : "#e2e8f0",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: 14,
              fontWeight: 500,
              cursor: currentStep === 0 ? "default" : "pointer",
              transition: "opacity 0.15s",
              opacity: currentStep === 0 ? 0.5 : 1,
            }}
          >
            Back
          </button>
          <button
            onClick={handleNext}
            style={{
              background: "#E74C3C",
              border: "none",
              color: "#ffffff",
              borderRadius: 8,
              padding: "8px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLButtonElement).style.background = "#c0392b")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLButtonElement).style.background = "#E74C3C")
            }
          >
            {currentStep < steps.length - 1 ? "Next" : "Finish"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
