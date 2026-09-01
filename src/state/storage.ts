import { makeDefaultState } from "../shared/defaults";
import { migrate, type AppState } from "../shared/types";

export const MIRROR_KEY = "skincare.state.v1";

export function readMirror(): AppState | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return null;
  }
}

export function writeMirror(state: AppState): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(state));
  } catch {
    // Storage can be full or blocked (private mode). The remote copy is the
    // durable one; losing the fallback cache is not worth surfacing.
  }
}

/**
 * Picks whichever copy is newer. This is what stops a successful mount-time
 * GET from silently discarding a newer local state whose last PUT failed.
 * Ties go to remote, which is arbitrary but stable.
 *
 * updatedAt is an ISO-8601 UTC timestamp; those sort lexicographically in
 * chronological order, so a plain string comparison is correct here and
 * avoids the parsing cost and failure modes of `new Date(...)`.
 */
export function reconcile(
  remote: AppState | null,
  local: AppState | null,
): { state: AppState; source: "remote" | "local" | "default" } {
  if (remote && local) {
    return local.updatedAt > remote.updatedAt
      ? { state: local, source: "local" }
      : { state: remote, source: "remote" };
  }
  if (remote) return { state: remote, source: "remote" };
  if (local) return { state: local, source: "local" };
  return { state: makeDefaultState(), source: "default" };
}
