import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { useBufferedText } from "../hooks/useBufferedText";
import { useDragSort } from "../hooks/useDragSort";
import { productUsage } from "../shared/content";
import { DAY_SHORT, PHASE_LABEL } from "./dayLabels";
import ConfirmRemove from "./ConfirmRemove";
import type { AppState, Category } from "../shared/types";

export type GalleryEdit = {
  onRename: (index: number, name: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onJump: (dayIndex: number, stepId: string) => void;
};

function UsageRow({
  state, category, product, onJump,
}: {
  state: AppState;
  category: Category;
  product: string;
  onJump: (dayIndex: number, stepId: string) => void;
}) {
  const hits = productUsage(state, category, product);
  if (hits.length === 0) {
    return <p className="prod-usage prod-usage-empty">⚠ Chưa dùng ở bước nào</p>;
  }
  return (
    <div className="prod-usage">
      {hits.map((h) => (
        <button
          type="button"
          key={h.stepId}
          onClick={() => onJump(h.dayIndex, h.stepId)}
        >
          {DAY_SHORT[h.dayIndex]} {PHASE_LABEL[h.phase]}
        </button>
      ))}
    </div>
  );
}

type HandleProps = ReturnType<ReturnType<typeof useDragSort<string>>["handleProps"]>;

function ProductRow({
  product, index, onEdit, dragging, dropTarget, state, category, handleProps,
}: {
  product: string;
  index: number;
  onEdit: GalleryEdit;
  dragging: boolean;
  dropTarget: boolean;
  state?: AppState;
  category?: Category;
  handleProps: HandleProps;
}) {
  const buf = useBufferedText(product, (name) => onEdit.onRename(index, name));
  const cls = `prod prod-edit${dragging ? " dragging" : ""}${dropTarget ? " drop-target" : ""}`;
  return (
    <li className={cls}>
      <div className="prod-edit-head">
        <button type="button" className={`drag-handle${dragging ? " is-dragging" : ""}`} {...handleProps}>
          ⠿
        </button>
        <Icon icon={pickIcon(product)} size={34} />
        <input
          type="text"
          aria-label={`Tên sản phẩm ${index + 1}`}
          placeholder="Sản phẩm chưa đặt tên"
          value={buf.value}
          onChange={buf.onChange}
          onFocus={buf.onFocus}
          onBlur={buf.onBlur}
        />
        <ConfirmRemove
          label={product ? `Xoá ${product}` : `Xoá sản phẩm ${index + 1}`}
          onConfirm={() => onEdit.onRemove(index)}
        />
      </div>
      {state && category && (
        <UsageRow state={state} category={category} product={product} onJump={onEdit.onJump} />
      )}
    </li>
  );
}

function GalleryEditList({
  products, onEdit, state, category,
}: {
  products: string[];
  onEdit: GalleryEdit;
  state?: AppState;
  category?: Category;
}) {
  const { order, handleProps, draggingKey, dropTargetKey } = useDragSort(
    products,
    (_name, i) => String(i),
    (from, to) => onEdit.onMove(from, to),
    { mode: "onDrop", itemNoun: "sản phẩm" },
  );
  return (
    <div className="gallery gallery-edit" data-testid="gallery">
      {/* the hook's pointer path walks `handle.closest("li")` then its parent as the
          rect source — the editable shelf must be a real <ul>/<li> list, same as the
          step editor (`ul.steps-edit` > `StepEditor`'s <li>). */}
      <ul className="gallery-edit-list">
        {order.map((product, index) => (
          <ProductRow
            key={index}
            product={product}
            index={index}
            onEdit={onEdit}
            dragging={draggingKey === String(index)}
            dropTarget={dropTargetKey === String(index)}
            state={state}
            category={category}
            handleProps={handleProps(index)}
          />
        ))}
      </ul>
      <button type="button" className="gallery-add" onClick={onEdit.onAdd}>
        + Thêm sản phẩm
      </button>
    </div>
  );
}

export default function Gallery({
  products,
  state,
  category,
  editing = false,
  onEdit,
}: {
  products: string[];
  state?: AppState;
  category?: Category;
  editing?: boolean;
  onEdit?: GalleryEdit;
}) {
  if (editing && onEdit) {
    return <GalleryEditList products={products} onEdit={onEdit} state={state} category={category} />;
  }
  return (
    <div className="gallery" data-testid="gallery">
      {products.map((product, index) => (
        <div className="prod" key={index}>
          <Icon icon={pickIcon(product)} size={34} />
          <span>{product || "Sản phẩm chưa đặt tên"}</span>
        </div>
      ))}
    </div>
  );
}
