import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useBufferedText } from "./useBufferedText";

function Field({ committed, commit }: { committed: string; commit: (s: string) => void }) {
  const buf = useBufferedText(committed, commit);
  return <input aria-label="f" value={buf.value} onChange={buf.onChange} onFocus={buf.onFocus} onBlur={buf.onBlur} />;
}

// A harness whose committed value is real state, updated by `commit`, so the
// "external change re-syncs" case is exercised against a live prop.
function Harness({ start, spy, showField = true }: { start: string; spy: (s: string) => void; showField?: boolean }) {
  const [committed, setCommitted] = useState(start);
  return (
    <>
      <button onClick={() => setCommitted("EXTERNAL")}>ext</button>
      {showField && <Field committed={committed} commit={(s) => { spy(s); setCommitted(s); }} />}
    </>
  );
}

describe("useBufferedText", () => {
  it("does not commit while typing; commits once on blur with the final draft", async () => {
    const spy = vi.fn();
    render(<Harness start="a" spy={spy} />);
    const input = screen.getByLabelText("f");
    await userEvent.type(input, "bc");
    expect(spy).not.toHaveBeenCalled();
    expect(input).toHaveValue("abc");
    await userEvent.tab();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("abc");
  });

  it("does not commit on blur when the draft is unchanged", async () => {
    const spy = vi.fn();
    render(<Harness start="a" spy={spy} />);
    await userEvent.click(screen.getByLabelText("f"));
    await userEvent.tab();
    expect(spy).not.toHaveBeenCalled();
  });

  it("re-syncs to an external committed change while not focused", async () => {
    const spy = vi.fn();
    render(<Harness start="a" spy={spy} />);
    await userEvent.click(screen.getByText("ext"));
    expect(screen.getByLabelText("f")).toHaveValue("EXTERNAL");
  });

  it("holds the user's draft when committed changes externally mid-edit; draft wins on blur", async () => {
    const spy = vi.fn();
    const { rerender } = render(<Field committed="a" commit={spy} />);
    const input = screen.getByLabelText("f");
    await userEvent.click(input);
    await userEvent.keyboard("z"); // draft = "az", focused, no blur
    rerender(<Field committed="EXTERNAL" commit={spy} />);
    expect(input).toHaveValue("az"); // the !focused re-sync guard held the draft
    await userEvent.tab();
    expect(spy).toHaveBeenCalledWith("az");
  });

  it("commits a pending draft if it unmounts while focused", async () => {
    const spy = vi.fn();
    const { rerender } = render(<Harness start="a" spy={spy} />);
    const input = screen.getByLabelText("f");
    await userEvent.click(input);
    await userEvent.keyboard("x"); // draft = "ax", still focused
    rerender(<Harness start="a" spy={spy} showField={false} />); // unmount the Field
    expect(spy).toHaveBeenCalledWith("ax");
  });
});
