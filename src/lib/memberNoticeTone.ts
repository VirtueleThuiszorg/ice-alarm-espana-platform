/**
 * AMBER ON CREAM — the one tone a member-facing notice is allowed to use.
 *
 * R3 names the colours (`#FEF8E6` ground, `#F4E3A8` border, `#7A5C00` text) and R2 says why they
 * are not brand red: *"Brand red never on an alert, warning or status."* A member reading that
 * their alarm is not being monitored needs to act; an 80-year-old reading it in emergency red is
 * being frightened rather than informed, and frightened is not a state anybody adds an emergency
 * contact from.
 *
 * It lives here because two notices now use it — the readiness notice in the header and the
 * membership condition on the Membership page — and a hex triple written out twice is a hex
 * triple that gets changed once.
 */
export const MEMBER_NOTICE_TONE =
  "bg-[#FEF8E6] text-[#7A5C00] dark:bg-amber-950 dark:text-amber-50 border-[#F4E3A8] dark:border-amber-800";
