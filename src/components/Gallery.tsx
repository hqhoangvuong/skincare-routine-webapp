import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";

export type GalleryEdit = {
  onRename: (index: number, name: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

export default function Gallery({
  products,
  editing = false,
  onEdit,
}: {
  products: string[];
  editing?: boolean;
  onEdit?: GalleryEdit;
}) {
  if (editing && onEdit) {
    return (
      <div className="gallery gallery-edit" data-testid="gallery">
        {products.map((product, index) => (
          <div className="prod prod-edit" key={index}>
            <Icon icon={pickIcon(product)} size={34} />
            <input
              type="text"
              value={product}
              placeholder="Sản phẩm chưa đặt tên"
              onChange={(e) => onEdit.onRename(index, e.target.value)}
            />
            <button type="button" aria-label={`Xoá sản phẩm ${index + 1}`} onClick={() => onEdit.onRemove(index)}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="gallery-add" onClick={onEdit.onAdd}>
          + Thêm sản phẩm
        </button>
      </div>
    );
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
