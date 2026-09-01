import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "./AppStateProvider";

function Probe() {
  const { state, status, setActiveCategory, setActiveDay, setProgramStartDate } = useAppState();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="category">{state.ui.activeCategory}</span>
      <span data-testid="day">{state.ui.activeDayByCategory[state.ui.activeCategory]}</span>
      <span data-testid="start">{state.programStartDate}</span>
      <button onClick={() => setActiveCategory("hair")}>to hair</button>
      <button onClick={() => setActiveDay("hair", 4)}>hair day 4</button>
      <button onClick={() => setProgramStartDate("2026-07-01")}>set start</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_WORKER_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AppStateProvider", () => {
  it("exposes state and updates the active category", async () => {
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("category")).toHaveTextContent("face"));
    await userEvent.click(screen.getByText("to hair"));
    expect(screen.getByTestId("category")).toHaveTextContent("hair");
  });

  it("tracks the active day per category", async () => {
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("category")).toHaveTextContent("face"));
    await userEvent.click(screen.getByText("hair day 4"));
    expect(screen.getByTestId("day")).toHaveTextContent("0"); // face is still active
    await userEvent.click(screen.getByText("to hair"));
    expect(screen.getByTestId("day")).toHaveTextContent("4");
  });

  it("sets the program start date without disturbing ui state", async () => {
    // setProgramStartDate is what the Task 9 settings panel is built on, and a
    // spread bug here would silently drop the whole ui object.
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("category")).toHaveTextContent("face"));
    await userEvent.click(screen.getByText("hair day 4"));
    await userEvent.click(screen.getByText("set start"));

    expect(screen.getByTestId("start")).toHaveTextContent("2026-07-01");
    // ui must survive the programStartDate write
    await userEvent.click(screen.getByText("to hair"));
    expect(screen.getByTestId("day")).toHaveTextContent("4");
  });

  // `status` is the input to SyncNotice, the only user-visible error surface in
  // the app; a context that forgot to pass it through would leave the user with
  // no signal at all that their changes are not being saved.
  it("surfaces the unauthorized status through the context", async () => {
    // beforeEach leaves VITE_WORKER_URL empty — the local-only mode.
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthorized"));
  });

  it("surfaces the offline status through the context", async () => {
    vi.stubEnv("VITE_WORKER_URL", "https://worker.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network error");
      }),
    );
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("offline"));
  });

  it("throws a useful error when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AppStateProvider/);
    spy.mockRestore();
  });
});
