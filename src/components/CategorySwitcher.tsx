import type { Category } from "../shared/types";

const BUTTONS: Array<{ cat: Category; icon: string; label: string }> = [
  { cat: "face", icon: "🌸", label: "Da mặt" },
  { cat: "hair", icon: "💛", label: "Tóc" },
  { cat: "body", icon: "🌰", label: "Da cơ thể" },
];

export default function CategorySwitcher({
  active,
  onSelect,
}: {
  active: Category;
  onSelect: (category: Category) => void;
}) {
  return (
    <div className="cat-switcher">
      {BUTTONS.map(({ cat, icon, label }) => (
        <button
          key={cat}
          type="button"
          className={`cat-btn${cat === active ? " active" : ""}`}
          data-cat={cat}
          onClick={() => onSelect(cat)}
        >
          <span className="ico">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
