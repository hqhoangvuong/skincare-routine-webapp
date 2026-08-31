import { useState } from "react";
import CategorySwitcher from "./components/CategorySwitcher";
import type { Category } from "./shared/types";

export default function App() {
  const [activeCategory, setActiveCategory] = useState<Category>("face");

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

      {/* Task 5 renders <CategorySection category={activeCategory} /> here */}

      <footer>🌷 Điều chỉnh tần suất theo phản ứng thực tế của da &amp; tóc bạn nhé — đây là khung gợi ý, không phải quy tắc cứng.</footer>
    </div>
  );
}
