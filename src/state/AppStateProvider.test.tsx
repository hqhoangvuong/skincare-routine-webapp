import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "./AppStateProvider";

function Probe() {
  const { state, setActiveCategory, setActiveDay } = useAppState();
  return (
    <div>
      <span data-testid="category">{state.ui.activeCategory}</span>
      <span data-testid="day">{state.ui.activeDayByCategory[state.ui.activeCategory]}</span>
      <button onClick={() => setActiveCategory("hair")}>to hair</button>
      <button onClick={() => setActiveDay("hair", 4)}>hair day 4</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_WORKER_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("throws a useful error when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AppStateProvider/);
    spy.mockRestore();
  });
});
