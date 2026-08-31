import CategorySwitcher from "./components/CategorySwitcher";
import CategorySection from "./components/CategorySection";
import { useAppState } from "./state/AppStateProvider";

export default function App() {
  const { state, setActiveCategory, setActiveDay } = useAppState();
  const activeCategory = state.ui.activeCategory;
  const activeDayByCategory = state.ui.activeDayByCategory;

  return (
    <div className="wrap">
      <div className="intro">
        <p className="eyebrow-top">Lịch chăm sóc bản thân · dùng trong 4 tuần</p>
        <h1>Routine trọn vẹn — mặt, tóc &amp; cơ thể</h1>
        <p>
          Chọn một mục bên dưới để xem lịch chăm sóc theo từng ngày trong tuần, dùng đúng thứ tự sản phẩm bạn
          đang có.
        </p>
      </div>

      <CategorySwitcher active={activeCategory} onSelect={setActiveCategory} />

      <CategorySection
        category={activeCategory}
        activeDay={activeDayByCategory[activeCategory]}
        onSelectDay={(index) => setActiveDay(activeCategory, index)}
      />

      <footer>🌷 Điều chỉnh tần suất theo phản ứng thực tế của da &amp; tóc bạn nhé — đây là khung gợi ý, không phải quy tắc cứng.</footer>
    </div>
  );
}
