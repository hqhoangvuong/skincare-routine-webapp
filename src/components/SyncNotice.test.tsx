import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SyncNotice from "./SyncNotice";

describe("SyncNotice", () => {
  it("renders nothing when synced", () => {
    const { container } = render(<SyncNotice status="synced" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the offline message", () => {
    render(<SyncNotice status="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("Ngoại tuyến");
  });

  it("shows a distinct message for a configuration problem", () => {
    render(<SyncNotice status="unauthorized" />);
    expect(screen.getByRole("status")).toHaveTextContent("kiểm tra cấu hình");
  });
});
