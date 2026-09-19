/**
 * What a courtesy call asks, and how it can end.
 *
 * Separate from the dialog because these are the vocabulary the RPC validates against
 * (`close_courtesy_call` refuses an outcome it does not know) and the wording an operator reads
 * mid-call. Both want testing without mounting a dialog, and the outcome list wants to be one
 * list rather than a component's and a migration's.
 */

/** The outcomes `close_courtesy_call` accepts. Anything else is refused by the function. */
export const CALL_OUTCOMES = [
  "spoke_member",
  "spoke_carer",
  "no_answer",
  "voicemail",
  "wrong_number",
  "declined",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/**
 * The outcomes that mean a person was actually spoken to.
 *
 * MUST MATCH `v_reached` in the migration. Voicemail is deliberately NOT here: nobody answered
 * and nothing was confirmed, so counting it as a completed check-in would mark a member as seen
 * when a message went into an empty room. The dialog uses this only to word the button and warn
 * the operator — the database decides for itself, and `src/test/courtesyCall.test.ts` pins the
 * two lists together so they cannot drift.
 */
export const REACHED_OUTCOMES: readonly CallOutcome[] = [
  "spoke_member",
  "spoke_carer",
  "declined",
  "wrong_number",
];

export const isReached = (outcome: CallOutcome): boolean => REACHED_OUTCOMES.includes(outcome);

export interface OutcomeOption {
  value: CallOutcome;
  /** i18n key, with the English fallback the repo's `t(key, fallback)` convention uses. */
  key: string;
  fallback: string;
}

export const OUTCOME_OPTIONS: readonly OutcomeOption[] = [
  { value: "spoke_member", key: "courtesyCall.outcome.spokeMember", fallback: "Spoke to member" },
  { value: "spoke_carer", key: "courtesyCall.outcome.spokeCarer", fallback: "Spoke to carer" },
  { value: "no_answer", key: "courtesyCall.outcome.noAnswer", fallback: "No answer" },
  { value: "voicemail", key: "courtesyCall.outcome.voicemail", fallback: "Voicemail" },
  { value: "wrong_number", key: "courtesyCall.outcome.wrongNumber", fallback: "Wrong number" },
  { value: "declined", key: "courtesyCall.outcome.declined", fallback: "Declined the call" },
];

export interface ChecklistItem {
  /** The key stored in the checklist JSON, and rendered into the note as "- pendant_worn: yes". */
  id: string;
  key: string;
  fallback: string;
}

/**
 * THE FIVE QUESTIONS. Short enough to ask without reading them out like a form, and each one is
 * something the answer to changes what happens next rather than a box to tick.
 */
export const CALL_CHECKLIST: readonly ChecklistItem[] = [
  { id: "member_well", key: "courtesyCall.check.well", fallback: "Are they well?" },
  { id: "pendant_worn", key: "courtesyCall.check.pendantWorn", fallback: "Is the pendant being worn?" },
  { id: "test_press", key: "courtesyCall.check.testPress", fallback: "Test press done?" },
  { id: "contacts_correct", key: "courtesyCall.check.contacts", fallback: "Are the contacts still right?" },
  { id: "anything_changed", key: "courtesyCall.check.changed", fallback: "Has anything changed?" },
];

/** mm:ss for the call timer. Minutes are not capped at 60 — a 74-minute call reads "74:12". */
export function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
