import { useCallback, useEffect, useRef, useState } from "react";
import { readMirror, reconcile, writeMirror } from "./storage";
import { makeDefaultState } from "../shared/defaults";
import { migrate, type AppState, type SyncStatus } from "../shared/types";

const DEBOUNCE_MS = 500;

function workerUrl(): string | null {
  const base = import.meta.env.VITE_WORKER_URL;
  return base ? `${base.replace(/\/$/, "")}/state` : null;
}

/**
 * A GET has three distinguishable outcomes, and collapsing the last two into
 * `null` used to make a corrupt blob in KV look like a network failure: the app
 * claimed "Ngoại tuyến" (a lie — the connection was fine) and never overwrote
 * the bad blob, so it stayed corrupt forever.
 *
 * `"invalid"` means we reached the Worker and its body is neither a current
 * state nor an upgradable older one (a v1 body is migrated in place, not
 * rejected). That is a repairable state, not an offline state.
 */
type RemoteResult =
  | { ok: true; state: AppState }
  | { ok: "invalid" }
  | { ok: false };

async function fetchRemote(url: string): Promise<RemoteResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) return { ok: false };
    const body: unknown = await response.json();
    const migrated = migrate(body);
    return migrated ? { ok: true, state: migrated } : { ok: "invalid" };
  } catch {
    return { ok: false };
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
  // Seed from the mirror, not from the defaults: readMirror() is synchronous
  // and cheap, so there is no reason to paint face/T2 for the length of a
  // network round trip (or, offline, for a full timeout) when the persisted
  // selection was in localStorage the whole time. Reconciliation below is
  // unchanged — only the pre-resolution paint differs.
  const [state, setState] = useState<AppState>(() => readMirror() ?? makeDefaultState());
  const [status, setStatus] = useState<SyncStatus>("synced");
  const [loaded, setLoaded] = useState(false);

  // The live in-memory state, readable from the mount continuation (which
  // captured its `local` snapshot before awaiting the fetch), plus whether a
  // user mutation has happened at all since mount.
  const stateRef = useRef(state);
  const dirtyRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Mount: read both copies, keep the newer (reconcile is newest-wins by
  // updatedAt), and push local up if it won — otherwise a failed last PUT of
  // a prior session would be silently discarded by a successful GET here.
  //
  // `cancelled` is local to each effect invocation (not a shared ref) so that
  // React 18 StrictMode's double-invoke — mount, cleanup, mount again, all
  // before either `load()` call's awaits settle — cancels only the first
  // invocation's continuation. Sharing one ref here would let the second mount
  // flip it back to "live" and make the first, stale invocation's continuation
  // run too, risking a duplicate PUT.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const url = workerUrl();
      const local = readMirror();
      const remote = url ? await fetchRemote(url) : null;

      if (cancelled) return;

      // Reconcile against the LIVE state once the user has touched anything.
      // A tap during the 100–500ms round trip mutates state and mirrors it;
      // reconciling against the pre-fetch `local` snapshot instead would wipe
      // that tap from both the screen and the mirror while the debounced PUT
      // still shipped it to KV — three copies, three answers. `update()`
      // stamps `updatedAt` with now, so a live-mutated state wins the
      // reconcile on its own and takes the `source === "local"` push below.
      const current = dirtyRef.current ? stateRef.current : local;
      const remoteState = remote !== null && remote.ok === true ? remote.state : null;
      const { state: resolved, source } = reconcile(remoteState, current);
      setState(resolved);
      writeMirror(resolved);
      setLoaded(true);

      if (!url) {
        setStatus("unauthorized");
        return;
      }
      if (remote !== null && remote.ok === false) {
        setStatus("offline");
        return;
      }
      // A corrupt remote blob is repaired by pushing our valid copy over it,
      // not by giving up: the connection works, we just disagree about the
      // contents. `fetchRemote` already ran the body through `migrate()`, so an
      // "invalid" here is a blob that isn't even an upgradable older version.
      if ((remote !== null && remote.ok === "invalid") || source === "local") {
        const pushStatus = await putState(resolved);
        if (!cancelled) setStatus(pushStatus);
        return;
      }
      setStatus("synced");
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  // The updater is pure. It used to write the mirror and juggle a debounce
  // timer inside `setState`, which React double-invokes under StrictMode (and
  // may abandon entirely under concurrent rendering) — so the mirror could be
  // written from a render whose state never committed.
  const update = useCallback((mutate: (prev: AppState) => AppState) => {
    dirtyRef.current = true;
    setState((prev) => ({ ...mutate(prev), updatedAt: new Date().toISOString() }));
  }, []);

  // Persistence is a side effect of committed state, so it lives in an effect.
  // The debounce falls out of the cleanup: a new state cancels the pending PUT
  // of the previous one. Gated on `dirtyRef` so that only user mutations are
  // pushed — the mount path owns persisting whatever reconciliation resolved,
  // and re-PUTting a state we just GET'd would be pointless traffic.
  useEffect(() => {
    if (!dirtyRef.current) return;
    writeMirror(state);
    let cancelled = false;
    const timer = setTimeout(() => {
      void putState(state).then((result) => {
        if (!cancelled) setStatus(result);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state]);

  return { state, update, status, loaded };
}
