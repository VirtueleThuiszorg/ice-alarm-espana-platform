/**
 * `useJoinOrderStatus` — driven, not described.
 *
 * WHY THIS FILE EXISTS SEPARATELY. `secondStageOnboarding.test.ts` asserted the hook's timeout
 * by looking for the strings `TIMEOUT_MS` and `status: "timeout"` in the source. Mutation
 * testing showed exactly what that is worth: replacing the timeout branch with another
 * `setTimeout` — a hook that polls for ever — left both strings in place and the test green.
 * A screen that spins for ever in front of somebody who has just paid is the failure, so it is
 * the BEHAVIOUR that has to be pinned.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) } },
}));

const { useJoinOrderStatus } = await import("@/hooks/useJoinOrderStatus");

const PENDING = { data: { status: "pending", confirmed: false }, error: null };
const CONFIRMED = {
  data: {
    status: "confirmed",
    confirmed: true,
    orderNumber: "ICE-20260909-00007",
    secondStage: [{ firstName: "Ana", link: "https://icealarm.es/member-update?token=abc", expiresAt: "2026-10-09" }],
    emergencyPhone: "+34 900 000 000",
  },
  error: null,
};

describe("useJoinOrderStatus", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call the function at all without a session id", async () => {
    const { result } = renderHook(() => useJoinOrderStatus(undefined));
    // No credential, so nothing to ask and nothing to claim. The screen falls back to the
    // phone route rather than announcing anything.
    expect(result.current.status).toBe("unknown");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports confirmed and hands the screen the link and the number", async () => {
    invoke.mockResolvedValue(CONFIRMED);
    const { result } = renderHook(() => useJoinOrderStatus("cs_test_123456789"));

    await waitFor(() => expect(result.current.status).toBe("confirmed"));
    expect(result.current.secondStage).toHaveLength(1);
    expect(result.current.secondStage[0].firstName).toBe("Ana");
    expect(result.current.emergencyPhone).toBe("+34 900 000 000");
    expect(result.current.orderNumber).toBe("ICE-20260909-00007");
  });

  it("passes the session id, and nothing else, to the function", async () => {
    invoke.mockResolvedValue(CONFIRMED);
    renderHook(() => useJoinOrderStatus("cs_test_123456789"));

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][0]).toBe("join-order-status");
    expect(invoke.mock.calls[0][1]).toEqual({ body: { sessionId: "cs_test_123456789" } });
  });

  it("keeps polling while the webhook has not run, then reports confirmed", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(PENDING).mockResolvedValue(CONFIRMED);

    const { result } = renderHook(() => useJoinOrderStatus("cs_test_123456789"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe("polling");

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(result.current.status).toBe("confirmed");
    expect(invoke.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("GIVES UP after the timeout instead of polling for ever", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(PENDING);

    const { result } = renderHook(() => useJoinOrderStatus("cs_test_123456789"));
    await act(async () => { await Promise.resolve(); });

    // Well past the 90s ceiling, in the hook's own 2s steps.
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(result.current.status).toBe("timeout");

    // And having given up, it stops asking.
    const callsAtTimeout = invoke.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(invoke.mock.calls.length).toBe(callsAtTimeout);
  });

  it("treats a failed payment as final, not as 'not yet'", async () => {
    invoke.mockResolvedValue({ data: { status: "failed", confirmed: false }, error: null });
    const { result } = renderHook(() => useJoinOrderStatus("cs_test_123456789"));

    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.secondStage).toEqual([]);
  });

  it("treats an endpoint error as 'not yet', not as a failure to report", async () => {
    // The member HAS paid. A transient failure of this endpoint is not something to tell them
    // is wrong with their payment.
    vi.useFakeTimers();
    invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } }).mockResolvedValue(CONFIRMED);

    const { result } = renderHook(() => useJoinOrderStatus("cs_test_123456789"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe("polling");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("confirmed");
  });

  it("survives the endpoint throwing", async () => {
    vi.useFakeTimers();
    invoke.mockRejectedValueOnce(new Error("network")).mockResolvedValue(CONFIRMED);

    const { result } = renderHook(() => useJoinOrderStatus("cs_test_123456789"));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("confirmed");
  });

  it("stops polling when the screen goes away", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(PENDING);

    const { unmount } = renderHook(() => useJoinOrderStatus("cs_test_123456789"));
    await act(async () => { await Promise.resolve(); });

    unmount();
    const callsAtUnmount = invoke.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    expect(invoke.mock.calls.length).toBe(callsAtUnmount);
  });

  it("drops a request that was ALREADY IN FLIGHT when the screen went away", async () => {
    // THE CASE `clearTimeout` ALONE DOES NOT COVER, and the reason the hook keeps a `stopped`
    // ref at all. Cancelling the pending timer cannot cancel a fetch that has already left:
    // when it resolves it would call setState on an unmounted hook AND schedule the next poll,
    // so the loop outlives the screen. A mutation removing the ref survived a test that only
    // unmounted between polls, which is why this one unmounts during one.
    vi.useFakeTimers();
    let release: ((v: unknown) => void) | undefined;
    invoke.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const { unmount } = renderHook(() => useJoinOrderStatus("cs_test_123456789"));
    await act(async () => { await Promise.resolve(); });
    expect(invoke).toHaveBeenCalledTimes(1);

    unmount();

    // The request the hook was already waiting on now comes back.
    await act(async () => {
      release?.(PENDING);
      await Promise.resolve();
      await Promise.resolve();
    });

    // It must not have scheduled another one.
    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
