import { useAppState } from "../state/AppStateProvider";

export default function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, setProgramStartDate } = useAppState();
  if (!open) return null;

  return (
    <div className="settings">
      <label className="settings-field" htmlFor="program-start">
        Ngày bắt đầu routine
      </label>
      <input
        id="program-start"
        className="settings-input"
        type="date"
        value={state.programStartDate}
        onChange={(event) => setProgramStartDate(event.target.value)}
      />
      {/* No SyncNotice here: App renders exactly one at the top level. A second
          copy would put two role="status" live regions with identical text on
          the page, announcing twice to screen readers. */}
      <button type="button" className="settings-close" onClick={onClose}>
        Đóng
      </button>
    </div>
  );
}
