import { useEffect, useRef, useState } from "react";

export default function ConfirmRemove({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const groupRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!confirming) return;

    const handleBlur = (e: FocusEvent) => {
      // Check if focus is moving outside the group
      const isMovingOutside =
        e.relatedTarget === null ||
        (e.relatedTarget instanceof Node && groupRef.current && !groupRef.current.contains(e.relatedTarget));

      if (isMovingOutside) {
        setConfirming(false);
      }
    };

    // Check each button for blur events
    const buttons = groupRef.current?.querySelectorAll("button");
    buttons?.forEach((button) => {
      button.addEventListener("blur", handleBlur, true);
    });

    return () => {
      buttons?.forEach((button) => {
        button.removeEventListener("blur", handleBlur, true);
      });
    };
  }, [confirming]);

  if (!confirming) {
    return (
      <button type="button" className="confirm-x" aria-label={label} onClick={() => setConfirming(true)}>
        ×
      </button>
    );
  }

  return (
    <span ref={groupRef} className="confirm-group">
      <button
        type="button"
        className="confirm-yes"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Xoá
      </button>
      <button type="button" className="confirm-no" onClick={() => setConfirming(false)}>
        Huỷ
      </button>
    </span>
  );
}
