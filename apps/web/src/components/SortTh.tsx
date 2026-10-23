import { faSort, faSortDown, faSortUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ThHTMLAttributes } from "react";
import type { SortControl } from "../lib/sort";

/**
 * The header you click to sort by: its title and a small arrow (grey while the column is not the
 * one sorted by). Every table and the budget grid draw it with this, so it looks the same everywhere.
 */
export function SortButton({ label, direction, onClick }: { label: string; direction: 1 | -1 | 0; onClick: () => void }) {
  return (
    <button type="button" className="th-sort" onClick={onClick} title={`Sort by ${label.toLowerCase()}`}>
      {label}
      <FontAwesomeIcon icon={direction === 1 ? faSortUp : direction === -1 ? faSortDown : faSort} className={direction === 0 ? "faint" : ""} />
    </button>
  );
}

/** A table header you can click to sort by its column; click again to turn the order round, once more for the original order. */
export function SortTh({
  sort, by, children, ...th
}: { sort: SortControl; by: string; children: string } & Omit<ThHTMLAttributes<HTMLTableCellElement>, "children">) {
  const direction = sort.state?.key === by ? sort.state.direction : 0;
  return (
    <th {...th} aria-sort={direction === 1 ? "ascending" : direction === -1 ? "descending" : "none"}>
      <SortButton label={children} direction={direction} onClick={() => sort.toggle(by)} />
    </th>
  );
}
