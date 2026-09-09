/**
 * The Medconneqt frame survives navigation — by identity, not by inspection.
 *
 * ITEM 8, the half a source scan cannot prove. `medconneqtEmbed.test.ts` asserts the frame is
 * hidden rather than conditionally rendered, which is the mechanism; this asserts the
 * CONSEQUENCE — that the operator comes back to the SAME frame element, still holding the same
 * Medconneqt document, rather than to a fresh one showing the partner's login form.
 *
 * Element IDENTITY is the assertion (`toBe`, not `toBeTruthy`). "An iframe is present after
 * navigating back" is true of the broken version too: React would have unmounted the old one and
 * mounted a new one, and the new one has no session. Only node identity separates the two.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { MEDCONNEQT_ROUTE } from "@/config/medconneqt";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en" },
  }),
}));

const { MedConneqtFrameHost } = await import("@/components/call-centre/MedConneqtFrameHost");

/** Sends the router somewhere on mount, standing in for a sidebar click. */
function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
}

/**
 * The layout, reduced to the one thing under test: the host mounted OUTSIDE the routes, so it
 * outlives them exactly as `CallCentreLayout` makes it.
 */
function Harness({ go }: { go?: string }) {
  return (
    <MemoryRouter initialEntries={[MEDCONNEQT_ROUTE]}>
      <Routes>
        <Route path="/call-centre/medconneqt" element={<div>medconneqt page chrome</div>} />
        <Route path="/call-centre/members" element={<div>members page</div>} />
      </Routes>
      <MedConneqtFrameHost />
      {go && <GoTo to={go} />}
    </MemoryRouter>
  );
}

const frame = () => screen.queryByTitle("medconneqt.frameTitle");
const host = () => screen.getByTestId("medconneqt-frame-host");

beforeEach(() => {
  // The reachability probe must not reach anything in a test run. An opaque response is the
  // "host answered" signal, so this is the benign case: it keeps the component out of its
  // `unreachable` branch without asserting anything about a real network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ type: "opaque" }) as unknown as Response),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the Medconneqt frame across a navigation", () => {
  it("is the SAME element after leaving the page and coming back", async () => {
    const { rerender } = render(<Harness />);
    const original = frame();
    expect(original).not.toBeNull();
    expect(host().hidden).toBe(false);

    // Away: the frame is still in the document, and hidden.
    rerender(<Harness go="/call-centre/members" />);
    await waitFor(() => expect(screen.getByText("members page")).toBeTruthy());
    await waitFor(() => expect(host().hidden).toBe(true));
    expect(frame()).toBe(original); // <-- load-bearing: never unmounted

    // Back: the very same node, visible again.
    rerender(<Harness go={MEDCONNEQT_ROUTE} />);
    await waitFor(() => expect(host().hidden).toBe(false));
    expect(frame()).toBe(original); // <-- load-bearing: not a fresh session
  });

  it("keeps its src pointing at Medconneqt throughout — hiding is not blanking", async () => {
    // A "keep alive" that swapped src to about:blank while hidden would pass an identity check
    // and still have thrown the session away.
    render(<Harness />);
    const el = frame() as HTMLIFrameElement;
    expect(el.getAttribute("src")).toBe("https://alarm.medconneqt.nl");
    // Awaited so the reachability probe settles inside the test rather than after it, which is
    // what React's act() warning is about.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("mounts the frame even before the operator visits the page — hidden, and only once", () => {
    // Mounted by the layout, so it exists on every call-centre route. Exactly one, always: a
    // second host would be a second Medconneqt session competing for the same login.
    render(
      <MemoryRouter initialEntries={["/call-centre/members"]}>
        <MedConneqtFrameHost />
      </MemoryRouter>,
    );
    expect(host().hidden).toBe(true);
    expect(screen.getAllByTitle("medconneqt.frameTitle")).toHaveLength(1);
  });

  it("does not probe Medconneqt from an unrelated call-centre route", async () => {
    render(
      <MemoryRouter initialEntries={["/call-centre/members"]}>
        <MedConneqtFrameHost />
      </MemoryRouter>,
    );
    // The frame's own request is the browser's business; ours is the reachability probe, and it
    // has no business firing while the operator is on the SOS screen.
    await waitFor(() => expect(host().hidden).toBe(true));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("probes once the page IS the route", async () => {
    render(<Harness />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("https://alarm.medconneqt.nl", {
      mode: "no-cors",
      cache: "no-store",
    }));
  });
});
