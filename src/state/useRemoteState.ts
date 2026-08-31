import { useCallback, useEffect, useRef, useState } from "react";
import { readMirror, reconcile, writeMirror } from "./storage";
import { makeDefaultState } from "../shared/defaults";
import { isAppState, type AppState, type SyncStatus } from "../shared/types";

const DEBOUNCE_MS = 500;

function workerUrl(): string | null {
  const base = import.meta.env.VITE_WORKER_URL;
  return base ? `${base.replace(/\/$/, "")}/state` : null;
}

async function fetchRemote(url: string): Promise<AppState | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isAppState(body) ? body : null;
  } catch {
    return null;
  }
}

async function putState(state: AppState): Promise<SyncStatus> {
  const url = workerUrl();
  if (!url) return "unauthorized";
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Write-Token": import.meta.env.VITE_WRITE_TOKEN ?? "",
      },
      body: JSON.stringify(state),
    });
    if (response.status === 401) return "unauthorized";
    return response.ok ? "synced" : "offline";
  } catch {
    return "offline";
  }
}

export type UseRemoteStateResult = {
  state: AppState;
  update: (mutate: (prev: AppState) => AppState) => void;
  status: SyncStatus;
  loaded: boolean;
};

export function useRemoteState(): UseRemoteStateResult {
  const [state, setState] = useState<AppState>(() => makeDefaultState());
  const [status, setStatus] = useState<SyncStatus>("synced");
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Mount: read both copies, keep the newer (reconcile is newest-wins by
  // updatedAt), and push local up if it won — otherwise a failed last PUT of
  // a prior session would be silently discarded by a successful GET here.
  //
  // `cancelled` is local to each effect invocation (not the shared
  // `mountedRef`) so that React 18 StrictMode's double-invoke — mount,
  // cleanup, mount again, all before either `load()` call's awaits settle —
  // cancels only the first invocation's continuation. Sharing one ref here
  // would let the second mount flip it back to "live" and make the first,
  // stale invocation's continuation run too, risking a duplicate PUT.
  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;

    async function load() {
      const url = workerUrl();
      const local = readMirror();
      const remote = url ? await fetchRemote(url) : null;
      const fetchFailed = url !== null && remote === null;

      if (cancelled) return;

      const { state: resolved, source } = reconcile(remote, local);
      setState(resolved);
      writeMirror(resolved);
      setLoaded(true);

      if (!url) {
        setStatus("unauthorized");
        return;
      }
      if (fetchFailed) {
        setStatus("offline");
        return;
      }
      if (source === "local") {
        const pushStatus = await putState(resolved);
        if (!cancelled) setStatus(pushStatus);
        return;
      }
      setStatus("synced");
    }

    void load();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const update = useCallback((mutate: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = { ...mutate(prev), updatedAt: new Date().toISOString() };
      writeMirror(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void putState(next).then((result) => {
          if (mountedRef.current) setStatus(result);
        });
      }, DEBOUNCE_MS);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { state, update, status, loaded };
}
