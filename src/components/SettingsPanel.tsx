import { useAppState } from "../state/AppStateProvider";
import SyncNotice from "./SyncNotice";

export default function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, status, setProgramStartDate } = useAppState();
  if (!open) return null;

  return (
    <div className="settings">
      <label className="settings-field" htmlFor="program-start">
        Ngày bắt đầu routine
      </label>
      <input
        id="program-start"
        type="date"
        value={state.programStartDate}
        onChange={(event) => setProgramStartDate(event.target.value)}
      />
      <SyncNotice status={status} />
      <button type="button" onClick={onClose}>
        Đóng
      </button>
    </div>
  );
}
