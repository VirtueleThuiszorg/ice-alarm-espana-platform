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

/**
 * The route the embed lives on.
 *
 * Named here because TWO components now need it: the page that renders the chrome, and the
 * frame host mounted in the call-centre layout, which uses it to decide whether to SHOW the
 * frame. The host is mounted for every call-centre route and hidden on all but this one — see
 * MedConneqtFrameHost for why hiding rather than unmounting is the whole point.
 */
export const MEDCONNEQT_ROUTE = "/call-centre/medconneqt";

/**
 * What Medconneqt would have to send for the embed to be permitted (Lee's dashboard notes,
 * 9 Sep, item 8 — for Martijn).
 *
 * A browser refuses a frame on either of two headers, and does not tell the page which:
 *
 *   X-Frame-Options: DENY | SAMEORIGIN        — must be ABSENT (it has no allow-list form;
 *                                               the obsolete ALLOW-FROM is ignored by every
 *                                               current browser, so it cannot be narrowed)
 *   Content-Security-Policy: frame-ancestors  — must LIST our origin
 *
 * `frame-ancestors` is the only one of the two that can grant an exception, so the ask is:
 * drop X-Frame-Options and send frame-ancestors including our origin. The origin is filled in
 * from `window.location.origin` at render time rather than hardcoded, so the panel names the
 * origin the operator is ACTUALLY on — the production domain, or a preview URL — which is the
 * one their browser sent in the request Medconneqt refused.
 */
export const MEDCONNEQT_FRAME_ANCESTORS_HEADER = (origin: string) =>
  `Content-Security-Policy: frame-ancestors ${origin};`;
