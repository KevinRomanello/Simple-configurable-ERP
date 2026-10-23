import type { IHeaderParams } from "ag-grid-community";
import { useEffect, useState } from "react";
import { SortButton } from "./SortTh";

/** The header of a column of the budget grid: the same sortable title as in every table, driving the grid's own sorting. */
export function GridSortHeader({ displayName, enableSorting, column, progressSort }: IHeaderParams) {
  const [sort, setSort] = useState(column.getSort());
  useEffect(() => {
    const update = () => setSort(column.getSort());
    column.addEventListener("sortChanged", update);
    return () => column.removeEventListener("sortChanged", update);
  }, [column]);

  if (!enableSorting) return <span>{displayName}</span>;
  return <SortButton label={displayName} direction={sort === "asc" ? 1 : sort === "desc" ? -1 : 0} onClick={() => progressSort()} />;
}
