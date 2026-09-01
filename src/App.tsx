import { useState } from "react";
import CategorySwitcher from "./components/CategorySwitcher";
import CategorySection from "./components/CategorySection";
import SettingsPanel from "./components/SettingsPanel";
import SyncNotice from "./components/SyncNotice";
import { useAppState } from "./state/AppStateProvider";

export default function App() {
  const { state, status, setActiveCategory, setActiveDay, toggleStep, editContent } = useAppState();
  const activeCategory = state.ui.activeCategory;
  const activeDayByCategory = state.ui.activeDayByCategory;
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="wrap">
      <SyncNotice status={status} />

      <div className="intro">
        <p className="eyebrow-top">Lịch chăm sóc bản thân · dùng trong 4 tuần</p>
        <h1>Routine trọn vẹn — mặt, tóc &amp; cơ thể</h1>
        <p>
          Chọn một mục bên dưới để xem lịch chăm sóc theo từng ngày trong tuần, dùng đúng thứ tự sản phẩm bạn
          đang có.
        </p>
        <button
          type="button"
          className="settings-toggle"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          Cài đặt
        </button>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <CategorySwitcher active={activeCategory} onSelect={setActiveCategory} />

      {/* key forces a remount per category so the `catfade` animation on
          `.category` replays on every switch, as it did in the original. The
          same component at the same position otherwise just takes new props. */}
      <CategorySection
        key={activeCategory}
        category={activeCategory}
        state={state}
        activeDay={activeDayByCategory[activeCategory]}
        onSelectDay={(index) => setActiveDay(activeCategory, index)}
        onToggleStep={toggleStep}
        editContent={editContent}
      />

      <footer>🌷 Điều chỉnh tần suất theo phản ứng thực tế của da &amp; tóc bạn nhé — đây là khung gợi ý, không phải quy tắc cứng.</footer>
    </div>
  );
}
