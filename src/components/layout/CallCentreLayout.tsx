import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { CallCentreSidebar } from "./CallCentreSidebar";
import { CallCentreHeader } from "./CallCentreHeader";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { cn } from "@/lib/utils";
import { SOSAlertBar } from "@/components/call-centre/sos/SOSAlertBar";
import { useSOSTakeover } from "@/hooks/useSOSTakeover";
import { useTwilioDevice } from "@/hooks/useTwilioDevice";

export function CallCentreLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { isTakeoverActive } = useSOSTakeover();
  const location = useLocation();
  const navigate = useNavigate();

  // Initialize Twilio device at layout level so it's always registered
  useTwilioDevice();

  const showSOSReturnButton =
    isTakeoverActive && location.pathname !== "/call-centre/sos-alert";

  return (
    // "theme-staff" scopes the aqua-wash token block (see index.css) to every
    // call-centre route in one place — page tint + crisp white cards inherit
    // from here, no per-page styling.
    <div className="theme-staff min-h-screen bg-background text-foreground">
      {/* Floating button to navigate to SOS alert page */}
      {showSOSReturnButton && (
        <button
          onClick={() => navigate("/call-centre/sos-alert")}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-full shadow-lg shadow-red-900/40 transition-all hover:scale-105 animate-pulse"
        >
          <AlertTriangle className="h-5 w-5" />
          <span>Return to SOS Alert</span>
        </button>
      )}

      <CallCentreSidebar onCollapsedChange={setCollapsed} />
      {/* Desktop: sidebar margin, Mobile: top padding for fixed header */}
      <div className={cn(
        "pt-16 md:pt-0 transition-all duration-300",
        collapsed ? "md:ml-16" : "md:ml-64"
      )}>
        <CallCentreHeader />
        {/* SOS Alert Bar — visible on ALL call centre pages */}
        <SOSAlertBar />
        <main className="p-4 md:p-6">
          <SectionErrorBoundary section="call-centre" homePath="/call-centre">
            <Outlet />
          </SectionErrorBoundary>
        </main>
      </div>
    </div>
  );
}
