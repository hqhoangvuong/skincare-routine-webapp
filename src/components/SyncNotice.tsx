import type { SyncStatus } from "../shared/types";

const MESSAGES: Record<Exclude<SyncStatus, "synced">, string> = {
  offline: "Ngoại tuyến — đang hiển thị dữ liệu đã lưu",
  unauthorized: "Đồng bộ đang tắt — kiểm tra cấu hình",
};

export default function SyncNotice({ status }: { status: SyncStatus }) {
  if (status === "synced") return null;
  return (
    <div className={`sync-notice sync-notice--${status}`} role="status">
      {MESSAGES[status]}
    </div>
  );
}
