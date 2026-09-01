import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteState } from "./useRemoteState";
import { MIRROR_KEY, writeMirror } from "./storage";
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

    // No casts: vi.fn(impl) already types mock.calls from impl's signature,
    // so `init` is RequestInit | undefined here.
    const puts = fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0][1]?.headers).toMatchObject({ "X-Write-Token": "secret" });
    const body = puts[0][1]?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(String(body)).programStartDate).toBe("2026-01-02");
  });

  it("does not double-PUT when mounted under StrictMode", async () => {
    // React 18 StrictMode double-invokes effects and state updaters. The mount
    // path's local-newer branch is the one that PUTs, so this crosses the
    // highest-risk pair: a PUT is expected, and the effect runs twice.
    writeMirror({
      ...makeDefaultState(),
      updatedAt: "2026-08-31T10:00:00.000Z",
      programStartDate: "2026-07-01",
    });
    const fetchSpy = mockFetch(async (_url, init) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : jsonResponse(remoteState),
    );
    const { result } = renderHook(() => useRemoteState(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() => {
      const puts = fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT");
      expect(puts).toHaveLength(1);
    });
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
    expect(JSON.parse(String(localStorage.getItem(MIRROR_KEY))).programStartDate).toBe("2026-01-01");
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

  // A gate that lets a test hold the mount GET open while it interacts, the
  // way a real 100-500ms round trip does.
  function gatedGet(body: unknown = remoteState) {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchSpy = mockFetch(async (_url, init) => {
      if (init?.method === "PUT") return new Response(null, { status: 204 });
      await gate;
      return jsonResponse(body);
    });
    return { fetchSpy, release: () => release() };
  }

  it("keeps an interaction made while the mount fetch is still in flight", async () => {
    // The regression this guards: `load()` captured the mirror BEFORE awaiting
    // the GET, so a tap during the round trip was reconciled away — erased from
    // the screen and the mirror, while its debounced PUT still reached KV.
    writeMirror({
      ...makeDefaultState(),
      updatedAt: "2026-08-29T10:00:00.000Z",
      programStartDate: "2026-06-01",
    });
    // remoteState is dated 2026-08-30, i.e. newer than that mirror, so the
    // pre-fetch snapshot would lose the reconcile and remote would win.
    const { release } = gatedGet();
    const { result } = renderHook(() => useRemoteState());

    act(() => {
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-12-25" }));
    });
    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.state.programStartDate).toBe("2026-12-25");
    expect(JSON.parse(String(localStorage.getItem(MIRROR_KEY))).programStartDate).toBe("2026-12-25");
  });

  it("paints the mirrored state before the fetch resolves", async () => {
    writeMirror({
      ...makeDefaultState(),
      updatedAt: "2026-08-29T10:00:00.000Z",
      programStartDate: "2026-06-01",
    });
    const { release } = gatedGet();
    const { result } = renderHook(() => useRemoteState());

    expect(result.current.loaded).toBe(false);
    expect(result.current.state.programStartDate).toBe("2026-06-01");

    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it("upgrades a v1 remote body instead of treating it as invalid", async () => {
    const v1 = {
      version: 1,
      updatedAt: "2026-08-30T10:00:00.000Z",
      programStartDate: "2026-08-24",
      ui: { activeCategory: "face", activeDayByCategory: { face: 0, hair: 0, body: 0 } },
    };
    const fetchSpy = mockFetch(async (_url, init) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : jsonResponse(v1),
    );
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.version).toBe(2);
    expect(result.current.state.completedSteps).toEqual([]);
    // A v1 body is valid-after-migrate, so this is NOT the corrupt-blob repair
    // path: no forced PUT, status stays synced.
    const puts = fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(0);
    expect(result.current.status).toBe("synced");
  });

  it("repairs a corrupt remote blob instead of reporting offline", async () => {
    // A 200 whose body fails isAppState is not a network failure: claiming
    // "offline" sends the user to check their wifi, and leaves the bad blob in
    // KV forever even though a valid local copy and a working link both exist.
    writeMirror({
      ...makeDefaultState(),
      updatedAt: "2026-08-29T10:00:00.000Z",
      programStartDate: "2026-06-01",
    });
    const fetchSpy = mockFetch(async (_url, init) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : jsonResponse({ hello: "world" }),
    );
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() => {
      const puts = fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT");
      expect(puts).toHaveLength(1);
    });

    expect(result.current.status).toBe("synced");
    expect(result.current.state.programStartDate).toBe("2026-06-01");
    const puts = fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(puts[0][1]?.body)).programStartDate).toBe("2026-06-01");
  });
});
