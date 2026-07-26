import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { cn } from "@/lib/utils";

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    // "theme-admin" scopes the internal-portal token block (see index.css) to
    // every /admin route in one place — same aqua wash and crisp white cards as
    // the call centre, inherited, with no per-page styling.
    <div className="theme-admin min-h-screen bg-background text-foreground">
      <AdminSidebar onCollapsedChange={setCollapsed} />
      {/* Desktop: sidebar margin, Mobile: top padding for fixed header */}
      <div className={cn(
        "pt-16 md:pt-0 transition-all duration-300",
        collapsed ? "md:ml-16" : "md:ml-64"
      )}>
        <AdminHeader />
        <main className="p-4 md:p-6">
          <SectionErrorBoundary section="admin" homePath="/admin">
            <Outlet />
          </SectionErrorBoundary>
        </main>
      </div>
    </div>
  );
}
