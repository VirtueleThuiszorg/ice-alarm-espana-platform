import React, { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ExportFormat = "csv" | "pdf";

export interface ExportOption {
  format: ExportFormat;
  label?: string;
  onExport: () => Promise<void>;
}

interface ExportButtonProps {
  /** Primary export handler (used when there is a single action, or as default click). */
  onExport: () => Promise<void>;
  /** Button label text. */
  label?: string;
  /** shadcn Button variant. */
  variant?: ButtonProps["variant"];
  /** shadcn Button size. */
  size?: ButtonProps["size"];
  /** Additional class names for the trigger button. */
  className?: string;
  /**
   * When provided, the button becomes a split-button dropdown with multiple format options.
   * If omitted, the button behaves as a simple click-to-export button.
   */
  formats?: ExportOption[];
  /** Externally controlled loading state (e.g. from useReportExport). */
  isLoading?: boolean;
  /** Whether the button is disabled. */
  disabled?: boolean;
}

const FORMAT_ICONS: Record<ExportFormat, React.ReactNode> = {
  csv: <FileSpreadsheet className="h-4 w-4 mr-2" />,
  pdf: <FileText className="h-4 w-4 mr-2" />,
};

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "Export CSV",
  pdf: "Export PDF",
};

/**
 * Reusable export button for admin pages.
 *
 * - **Simple mode**: pass `onExport` and optionally `label`.
 * - **Dropdown mode**: pass `formats` with multiple ExportOption entries.
 *   A dropdown menu lets the user choose the format.
 */
export function ExportButton({
  onExport,
  label = "Export",
  variant = "outline",
  size = "default",
  className,
  formats,
  isLoading: externalLoading,
  disabled,
}: ExportButtonProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = externalLoading || internalLoading;

  const handleExport = async (fn: () => Promise<void>) => {
    if (loading) return;
    setInternalLoading(true);
    try {
      await fn();
    } finally {
      setInternalLoading(false);
    }
  };

  // ---- Simple button (no dropdown) ----
  if (!formats || formats.length === 0) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={loading || disabled}
        onClick={() => handleExport(onExport)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {label}
      </Button>
    );
  }

  // ---- Dropdown button (multiple formats) ----
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled={loading || disabled}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {label}
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {formats.map((opt) => (
          <DropdownMenuItem
            key={opt.format}
            disabled={loading}
            onClick={() => handleExport(opt.onExport)}
          >
            {FORMAT_ICONS[opt.format]}
            {opt.label ?? FORMAT_LABELS[opt.format]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
