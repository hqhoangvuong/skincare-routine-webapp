import { beforeEach, describe, expect, it } from "vitest";
import { MIRROR_KEY, readMirror, reconcile, writeMirror } from "./storage";
import { makeDefaultState } from "../shared/defaults";
import type { AppState } from "../shared/types";

function stateAt(updatedAt: string, programStartDate = "2026-08-24"): AppState {
  return { ...makeDefaultState(), updatedAt, programStartDate };
}

beforeEach(() => {
  localStorage.clear();
});

describe("mirror", () => {
  it("round-trips a state through localStorage", () => {
    const state = stateAt("2026-08-30T10:00:00.000Z");
    writeMirror(state);
    expect(readMirror()).toEqual(state);
  });

  it("returns null when nothing is stored", () => {
    expect(readMirror()).toBeNull();
  });

  it("returns null rather than throwing on corrupt JSON", () => {
    localStorage.setItem(MIRROR_KEY, "{not json");
    expect(readMirror()).toBeNull();
  });
});

describe("reconcile", () => {
  it("prefers the remote copy when it is newer", () => {
    const remote = stateAt("2026-08-30T12:00:00.000Z");
    const local = stateAt("2026-08-30T10:00:00.000Z");
    expect(reconcile(remote, local)).toEqual({ state: remote, source: "remote" });
  });

  it("prefers the local copy when it is newer", () => {
    const remote = stateAt("2026-08-30T10:00:00.000Z");
    const local = stateAt("2026-08-30T12:00:00.000Z");
    expect(reconcile(remote, local)).toEqual({ state: local, source: "local" });
  });

  it("uses the remote copy when there is no mirror", () => {
    const remote = stateAt("2026-08-30T10:00:00.000Z");
    expect(reconcile(remote, null)).toEqual({ state: remote, source: "remote" });
  });

  it("uses the mirror when the remote read failed", () => {
    const local = stateAt("2026-08-30T10:00:00.000Z");
    expect(reconcile(null, local)).toEqual({ state: local, source: "local" });
  });

  it("falls back to a default when neither exists", () => {
    const result = reconcile(null, null);
    expect(result.source).toBe("default");
    expect(result.state.version).toBe(1);
    expect(result.state.ui.activeCategory).toBe("face");
  });

  it("prefers remote on an exact timestamp tie", () => {
    const remote = stateAt("2026-08-30T10:00:00.000Z", "2026-01-01");
    const local = stateAt("2026-08-30T10:00:00.000Z", "2026-02-02");
    expect(reconcile(remote, local).state.programStartDate).toBe("2026-01-01");
  });
});
