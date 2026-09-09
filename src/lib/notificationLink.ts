import type { NotificationType } from "@/hooks/useNotifications";

/**
 * WHERE A NOTIFICATION TAKES YOU — one implementation, two surfaces.
 *
 * There were two. `NotificationBell` had a version that routed by
 * `entity_type` and sent members to their own pages; `/admin/notifications` had
 * a shorter one that did neither. The same notification therefore led to two
 * different places depending on where you clicked it, and the notifications
 * page — the one you open when you are catching up — was the poorer of the two.
 *
 * The `metadata.link` escape hatch both copies checked FIRST is deliberately
 * gone: `notification_log` has no `link` column and `mapRow` cannot populate
 * one, so the branch was unreachable in both copies. It also read a
 * staff-authored string and navigated to it, which is a route worth not having.
 *
 * MEMBERS ARE ROUTED FIRST. Every entity_type below targets a staff route, and
 * sending a member to one lands them on /unauthorized — so their surfaces are
 * decided before any of it is consulted.
 */
export function notificationLink(
  type: NotificationType,
  metadata: Record<string, unknown> | null,
  isStaff: boolean,
): string | null {
  if (!isStaff) {
    switch (type) {
      case "message":
        return "/dashboard/messages";
      case "alert":
        return "/dashboard/alerts";
      default:
        return "/dashboard";
    }
  }

  const entityType = metadata?.entity_type as string | undefined;
  switch (entityType) {
    case "social_post":
      return "/admin/media-manager";
    case "outreach_pipeline":
    case "outreach_email":
      return "/admin/ai-outreach";
    case "video_render":
      return "/admin/video-hub";
    // A new enquiry from the public Contact page. `/call-centre/leads`, not
    // `/admin/leads`: both list the same rows, but the admin route is behind
    // requireAdmin, so an operator following their own notification would land
    // on /unauthorized. Admins reach the call-centre route too.
    case "lead":
      return "/call-centre/leads";
    // Money problems from `stripe-webhook`: a payment that did not match the order, a
    // subscription that failed to activate, a failed renewal. Both routes are inside
    // `/admin`, which is behind requireAdmin — safe here ONLY because these notifications are
    // addressed to individual admins rather than broadcast to all staff
    // (`_shared/staff-bell.ts` explains why that matters).
    case "order":
      return "/admin/orders";
    case "subscription":
      return "/admin/subscriptions";
  }

  switch (type) {
    case "alert":
      return "/call-centre";
    case "message":
      return "/admin/messages";
    case "task":
      return "/admin/tasks";
    case "system":
      return "/admin/settings";
    default:
      return null;
  }
}
