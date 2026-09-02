import { useEffect, useRef, useState } from "react";

export default function ConfirmRemove({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <button type="button" className="confirm-x" aria-label={label} onClick={() => setConfirming(true)}>×</button>
    );
  }

  return (
    <span
      className="confirm-group"
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
          setConfirming(false);
        }
      }}
    >
      <button type="button" className="confirm-yes"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { setConfirming(false); onConfirm(); }}>Xoá</button>
      <button ref={cancelRef} type="button" className="confirm-no"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setConfirming(false)}>Huỷ</button>
    </span>
  );
}
