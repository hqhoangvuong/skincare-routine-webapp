import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { useBufferedText } from "../hooks/useBufferedText";
import ConfirmRemove from "./ConfirmRemove";

export type GalleryEdit = {
  onRename: (index: number, name: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

function ProductRow({
  product,
  index,
  onEdit,
}: {
  product: string;
  index: number;
  onEdit: GalleryEdit;
}) {
  const buf = useBufferedText(product, (name) => onEdit.onRename(index, name));
  return (
    <div className="prod prod-edit">
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
  );
}

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
          <ProductRow key={index} product={product} index={index} onEdit={onEdit} />
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
