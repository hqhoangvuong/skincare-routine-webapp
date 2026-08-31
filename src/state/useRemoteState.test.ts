import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteState } from "./useRemoteState";
import { writeMirror } from "./storage";
import { makeDefaultState } from "../shared/defaults";

const remoteState = { ...makeDefaultState(), updatedAt: "2026-08-30T10:00:00.000Z" };

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_WORKER_URL", "https://worker.test");
  vi.stubEnv("VITE_WRITE_TOKEN", "secret");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("useRemoteState", () => {
  it("loads state from the worker on mount", async () => {
    mockFetch(async () => jsonResponse(remoteState));
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.updatedAt).toBe(remoteState.updatedAt);
    expect(result.current.status).toBe("synced");
  });

  it("falls back to the mirror when the worker is unreachable", async () => {
    writeMirror({ ...makeDefaultState(), updatedAt: "2026-08-29T10:00:00.000Z", programStartDate: "2026-07-01" });
    mockFetch(async () => {
      throw new TypeError("network error");
    });
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.programStartDate).toBe("2026-07-01");
    expect(result.current.status).toBe("offline");
  });

  it("falls back to a default when the worker fails and no mirror exists", async () => {
    mockFetch(async () => {
      throw new TypeError("network error");
    });
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.ui.activeCategory).toBe("face");
    expect(result.current.status).toBe("offline");
  });

  it("pushes the mirror to the worker when the local copy is newer", async () => {
    writeMirror({ ...makeDefaultState(), updatedAt: "2026-08-31T10:00:00.000Z", programStartDate: "2026-07-01" });
    const fetchSpy = mockFetch(async (_url, init) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : jsonResponse(remoteState),
    );
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.state.programStartDate).toBe("2026-07-01"));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://worker.test/state",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("debounces writes and sends the write token", async () => {
    const fetchSpy = mockFetch(async (_url, init) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : jsonResponse(remoteState),
    );
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-01-01" }));
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-01-02" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const puts = fetchSpy.mock.calls.filter(([, init]) => (init as RequestInit)?.method === "PUT");
    expect(puts).toHaveLength(1);
    expect((puts[0][1] as RequestInit).headers).toMatchObject({ "X-Write-Token": "secret" });
    expect(JSON.parse((puts[0][1] as RequestInit).body as string).programStartDate).toBe("2026-01-02");
  });

  it("keeps local state and mirrors it when the write fails", async () => {
    mockFetch(async (_url, init) => {
      if (init?.method === "PUT") throw new TypeError("network error");
      return jsonResponse(remoteState);
    });
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-01-01" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.state.programStartDate).toBe("2026-01-01");
    expect(result.current.status).toBe("offline");
    expect(JSON.parse(localStorage.getItem("skincare.state.v1")!).programStartDate).toBe("2026-01-01");
  });

  it("reports unauthorized when the worker rejects the token", async () => {
    mockFetch(async (_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ error: "unauthorized" }, 401)
        : jsonResponse(remoteState),
    );
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-01-01" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.status).toBe("unauthorized");
  });

  it("reports unauthorized and never fetches when no worker URL is configured", async () => {
    vi.stubEnv("VITE_WORKER_URL", "");
    const fetchSpy = mockFetch(async () => jsonResponse(remoteState));
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.status).toBe("unauthorized");
  });
});
