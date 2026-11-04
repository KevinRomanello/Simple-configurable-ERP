import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "./Button";

// The buttons of the lists of the Settings page: the order of an entry and its bin.

/** The new order of a list when the entry at `index` moves one place up (-1) or down (+1). */
function moved(ids: number[], index: number, step: -1 | 1): number[] {
  const next = [...ids];
  [next[index], next[index + step]] = [next[index + step]!, next[index]!];
  return next;
}

/** The ↑↓ buttons of an ordered list. */
export function OrderButtons({ ids, index, onOrder, label }: { ids: number[]; index: number; onOrder: (ids: number[]) => void; label: string }) {
  return (
    <span className="icon-row">
      <IconButton icon={faArrowUp} label={`Move ${label} up`} disabled={index === 0} onClick={() => onOrder(moved(ids, index, -1))} />
      <IconButton icon={faArrowDown} label={`Move ${label} down`} disabled={index === ids.length - 1} onClick={() => onOrder(moved(ids, index, 1))} />
    </span>
  );
}

/** The bin of an entry: off while something uses the entry. */
export function DeleteButton({ label, usedBy, onDelete }: { label: string; usedBy: number; onDelete: () => void }) {
  return (
    <span title={usedBy > 0 ? `Used ${usedBy} times: it cannot be deleted` : undefined}>
      <IconButton icon={faTrash} label={`Delete ${label}`} danger disabled={usedBy > 0} onClick={onDelete} />
    </span>
  );
}
