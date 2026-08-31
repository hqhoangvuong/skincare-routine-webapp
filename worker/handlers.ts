import { makeDefaultState } from "../src/shared/defaults";
import { isAppState } from "../src/shared/types";

export const STATE_KEY = "state:default";

/**
 * Only what the Worker actually uses from KV. A real KVNamespace satisfies
 * this structurally, and so does a plain fake in tests — so the test setup
 * needs no cast. Depending on the full KVNamespace surface would force one.
 */
export interface StateStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export type Env = {
  STATE: StateStore;
  WRITE_TOKEN: string;
  ALLOWED_ORIGIN: string;
};

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Write-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (pathname !== "/state") {
    return json({ error: "not found" }, 404, env);
  }

  if (request.method === "GET") {
    const stored = await env.STATE.get(STATE_KEY);
    if (stored) {
      return new Response(stored, {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(env) },
      });
    }
    // Seed and persist, so programStartDate is fixed from the first visit.
    const seeded = makeDefaultState();
    await env.STATE.put(STATE_KEY, JSON.stringify(seeded));
    return json(seeded, 200, env);
  }

  if (request.method === "PUT") {
    if (request.headers.get("X-Write-Token") !== env.WRITE_TOKEN) {
      return json({ error: "unauthorized" }, 401, env);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid state" }, 400, env);
    }
    if (!isAppState(body)) {
      return json({ error: "invalid state" }, 400, env);
    }
    await env.STATE.put(STATE_KEY, JSON.stringify(body));
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  return json({ error: "not found" }, 404, env);
}
