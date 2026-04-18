// Shift scheduling constants for ICE Alarm España 24/7 call centre

export type ShiftType = "morning" | "afternoon" | "night";
export type HolidayStatus = "requested" | "approved" | "rejected" | "cancelled";
export type CoverStatus = "pending" | "accepted" | "declined" | "expired";

export interface ShiftTypeConfig {
  label: string;
  labelKey: string;
  start: string;
  end: string;
  color: string;
  bgClass: string;
  textClass: string;
  badgeLetter: string;
}

export const SHIFT_TYPES: Record<ShiftType, ShiftTypeConfig> = {
  morning: {
    label: "Morning",
    labelKey: "shifts.morning",
    start: "07:00",
    end: "15:00",
    color: "#f59e0b",
    bgClass: "bg-amber-500/20",
    textClass: "text-amber-600",
    badgeLetter: "M",
  },
  afternoon: {
    label: "Afternoon",
    labelKey: "shifts.afternoon",
    start: "15:00",
    end: "23:00",
    color: "#3b82f6",
    bgClass: "bg-blue-500/20",
    textClass: "text-blue-600",
    badgeLetter: "A",
  },
  night: {
    label: "Night",
    labelKey: "shifts.night",
    start: "23:00",
    end: "07:00",
    color: "#8b5cf6",
    bgClass: "bg-violet-500/20",
    textClass: "text-violet-600",
    badgeLetter: "N",
  },
};

export const HOLIDAY_STATUSES: Record<HolidayStatus, { labelKey: string; badgeClass: string }> = {
  requested: {
    labelKey: "holidays.statusRequested",
    badgeClass: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  },
  approved: {
    labelKey: "holidays.statusApproved",
    badgeClass: "bg-green-500/20 text-green-600 border-green-500/30",
  },
  rejected: {
    labelKey: "holidays.statusRejected",
    badgeClass: "bg-red-500/20 text-red-600 border-red-500/30",
  },
  cancelled: {
    labelKey: "holidays.statusCancelled",
    badgeClass: "bg-gray-500/20 text-gray-500 border-gray-500/30",
  },
};

export const COVER_STATUSES: Record<CoverStatus, { labelKey: string; badgeClass: string }> = {
  pending: {
    labelKey: "covers.statusPending",
    badgeClass: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  },
  accepted: {
    labelKey: "covers.statusAccepted",
    badgeClass: "bg-green-500/20 text-green-600 border-green-500/30",
  },
  declined: {
    labelKey: "covers.statusDeclined",
    badgeClass: "bg-red-500/20 text-red-600 border-red-500/30",
  },
  expired: {
    labelKey: "covers.statusExpired",
    badgeClass: "bg-gray-500/20 text-gray-500 border-gray-500/30",
  },
};

export const SHIFT_TYPE_OPTIONS: ShiftType[] = ["morning", "afternoon", "night"];
