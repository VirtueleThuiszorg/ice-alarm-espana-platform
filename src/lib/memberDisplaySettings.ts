/**
 * WHICH PARTS OF THEIR OWN ACCOUNT A MEMBER IS SHOWN — one definition of the key, its default,
 * and how a stored string becomes a boolean.
 *
 * WHY A MODULE FOR ONE SETTING. Three places need the same answer and would otherwise each
 * decide it: the sidebar (does the nav item exist), the dashboard (does the tile exist), and the
 * route guard (does /dashboard/alerts render or redirect). Three copies of `value === "true"` is
 * three chances to get the DEFAULT wrong in a different direction — and getting it wrong in the
 * "on" direction shows a member a list of their own worst days that somebody decided not to
 * show them.
 *
 * WHY THE KEY CARRIES NO `settings_` PREFIX. `member_` is its namespace, as `holiday_` and
 * `registration_` already are in this table. That is load-bearing rather than cosmetic:
 * `save-api-keys` prefixes an incoming key with its `service` unless the key already starts with
 * it, so the admin switch calls it with `service: "member"` and the key is written verbatim —
 * exactly the arrangement `HolidayPolicyCard` uses with `holiday`. See `MEMBER_SETTING_SERVICE`.
 */

/** The `system_settings.key`. Also in the public whitelist (20260910140000). */
export const MEMBER_ALERT_HISTORY_KEY = "member_alert_history_enabled";

/**
 * The `service` the admin switch must send to `save-api-keys`.
 *
 * NOT A DETAIL. That function computes `key.startsWith(`${service}_`) ? key : `${service}_${key}``
 * — so calling it with `service: "settings"` would write `settings_member_alert_history_enabled`
 * and every reader here would go on seeing nothing, forever, while the admin UI showed the
 * switch moving. Two settings in this repo are in exactly that state today (see
 * `memberAlertHistory.test.ts`), which is why this is a named constant with a test on it rather
 * than a string typed at the call site.
 */
export const MEMBER_SETTING_SERVICE = "member";

/**
 * OFF unless the stored value says otherwise.
 *
 * `=== "true"` and not `!== "false"`. The difference is what an ABSENT or unreadable row means,
 * and here it must mean off: the row is absent on any database the migration has not reached,
 * and a member being shown their alert history because a read failed is the failure that
 * matters. (`registration_fee_enabled` uses `!== "false"` for the opposite reason — a fee that
 * silently stops being charged is its bad direction.)
 */
export function memberAlertHistoryEnabled(value: string | null | undefined): boolean {
  return value === "true";
}

/** The value to store. Written as a string, because `system_settings.value` is text. */
export function memberAlertHistorySettingValue(enabled: boolean): string {
  return enabled ? "true" : "false";
}
