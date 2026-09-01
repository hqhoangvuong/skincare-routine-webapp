import { describe, expect, it, beforeEach } from "vitest";
import { handleRequest, STATE_KEY, type Env } from "./handlers";
import { makeDefaultState } from "../src/shared/defaults";

function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

// No cast needed: fakeKv structurally satisfies StateStore.
let env: { STATE: ReturnType<typeof fakeKv>; WRITE_TOKEN: string; ALLOWED_ORIGIN: string };

beforeEach(() => {
  env = {
    STATE: fakeKv(),
    WRITE_TOKEN: "secret",
    ALLOWED_ORIGIN: "https://example.github.io",
  };
});

describe("GET /state", () => {
  it("seeds KV with a default state on first read", async () => {
    const response = await handleRequest(new Request("https://w.test/state"), env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ version: 3 });
    // The seed must be persisted, not just returned — otherwise every load
    // mints a fresh programStartDate and the week number never advances.
    expect(env.STATE.store.get(STATE_KEY)).toBeTruthy();
  });

  it("does not re-seed on a second read", async () => {
    // Deliberately NOT comparing programStartDate: it is day-granularity
    // (todayIso), so two re-seeds milliseconds apart produce identical values
    // and the assertion would pass against the very regression it targets.
    // The stored blob's identity is what proves KV was read, not rebuilt.
    await handleRequest(new Request("https://w.test/state"), env);
    const seeded = env.STATE.store.get(STATE_KEY);
    await handleRequest(new Request("https://w.test/state"), env);
    expect(env.STATE.store.get(STATE_KEY)).toBe(seeded);
    expect(env.STATE.store.size).toBe(1);
  });

  it("returns the stored state when one exists", async () => {
    const stored = { ...makeDefaultState(), programStartDate: "2026-01-01" };
    await env.STATE.put(STATE_KEY, JSON.stringify(stored));
    const body = await (await handleRequest(new Request("https://w.test/state"), env)).json();
    expect(body.programStartDate).toBe("2026-01-01");
  });

  it("upgrades and persists a stored v1 blob", async () => {
    const v1 = {
      version: 1,
      updatedAt: "2026-08-30T10:00:00.000Z",
      programStartDate: "2026-01-01",
      ui: { activeCategory: "face", activeDayByCategory: { face: 0, hair: 0, body: 0 } },
    };
    await env.STATE.put(STATE_KEY, JSON.stringify(v1));
    const body = await (await handleRequest(new Request("https://w.test/state"), env)).json();
    expect(body.version).toBe(3);
    expect(body.completedSteps).toEqual([]);
    expect(body.programStartDate).toBe("2026-01-01");
    // persisted, not just returned
    expect(JSON.parse(String(env.STATE.store.get(STATE_KEY))).version).toBe(3);
  });

  it("reseeds when the stored blob is not valid JSON", async () => {
    await env.STATE.put(STATE_KEY, "{not json");
    const response = await handleRequest(new Request("https://w.test/state"), env);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.version).toBe(3);
    expect(JSON.parse(String(env.STATE.store.get(STATE_KEY))).version).toBe(3);
  });

  it("reseeds when the stored blob is unrecognisable", async () => {
    await env.STATE.put(STATE_KEY, JSON.stringify({ nonsense: true }));
    const response = await handleRequest(new Request("https://w.test/state"), env);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.version).toBe(3);
    expect(JSON.parse(String(env.STATE.store.get(STATE_KEY))).version).toBe(3);
  });
});

describe("PUT /state", () => {
  function putRequest(body: unknown, token?: string) {
    return new Request("https://w.test/state", {
      method: "PUT",
      headers: token ? { "X-Write-Token": token } : {},
      body: JSON.stringify(body),
    });
  }

  it("stores the body with a valid token", async () => {
    const state = { ...makeDefaultState(), programStartDate: "2026-02-02" };
    const response = await handleRequest(putRequest(state, "secret"), env);
    expect(response.status).toBe(204);
    const stored = env.STATE.store.get(STATE_KEY);
    expect(stored).toBeDefined();
    expect(JSON.parse(String(stored)).programStartDate).toBe("2026-02-02");
  });

  it("rejects a missing token", async () => {
    const response = await handleRequest(putRequest(makeDefaultState()), env);
    expect(response.status).toBe(401);
    expect(env.STATE.store.size).toBe(0);
  });

  it("rejects a wrong token", async () => {
    const response = await handleRequest(putRequest(makeDefaultState(), "nope"), env);
    expect(response.status).toBe(401);
    // A 401 that writes anyway is the auth bug that matters, so assert the
    // store is untouched here too, not only in the missing-token case.
    expect(env.STATE.store.size).toBe(0);
  });

  it("rejects a body that is not a version 3 state", async () => {
    const response = await handleRequest(putRequest({ hello: "world" }, "secret"), env);
    expect(response.status).toBe(400);
  });

  it("rejects a body with a malformed completedSteps", async () => {
    const state = { ...makeDefaultState(), completedSteps: [{ date: "x", category: "face" }] };
    const response = await handleRequest(putRequest(state, "secret"), env);
    expect(response.status).toBe(400);
  });

  // The tightened isAppState guard (src/shared/types.ts) validates the nested
  // `ui` shape rather than just its presence. The dangerous failure mode is
  // over-rejection — a guard that wrongly rejects a valid state would make the
  // Worker refuse every legitimate write — so the positive case is covered
  // here alongside the negative ones.
  it("accepts a bare makeDefaultState() body unmodified", async () => {
    const response = await handleRequest(putRequest(makeDefaultState(), "secret"), env);
    expect(response.status).toBe(204);
  });

  it("rejects an empty ui object", async () => {
    const state = { ...makeDefaultState(), ui: {} };
    const response = await handleRequest(putRequest(state, "secret"), env);
    expect(response.status).toBe(400);
  });

  it("rejects an array ui", async () => {
    const state = { ...makeDefaultState(), ui: [] };
    const response = await handleRequest(putRequest(state, "secret"), env);
    expect(response.status).toBe(400);
  });

  it("rejects an activeDayByCategory missing one of the three categories", async () => {
    const state = {
      ...makeDefaultState(),
      ui: { activeCategory: "face", activeDayByCategory: { face: 0, hair: 0 } },
    };
    const response = await handleRequest(putRequest(state, "secret"), env);
    expect(response.status).toBe(400);
  });

  it("rejects an activeCategory that is not one of the three known categories", async () => {
    const state = {
      ...makeDefaultState(),
      ui: { activeCategory: "nails", activeDayByCategory: { face: 0, hair: 0, body: 0 } },
    };
    const response = await handleRequest(putRequest(state, "secret"), env);
    expect(response.status).toBe(400);
  });
});

describe("CORS", () => {
  it("answers the preflight with the allowed headers", async () => {
    const response = await handleRequest(
      new Request("https://w.test/state", { method: "OPTIONS" }),
      env,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.github.io");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("X-Write-Token");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
  });

  it("sets CORS headers on success, error, and 404 responses alike", async () => {
    const ok = await handleRequest(new Request("https://w.test/state"), env);
    const unauthorized = await handleRequest(
      new Request("https://w.test/state", { method: "PUT", body: "{}" }),
      env,
    );
    const missing = await handleRequest(new Request("https://w.test/nope"), env);
    for (const response of [ok, unauthorized, missing]) {
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.github.io");
    }
    expect(missing.status).toBe(404);
  });
});
