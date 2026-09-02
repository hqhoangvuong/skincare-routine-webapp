import { useEffect, useRef, useState } from "react";

/**
 * A controlled-input buffer. The field renders `value` and reports edits via
 * `onChange` into a local draft; the draft is pushed up through `commit` only
 * on blur, or on unmount if the field was still focused. An external change to
 * `committed` re-syncs the draft only while the field is not focused, so a
 * debounced round-trip mid-word cannot move the caret.
 */
export function useBufferedText(
  committed: string,
  commit: (next: string) => void,
): {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  const [draft, setDraft] = useState(committed);
  const focused = useRef(false);

  // Latest values reachable from the unmount cleanup without re-subscribing it.
  const latest = useRef({ draft, committed, commit });
  latest.current = { draft, committed, commit };

  useEffect(() => {
    if (!focused.current) setDraft(committed);
  }, [committed]);

  useEffect(
    () => () => {
      const { draft: d, committed: c, commit: fn } = latest.current;
      if (focused.current && d !== c) fn(d);
    },
    [],
  );

  return {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (latest.current.draft !== latest.current.committed) {
        latest.current.commit(latest.current.draft);
      }
    },
  };
}
