import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

/**
 * Register keyboard shortcuts for power users.
 * Automatically ignores shortcuts when typing in inputs/textareas.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in form fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl
          ? e.ctrlKey || e.metaKey
          : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;

        if (e.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}

/**
 * Pre-configured shortcuts for the call centre dashboard.
 * Returns the shortcut list for display in a help dialog.
 */
export function useCallCentreShortcuts() {
  const navigate = useNavigate();

  const shortcuts: ShortcutConfig[] = [
    {
      key: "a",
      alt: true,
      action: () => navigate("/call-centre/alerts"),
      description: "Go to Alerts",
    },
    {
      key: "m",
      alt: true,
      action: () => navigate("/call-centre/members"),
      description: "Go to Members",
    },
    {
      key: "t",
      alt: true,
      action: () => navigate("/call-centre/tasks"),
      description: "Go to Tasks",
    },
    {
      key: "n",
      alt: true,
      action: () => navigate("/call-centre/shift-notes"),
      description: "Go to Shift Notes",
    },
    {
      key: "d",
      alt: true,
      action: () => navigate("/call-centre"),
      description: "Go to Dashboard",
    },
    {
      key: "l",
      alt: true,
      action: () => navigate("/call-centre/leads"),
      description: "Go to Leads",
    },
    {
      key: "i",
      alt: true,
      action: () => navigate("/call-centre/tickets"),
      description: "Go to Tickets",
    },
  ];

  useKeyboardShortcuts(shortcuts);

  return shortcuts;
}

/**
 * Pre-configured shortcuts for admin dashboard.
 */
export function useAdminShortcuts() {
  const navigate = useNavigate();

  const shortcuts: ShortcutConfig[] = [
    {
      key: "d",
      alt: true,
      action: () => navigate("/admin"),
      description: "Go to Dashboard",
    },
    {
      key: "m",
      alt: true,
      action: () => navigate("/admin/members"),
      description: "Go to Members",
    },
    {
      key: "p",
      alt: true,
      action: () => navigate("/admin/partners"),
      description: "Go to Partners",
    },
    {
      key: "a",
      alt: true,
      action: () => navigate("/admin/alerts"),
      description: "Go to Alerts",
    },
    {
      key: "o",
      alt: true,
      action: () => navigate("/admin/orders"),
      description: "Go to Orders",
    },
    {
      key: "s",
      alt: true,
      action: () => navigate("/admin/settings"),
      description: "Go to Settings",
    },
    {
      key: "f",
      alt: true,
      action: () => navigate("/admin/finance"),
      description: "Go to Finance",
    },
  ];

  useKeyboardShortcuts(shortcuts);

  return shortcuts;
}
