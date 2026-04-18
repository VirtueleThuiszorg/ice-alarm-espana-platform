import { lazy, Suspense, useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import { PageLoader } from "@/components/ui/page-loader";
import { PageTracker } from "@/components/analytics/PageTracker";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSelectionModal } from "@/components/LanguageSelectionModal";
import { CookieConsentBanner } from "@/components/gdpr/CookieConsentBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SessionTimeoutWarning } from "@/components/SessionTimeoutWarning";
import { GlobalSearch } from "@/components/GlobalSearch";
import { SkipLink } from "@/components/ui/skip-link";
import { RouteAnnouncer } from "@/components/ui/route-announcer";
import i18n from "@/i18n";

/**
 * Retry a dynamic import after a new deployment invalidates chunk URLs.
 * On failure, triggers a single page reload so the browser fetches the
 * new HTML with updated chunk hashes. A sessionStorage flag prevents
 * infinite reload loops.
 */
function lazyWithRetry(importFn: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    importFn().catch((error: unknown) => {
      const key = "chunk-reload-" + window.location.pathname;
      const alreadyReloaded = sessionStorage.getItem(key);

      if (!alreadyReloaded) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        // Return a never-resolving promise so React doesn't render stale state
        return new Promise(() => {});
      }

      // Already reloaded once for this page — clear flag and let error propagate
      sessionStorage.removeItem(key);
      throw error;
    })
  );
}

// Auth - Not lazy loaded (critical path)
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Layouts - Not lazy loaded (used frequently)
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CallCentreLayout } from "@/components/layout/CallCentreLayout";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { PartnerLayout } from "@/components/layout/PartnerLayout";

// Public Pages - Lazy loaded
const Index = lazyWithRetry(() => import("./pages/Index"));
const ContactPage = lazyWithRetry(() => import("./pages/ContactPage"));
const PendantPage = lazyWithRetry(() => import("./pages/PendantPage"));
const TermsPage = lazyWithRetry(() => import("./pages/TermsPage"));
const PrivacyPage = lazyWithRetry(() => import("./pages/PrivacyPage"));
const BlogListPage = lazyWithRetry(() => import("./pages/blog/BlogListPage"));
const BlogPostPage = lazyWithRetry(() => import("./pages/blog/BlogPostPage"));
const ReferralRedirect = lazyWithRetry(() => import("./pages/ReferralRedirect"));
const KnowledgeBasePage = lazyWithRetry(() => import("./pages/KnowledgeBasePage"));
const HowItWorksPage = lazyWithRetry(() => import("./pages/HowItWorksPage"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));

// Join Flow - Lazy loaded
const JoinWizard = lazyWithRetry(() => import("./pages/join/JoinWizard"));

