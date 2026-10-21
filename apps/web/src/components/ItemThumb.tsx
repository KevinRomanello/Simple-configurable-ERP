import { faBox } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

/** The small picture of an item in a list, or an empty square when it has none. */
export function ItemThumb({ id, hasImage, size = "thumb", name }: { id: number; hasImage: boolean; size?: "thumb" | "full"; name: string }) {
  return hasImage ? (
    <img className={`thumb ${size}`} src={`/api/inventory/items/${id}/image?size=${size}`} alt={name} loading="lazy" />
  ) : (
    <span className={`thumb ${size} empty`} aria-hidden="true">
      <FontAwesomeIcon icon={faBox} />
    </span>
  );
}
