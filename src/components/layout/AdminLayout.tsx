import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { cn } from "@/lib/utils";

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
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