// Auth Pages - Lazy loaded
const Login = lazyWithRetry(() => import("./pages/auth/Login"));
const ForgotPassword = lazyWithRetry(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/auth/ResetPassword"));
const StaffLogin = lazyWithRetry(() => import("./pages/auth/StaffLogin"));
const CompleteRegistration = lazyWithRetry(() => import("./pages/auth/CompleteRegistration"));
const Unauthorized = lazyWithRetry(() => import("./pages/auth/Unauthorized"));
const StaffInvitePage = lazyWithRetry(() => import("./pages/staff/StaffInvitePage"));

// Admin Pages - Lazy loaded
const AdminDashboard = lazyWithRetry(() => import("./pages/admin/AdminDashboard"));
const MembersPage = lazyWithRetry(() => import("./pages/admin/MembersPage"));
const DevicesPage = lazyWithRetry(() => import("./pages/admin/DevicesPage"));
const DeviceDetailPage = lazyWithRetry(() => import("./pages/admin/DeviceDetailPage"));
const OrdersPage = lazyWithRetry(() => import("./pages/admin/OrdersPage"));
const SubscriptionsPage = lazyWithRetry(() => import("./pages/admin/SubscriptionsPage"));
const PaymentsPage = lazyWithRetry(() => import("./pages/admin/PaymentsPage"));
const AlertsPage = lazyWithRetry(() => import("./pages/admin/AlertsPage"));
const StaffPage = lazyWithRetry(() => import("./pages/admin/StaffPage"));
const StaffDetailPage = lazyWithRetry(() => import("./pages/admin/StaffDetailPage"));
const ReportsPage = lazyWithRetry(() => import("./pages/admin/ReportsPage"));
const SettingsPage = lazyWithRetry(() => import("./pages/admin/SettingsPage"));
const MessagesPage = lazyWithRetry(() => import("./pages/admin/MessagesPage"));
const TasksPage = lazyWithRetry(() => import("./pages/admin/TasksPage"));
const AdminTicketsPage = lazyWithRetry(() => import("./pages/admin/TicketsPage"));
const LeadsPage = lazyWithRetry(() => import("./pages/admin/LeadsPage"));
const MemberDetailPage = lazyWithRetry(() => import("./pages/admin/MemberDetailPage"));
const AddMemberWizard = lazyWithRetry(() => import("./pages/admin/AddMemberWizard"));
const PartnersPage = lazyWithRetry(() => import("./pages/admin/PartnersPage"));
const PartnerDetailPage = lazyWithRetry(() => import("./pages/admin/PartnerDetailPage"));
const AddPartnerPage = lazyWithRetry(() => import("./pages/admin/AddPartnerPage"));
const CommissionsPage = lazyWithRetry(() => import("./pages/admin/CommissionsPage"));
const PartnersQAPage = lazyWithRetry(() => import("./pages/admin/PartnersQAPage"));
const AIBehaviorsPage = lazyWithRetry(() => import("./pages/admin/AIBehaviorsPage"));
const AIAgentDetail = lazyWithRetry(() => import("./pages/admin/AIAgentDetail"));
const CRMImportPage = lazyWithRetry(() => import("./pages/admin/CRMImportPage"));
const CRMContactsPage = lazyWithRetry(() => import("./pages/admin/CRMContactsPage"));
const CRMContactDetailPage = lazyWithRetry(() => import("./pages/admin/CRMContactDetailPage"));
const ImportBatchesPage = lazyWithRetry(() => import("./pages/admin/ImportBatchesPage"));
const FinanceDashboard = lazyWithRetry(() => import("./pages/admin/FinanceDashboard"));
const AnalyticsPage = lazyWithRetry(() => import("./pages/admin/AnalyticsPage"));
const EV07BPage = lazyWithRetry(() => import("./pages/admin/EV07BPage"));
const MediaManagerPage = lazyWithRetry(() => import("./pages/admin/MediaManagerPage"));
const AIOutreachPage = lazyWithRetry(() => import("./pages/admin/AIOutreachPage"));
const PartnerPricingSettingsPage = lazyWithRetry(() => import("./pages/admin/PartnerPricingSettingsPage"));
const VideoHubPage = lazyWithRetry(() => import("./pages/admin/VideoHubPage"));
const CommunicationsDashboardPage = lazyWithRetry(() => import("./pages/admin/CommunicationsDashboardPage"));
const IsabellaOperationsPage = lazyWithRetry(() => import("./pages/admin/IsabellaOperationsPage"));
const NotificationsPage = lazyWithRetry(() => import("./pages/admin/NotificationsPage"));
const BlogManagerPage = lazyWithRetry(() => import("./pages/admin/BlogManagerPage"));
const AuditLogPage = lazyWithRetry(() => import("./pages/admin/AuditLogPage"));
const SLADashboardPage = lazyWithRetry(() => import("./pages/admin/SLADashboardPage"));
const FeedbackDashboardPage = lazyWithRetry(() => import("./pages/admin/FeedbackDashboardPage"));
const TestimonialsPage = lazyWithRetry(() => import("./pages/admin/TestimonialsPage"));
const RotaPage = lazyWithRetry(() => import("./pages/admin/RotaPage"));
const AdminHolidaysPage = lazyWithRetry(() => import("./pages/admin/HolidaysPage"));

// Partner Pages - Lazy loaded
const PartnerOnboarding = lazyWithRetry(() => import("./pages/partner/PartnerOnboarding"));
const PartnerJoin = lazyWithRetry(() => import("./pages/partner/PartnerJoin"));
const PartnerVerify = lazyWithRetry(() => import("./pages/partner/PartnerVerify"));
const PartnerLogin = lazyWithRetry(() => import("./pages/partner/PartnerLogin"));
const PartnerInvitePage = lazyWithRetry(() => import("./pages/partner/PartnerInvitePage"));
const PartnerDashboard = lazyWithRetry(() => import("./pages/partner/PartnerDashboard"));
const PartnerInvitesPage = lazyWithRetry(() => import("./pages/partner/PartnerInvitesPage"));
const PartnerMarketingPage = lazyWithRetry(() => import("./pages/partner/PartnerMarketingPage"));
const PartnerCommissionsPage = lazyWithRetry(() => import("./pages/partner/PartnerCommissionsPage"));
const PartnerAgreementPage = lazyWithRetry(() => import("./pages/partner/PartnerAgreementPage"));
const PartnerSettingsPage = lazyWithRetry(() => import("./pages/partner/PartnerSettingsPage"));
const PartnerMembersPage = lazyWithRetry(() => import("./pages/partner/PartnerMembersPage"));
const PartnerAlertsPage = lazyWithRetry(() => import("./pages/partner/PartnerAlertsPage"));
const PartnerSupportPage = lazyWithRetry(() => import("./pages/partner/PartnerSupportPage"));

// Call Centre Pages - Lazy loaded
const StaffDashboard = lazyWithRetry(() => import("./pages/call-centre/StaffDashboard"));
const CallCentreDashboard = lazyWithRetry(() => import("./pages/call-centre/CallCentreDashboard"));
const ShiftNotesPage = lazyWithRetry(() => import("./pages/call-centre/ShiftNotesPage"));
const ShiftHistoryPage = lazyWithRetry(() => import("./pages/call-centre/ShiftHistoryPage"));
const StaffPreferencesPage = lazyWithRetry(() => import("./pages/call-centre/StaffPreferencesPage"));
const CallCentreTasksPage = lazyWithRetry(() => import("./pages/call-centre/TasksPage"));
const CallCentreMembersPage = lazyWithRetry(() => import("./pages/call-centre/MembersPage"));
const CallCentreMessagesPage = lazyWithRetry(() => import("./pages/call-centre/MessagesPage"));
const CallCentreTicketsPage = lazyWithRetry(() => import("./pages/call-centre/TicketsPage"));
const CallCentreLeadsPage = lazyWithRetry(() => import("./pages/call-centre/LeadsPage"));
const CallCentreDocumentsPage = lazyWithRetry(() => import("./pages/call-centre/DocumentsPage"));
const CallCentreHolidaysPage = lazyWithRetry(() => import("./pages/call-centre/HolidaysPage"));
const SOSAlertPage = lazyWithRetry(() => import("./pages/call-centre/SOSAlertPage"));

// Client Pages - Lazy loaded
const ClientDashboard = lazyWithRetry(() => import("./pages/client/ClientDashboard"));
const ProfilePage = lazyWithRetry(() => import("./pages/client/ProfilePage"));
const MedicalInfoPage = lazyWithRetry(() => import("./pages/client/MedicalInfoPage"));
const EmergencyContactsPage = lazyWithRetry(() => import("./pages/client/EmergencyContactsPage"));
const DevicePage = lazyWithRetry(() => import("./pages/client/DevicePage"));
const SubscriptionPage = lazyWithRetry(() => import("./pages/client/SubscriptionPage"));
const AlertHistoryPage = lazyWithRetry(() => import("./pages/client/AlertHistoryPage"));
const SupportPage = lazyWithRetry(() => import("./pages/client/SupportPage"));
const ClientMessagesPage = lazyWithRetry(() => import("./pages/client/MessagesPage"));

// Public Pages that don't require auth
const MemberUpdatePage = lazyWithRetry(() => import("./pages/MemberUpdatePage"));

// Optimized QueryClient with global caching defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes - data considered fresh
      gcTime: 1000 * 60 * 10, // 10 minutes - garbage collection time
      retry: 1, // Only 1 retry on failure
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnReconnect: true, // Refetch when connection is restored
    },
  },
});

