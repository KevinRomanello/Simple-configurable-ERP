import { faBox } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Picture } from "../../core/Picture";

/** The picture of an item, small as it is drawn (a click opens the big one), or an empty square when it has none. */
export function ItemThumb({ id, hasImage, size = "thumb", name }: { id: number; hasImage: boolean; size?: "thumb" | "full"; name: string }) {
  return hasImage ? (
    <Picture className={`thumb ${size}`} src={`/api/inventory/items/${id}/image?size=${size}`} large={`/api/inventory/items/${id}/image?size=full`} alt={name} />
  ) : (
    <span className={`thumb ${size} empty`} aria-hidden="true">
      <FontAwesomeIcon icon={faBox} />
    </span>
  );
}
