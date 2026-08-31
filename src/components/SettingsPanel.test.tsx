import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel";
import { AppStateProvider } from "../state/AppStateProvider";

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_WORKER_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SettingsPanel", () => {
  it("edits the program start date", async () => {
    render(
      <AppStateProvider>
        <SettingsPanel open onClose={() => {}} />
      </AppStateProvider>,
    );
    const input = await screen.findByLabelText(/Ngày bắt đầu/);
    // fireEvent.change, not userEvent.type — typing into a date input is
    // unreliable in jsdom because it has no date-picker behaviour.
    fireEvent.change(input, { target: { value: "2026-07-01" } });
    await waitFor(() => expect(input).toHaveValue("2026-07-01"));
    expect(JSON.parse(localStorage.getItem("skincare.state.v1")!).programStartDate).toBe("2026-07-01");
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <AppStateProvider>
        <SettingsPanel open={false} onClose={() => {}} />
      </AppStateProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