// Prefetch company settings immediately for faster page loads
queryClient.prefetchQuery({
  queryKey: ["company-settings"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["settings_company_name", "settings_emergency_phone", "settings_support_email", "settings_address"]);

    if (error) throw error;

    const settingsMap = (data || []).reduce((acc, setting) => {
      const normalizedKey = setting.key.replace(/^settings_/, '');
      acc[normalizedKey] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    return {
      company_name: settingsMap.company_name || "ICE Alarm España",
      emergency_phone: settingsMap.emergency_phone || "+34 900 123 456",
      support_email: settingsMap.support_email || "info@icealarm.es",
      address: settingsMap.address || "Calle Principal 1, Albox, 04800 Almería"
    };
  },
  staleTime: 1000 * 60 * 30, // 30 minutes
});

// Prefetch website images for hero sections immediately
queryClient.prefetchQuery({
  queryKey: ["website-images-batch", ["homepage_hero", "homepage_pendant_promo", "pendant_hero", "pendant_specs"]],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("website_images")
      .select("id, location_key, image_url, alt_text, updated_at")
      .in("location_key", ["homepage_hero", "homepage_pendant_promo", "pendant_hero", "pendant_specs"]);

    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 30, // 30 minutes
});

// Intercept recovery redirects from password reset emails
// We must let Supabase process the hash tokens FIRST to establish the session,
// then navigate to /reset-password once the PASSWORD_RECOVERY event fires.
const RecoveryRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('type=recovery')) return;

    // Listen for Supabase to process the recovery tokens from the hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('isRecoveryFlow', 'true');
        navigate('/reset-password', { replace: true });
        subscription.unsubscribe();
      }
    });

    // Safety timeout: if the event doesn't fire within 10s, navigate anyway
    const timeout = setTimeout(() => {
      sessionStorage.setItem('isRecoveryFlow', 'true');
      navigate('/reset-password', { replace: true });
      subscription.unsubscribe();
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return null;
};

const App = () => {
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Clear chunk-reload flags on successful load (prevents stale flags blocking future reloads)
  useEffect(() => {
    const key = "chunk-reload-" + window.location.pathname;
    sessionStorage.removeItem(key);
  }, []);

  // Global unhandled promise rejection handler - prevents blank screens
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault(); // Prevent crash
      // Dynamic import to show toast without blocking
      import("sonner").then(({ toast }) => {
        toast.error("Something went wrong. Please try again.");
      });
    };

    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  useEffect(() => {
    // Check if this is a first-time visitor
    const hasSelectedLanguage = localStorage.getItem("iceAlarmLanguageSelected");
    if (!hasSelectedLanguage) {
      setShowLanguageModal(true);
    }
  }, []);

  const handleLanguageSelect = async (langCode: string) => {
    await i18n.changeLanguage(langCode);
    localStorage.setItem("iceAlarmLanguageSelected", "true");
    setShowLanguageModal(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <PageTracker />
        <RouteAnnouncer />
        <RecoveryRedirect />
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <SessionTimeoutWarning />
            <GlobalSearch />

            {/* Language Selection Modal for First-Time Visitors */}
            <LanguageSelectionModal
              open={showLanguageModal}
              onLanguageSelect={handleLanguageSelect}
            />

            {/* GDPR Cookie Consent Banner */}
            <CookieConsentBanner />

            <SkipLink />
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <div id="main-content">
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<Index />} />
                    <Route path="/how-it-works" element={<HowItWorksPage />} />
                    <Route path="/pendant" element={<PendantPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/blog" element={<BlogListPage />} />
                    <Route path="/blog/:slug" element={<BlogPostPage />} />
                    <Route path="/join" element={<JoinWizard />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/staff/login" element={<StaffLogin />} />
                    <Route path="/staff/invite" element={<StaffInvitePage />} />
                    <Route path="/register" element={<Navigate to="/join" replace />} />
                    <Route path="/complete-registration" element={<CompleteRegistration />} />
                    <Route path="/unauthorized" element={<Unauthorized />} />
                    <Route path="/help" element={<KnowledgeBasePage />} />
                    <Route path="/member-update" element={<MemberUpdatePage />} />

                    {/* Admin Dashboard Routes - Require Admin Role */}
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute requireStaff requireAdmin>
                          <AdminLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<AdminDashboard />} />
                      <Route path="members" element={<MembersPage />} />
                      <Route path="devices" element={<DevicesPage />} />
                      <Route path="devices/:id" element={<DeviceDetailPage />} />
                      <Route path="finance" element={<FinanceDashboard />} />
                      <Route path="orders" element={<OrdersPage />} />
                      <Route path="subscriptions" element={<SubscriptionsPage />} />
                      <Route path="payments" element={<PaymentsPage />} />
                      <Route path="alerts" element={<AlertsPage />} />
                      <Route path="staff" element={<StaffPage />} />
                      <Route path="staff/:staffId" element={<StaffDetailPage />} />
                      <Route path="reports" element={<ReportsPage />} />
                      <Route path="analytics" element={<AnalyticsPage />} />
                      <Route path="ev07b" element={<EV07BPage />} />
                      <Route path="products" element={<Navigate to="/admin/ev07b" replace />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="messages" element={<MessagesPage />} />
                      <Route path="tasks" element={<TasksPage />} />
                      <Route path="tickets" element={<AdminTicketsPage />} />
                      <Route path="notifications" element={<NotificationsPage />} />
                      <Route path="leads" element={<LeadsPage />} />
                      <Route path="members/new" element={<AddMemberWizard />} />
                      <Route path="members/:id" element={<MemberDetailPage />} />
                      <Route path="partners" element={<PartnersPage />} />
                      <Route path="partners/new" element={<AddPartnerPage />} />
                      <Route path="partners/:id" element={<PartnerDetailPage />} />
                      <Route path="partners-qa" element={<PartnersQAPage />} />
                      <Route path="commissions" element={<CommissionsPage />} />
                      <Route path="crm-import" element={<CRMImportPage />} />
                      <Route path="crm-import/batches" element={<ImportBatchesPage />} />
                      <Route path="crm-contacts" element={<CRMContactsPage />} />
                      <Route path="crm-contacts/:id" element={<CRMContactDetailPage />} />
                      <Route path="ai" element={<AIBehaviorsPage />} />
                      <Route path="ai/agents/:agentKey" element={<AIAgentDetail />} />
                      <Route path="ai/operations" element={<IsabellaOperationsPage />} />
                      <Route path="media-manager" element={<MediaManagerPage />} />
                      <Route path="ai-outreach" element={<AIOutreachPage />} />
                      <Route path="video-hub" element={<VideoHubPage />} />
                      <Route path="communications" element={<CommunicationsDashboardPage />} />
                      <Route path="partner-pricing" element={<PartnerPricingSettingsPage />} />
                      <Route path="blog" element={<BlogManagerPage />} />
                      <Route path="audit-log" element={<AuditLogPage />} />
                      <Route path="sla" element={<SLADashboardPage />} />
                      <Route path="feedback" element={<FeedbackDashboardPage />} />
                      <Route path="testimonials" element={<TestimonialsPage />} />
                      <Route path="rota" element={<RotaPage />} />
                      <Route path="holidays" element={<AdminHolidaysPage />} />
                    </Route>

                    {/* Partner Public Routes */}
                    <Route path="/partner" element={<PartnerOnboarding />} />
                    <Route path="/partner/join" element={<PartnerJoin />} />
                    <Route path="/partner/verify" element={<PartnerVerify />} />
                    <Route path="/partner/login" element={<PartnerLogin />} />
                    <Route path="/partner/invite" element={<PartnerInvitePage />} />

                    {/* Partner Dashboard Routes - Require Partner Role */}
                    <Route
                      path="/partner-dashboard"
                      element={
                        <ProtectedRoute requirePartner>
                          <PartnerLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<PartnerDashboard />} />
                      <Route path="invites" element={<PartnerInvitesPage />} />
                      <Route path="marketing" element={<PartnerMarketingPage />} />
                      <Route path="commissions" element={<PartnerCommissionsPage />} />
                      <Route path="agreement" element={<PartnerAgreementPage />} />
                      <Route path="settings" element={<PartnerSettingsPage />} />
                      <Route path="members" element={<PartnerMembersPage />} />
                      <Route path="alerts" element={<PartnerAlertsPage />} />
                      <Route path="support" element={<PartnerSupportPage />} />
                    </Route>

                    {/* Call Centre Dashboard Routes - Require Staff Role */}
                    <Route
                      path="/call-centre"
                      element={
                        <ProtectedRoute requireStaff>
                          <CallCentreLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<StaffDashboard />} />
                      <Route path="alerts" element={<CallCentreDashboard />} />
                      <Route path="sos-alert" element={<SOSAlertPage />} />
                      <Route path="members" element={<CallCentreMembersPage />} />
                      <Route path="members/:id" element={<MemberDetailPage />} />
                      <Route path="shift-notes" element={<ShiftNotesPage />} />
                      <Route path="shift-history" element={<ShiftHistoryPage />} />
                      <Route path="preferences" element={<StaffPreferencesPage />} />
                      <Route path="messages" element={<CallCentreMessagesPage />} />
                      <Route path="tasks" element={<CallCentreTasksPage />} />
                      <Route path="tickets" element={<CallCentreTicketsPage />} />
                      <Route path="leads" element={<CallCentreLeadsPage />} />
                      <Route path="documents" element={<CallCentreDocumentsPage />} />
                      <Route path="holidays" element={<CallCentreHolidaysPage />} />
                    </Route>

                    {/* Client Dashboard Routes - Require Member */}
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute requireMember>
                          <ClientLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<ClientDashboard />} />
                      <Route path="profile" element={<ProfilePage />} />
                      <Route path="medical" element={<MedicalInfoPage />} />
                      <Route path="contacts" element={<EmergencyContactsPage />} />
                      <Route path="device" element={<DevicePage />} />
                      <Route path="subscription" element={<SubscriptionPage />} />
                      <Route path="alerts" element={<AlertHistoryPage />} />
                      <Route path="support" element={<SupportPage />} />
                      <Route path="messages" element={<ClientMessagesPage />} />
                    </Route>

                    {/* Referral Tracking Routes */}
                    <Route path="/r/:partnerCode/:postSlug" element={<ReferralRedirect />} />
                    <Route path="/r/:partnerCode" element={<ReferralRedirect />} />

                    {/* Catch-all route */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </div>
              </Suspense>
            </ErrorBoundary>
          </AuthProvider>
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
