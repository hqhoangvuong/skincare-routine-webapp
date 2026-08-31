import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";

export default function Gallery({ products }: { products: string[] }) {
  return (
    <div className="gallery">
      {products.map((product) => (
        <div className="prod" key={product}>
          <Icon icon={pickIcon(product)} size={34} />
          <span>{product}</span>
        </div>
      ))}
    </div>
  );
}
