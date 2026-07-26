/**
 * Medconneqt — the third-party medication-dispenser alarm platform staff work
 * alongside our own call-centre. Embedded at /call-centre/medconneqt so staff
 * keep our chrome and never leave the portal.
 *
 * Framing is outside our control: if Medconneqt send X-Frame-Options or a
 * frame-ancestors CSP that excludes us, the embed cannot work and the page
 * falls back to an explicit "open in a new tab" panel. Separately, even when
 * framing IS permitted, their login may not persist inside the frame because
 * browsers restrict third-party cookies — which is why the new-tab affordance
 * is always on screen, not only in the failure state.
 */
export const MEDCONNEQT_URL = "https://alarm.medconneqt.nl";

/**
 * How long to wait for the frame to signal a load before treating it as
 * blocked. Generous: a slow partner backend must not be reported as refused.
 */
export const MEDCONNEQT_LOAD_TIMEOUT_MS = 12_000;
