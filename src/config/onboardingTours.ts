import type { TourStep } from "@/components/OnboardingTour";

/* ================================================================== */
/*  Member Dashboard Tour                                             */
/* ================================================================== */

export const memberDashboardTour: TourStep[] = [
  {
    target: "[data-tour='member-welcome']",
    title: "Welcome to ICE Alarm Espana",
    content:
      "This is your personal dashboard. From here you can manage your medical profile, emergency contacts, and connected devices. Let us show you around!",
    placement: "bottom",
  },
  {
    target: "[data-tour='member-profile']",
    title: "Your Profile",
    content:
      "View and update your personal information, address, and preferences. Keeping your profile up-to-date ensures our call centre has accurate details when you need help.",
    placement: "bottom",
  },
  {
    target: "[data-tour='member-medical']",
    title: "Medical Information",
    content:
      "Add your medical conditions, allergies, medications, and blood type. This critical information is shared with emergency services when an alert is triggered.",
    placement: "bottom",
  },
  {
    target: "[data-tour='member-contacts']",
    title: "Emergency Contacts",
    content:
      "Add family members, friends, or neighbours who should be notified during an emergency. You can set the contact order and preferred communication method.",
    placement: "right",
  },
  {
    target: "[data-tour='member-device']",
    title: "Your Device",
    content:
      "Monitor your pendant or wristband status, battery level, and GPS location. Run a test alert to make sure everything is working correctly.",
    placement: "left",
  },
  {
    target: "[data-tour='member-alerts']",
    title: "Alert History",
    content:
      "Review past alerts and their outcomes. Each entry shows the time, response, and resolution so you always have a full record.",
    placement: "top",
  },
  {
    target: "[data-tour='member-support']",
    title: "Get Support",
    content:
      "Need help? Contact our bilingual support team via chat, email, or phone. We are available 24/7 to assist you.",
    placement: "top",
  },
];

/* ================================================================== */
/*  Admin Dashboard Tour                                              */
/* ================================================================== */

export const adminDashboardTour: TourStep[] = [
  {
    target: "[data-tour='admin-overview']",
    title: "Admin Overview",
    content:
      "Welcome to the admin panel. This dashboard gives you a real-time snapshot of members, active alerts, partner activity, and system health.",
    placement: "bottom",
  },
  {
    target: "[data-tour='admin-members']",
    title: "Member Management",
    content:
      "Search, filter, and manage all registered members. View their profiles, devices, alert history, and subscription status from one place.",
    placement: "bottom",
  },
  {
    target: "[data-tour='admin-alerts']",
    title: "Alert Management",
    content:
      "Monitor live and historical alerts across the platform. Escalate, reassign, or close alerts and add internal notes for the call centre team.",
    placement: "right",
  },
  {
    target: "[data-tour='admin-partners']",
    title: "Partner Network",
    content:
      "Manage your affiliate and referral partners. Track commissions, approve new applications, and monitor partner performance metrics.",
    placement: "left",
  },
  {
    target: "[data-tour='admin-settings']",
    title: "System Settings",
    content:
      "Configure pricing, email templates, notification rules, GDPR policies, and other platform-wide settings from here.",
    placement: "bottom",
  },
  {
    target: "[data-tour='admin-ai']",
    title: "AI Command Centre",
    content:
      "Access AI-powered tools for content creation, social media management, customer insights, and automated outreach campaigns.",
    placement: "top",
  },
];

/* ================================================================== */
/*  Call Centre Tour                                                   */
/* ================================================================== */

export const callCentreTour: TourStep[] = [
  {
    target: "[data-tour='cc-alert-queue']",
    title: "Alert Queue",
    content:
      "Incoming alerts appear here in real time, ordered by priority. Red alerts require immediate action; amber alerts can be triaged. Click any alert to open the full detail panel.",
    placement: "right",
  },
  {
    target: "[data-tour='cc-member-search']",
    title: "Member Search",
    content:
      "Quickly look up any member by name, ID, or phone number. The search results include their medical info, emergency contacts, and device status.",
    placement: "bottom",
  },
  {
    target: "[data-tour='cc-shift-notes']",
    title: "Shift Notes",
    content:
      "Hand over important context to the next shift. Add notes about ongoing situations, pending callbacks, or members who need follow-up.",
    placement: "left",
  },
  {
    target: "[data-tour='cc-tasks']",
    title: "Task List",
    content:
      "Track follow-up tasks such as welfare checks, device replacements, or family callbacks. Mark tasks as complete to keep the queue clean.",
    placement: "bottom",
  },
];

/* ================================================================== */
/*  Partner Dashboard Tour                                            */
/* ================================================================== */

export const partnerDashboardTour: TourStep[] = [
  {
    target: "[data-tour='partner-welcome']",
    title: "Welcome, Partner!",
    content:
      "This is your partner dashboard. Track your referrals, commissions, and access marketing materials to help grow your network.",
    placement: "bottom",
  },
  {
    target: "[data-tour='partner-invites']",
    title: "Send Invites",
    content:
      "Invite potential members using your unique referral link. You can send invitations via email or share the link on social media.",
    placement: "bottom",
  },
  {
    target: "[data-tour='partner-marketing']",
    title: "Marketing Materials",
    content:
      "Download branded brochures, social media graphics, and email templates. All materials are ready to use with your partner code pre-filled.",
    placement: "right",
  },
  {
    target: "[data-tour='partner-commissions']",
    title: "Commissions",
    content:
      "Track your earnings in real time. See pending, approved, and paid commissions with full transparency on each referral conversion.",
    placement: "left",
  },
  {
    target: "[data-tour='partner-members']",
    title: "Your Members",
    content:
      "View the members you have referred, their subscription status, and device activation state. This helps you provide better support.",
    placement: "top",
  },
];
