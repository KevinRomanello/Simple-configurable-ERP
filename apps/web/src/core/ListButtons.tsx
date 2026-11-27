import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "./Button";

// The bin of an entry in the lists of the Settings page (the order is the handle of the table: DataTable `reorder`).

/** The bin of an entry: off while something uses the entry. */
export function DeleteButton({ label, usedBy, onDelete }: { label: string; usedBy: number; onDelete: () => void }) {
  return (
    <span title={usedBy > 0 ? `Used ${usedBy} times: it cannot be deleted` : undefined}>
      <IconButton icon={faTrash} label={`Delete ${label}`} danger disabled={usedBy > 0} onClick={onDelete} />
    </span>
  );
}
