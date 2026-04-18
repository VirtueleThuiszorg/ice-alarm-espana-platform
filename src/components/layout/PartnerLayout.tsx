import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { PartnerSidebar } from "./PartnerSidebar";
import { PartnerHeader } from "@/components/partner/PartnerHeader";
import { AgreementRequiredModal } from "@/components/partner/AgreementRequiredModal";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { usePartnerData } from "@/hooks/usePartnerData";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function PartnerLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [searchParams] = useSearchParams();
  const { isStaff, staffRole } = useAuth();

  const isAdminRole = isStaff && (staffRole === "admin" || staffRole === "super_admin");
  const partnerIdParam = searchParams.get("partnerId");
  const isAdminViewMode = isAdminRole && !!partnerIdParam;

  // Fetch partner data to check agreement status
  const { data: partner, isLoading: partnerLoading } = usePartnerData(
    isAdminViewMode ? partnerIdParam : undefined
  );

  // Check if partner needs to sign the agreement
  const agreementRequired = partner && !partner.agreement_signed_at;
  
  // For admin view mode, don't block with agreement modal
  // For regular partners, block if agreement not signed
  const showAgreementModal = agreementRequired && !isAdminViewMode && !partnerLoading;

  // Show loading state while fetching partner data
  if (partnerLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PartnerSidebar 
        isAdminViewMode={isAdminViewMode} 
        partnerIdParam={partnerIdParam}
        onCollapsedChange={setCollapsed}
      />
      {/* Desktop: sidebar margin, Mobile: top padding for fixed header */}
      <div className={cn(
        "pt-16 md:pt-0 transition-all duration-300",
        collapsed ? "md:ml-16" : "md:ml-64"
      )}>
        <PartnerHeader 
          isAdminViewMode={isAdminViewMode}
          partnerIdParam={partnerIdParam}
        />
        <main className="p-4 md:p-6">
          {isAdminViewMode && (
            <div className="mb-4">
              <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg px-4 py-2">
                <span className="text-sm text-amber-800 dark:text-amber-200">
                  🔍 Admin View Mode — Viewing partner data as administrator
                </span>
              </div>
            </div>
          )}
          <SectionErrorBoundary section="partner" homePath="/partner-dashboard">
            <Outlet />
          </SectionErrorBoundary>
        </main>
      </div>

      {/* Agreement modal appears ON TOP of dashboard */}
      {showAgreementModal && partner && (
        <AgreementRequiredModal 
          partnerId={partner.id} 
          partnerName={partner.contact_name} 
        />
      )}
    </div>
  );
}
