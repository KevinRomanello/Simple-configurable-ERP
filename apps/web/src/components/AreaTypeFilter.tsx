import { useState } from "react";
import type { InventoryLookups } from "../lib/inventory";
import { typeLevels } from "../lib/typeTree";
import { Chips } from "./Chips";
import { SearchSelect } from "./SearchSelect";
import { Field } from "./ui";

/**
 * The search by area and by type of a list of the inventory: the area chosen narrows the types offered, and the type is
 * a menu for each level (the next one has only the types under what is chosen in the one before). `onTypeChange`: what
 * else depends on the type (the filters of its parameters) starts again when it changes.
 */
export function useAreaTypeFilter(lookups: InventoryLookups | null, onTypeChange: () => void = () => {}) {
  const [areaCode, setAreaCode] = useState("");
  const [typeId, setTypeId] = useState("");
  const areas = lookups?.areas ?? [];
  const areaId = areas.find((a) => a.code === areaCode)?.id;
  const visible = (lookups?.types ?? []).filter((t) => areaId === undefined || t.areaId === null || t.areaId === areaId);
  const type = visible.find((t) => String(t.id) === typeId);
  const chooseType = (id: string) => {
    setTypeId(id);
    onTypeChange();
  };
  const chooseArea = (code: string) => {
    setAreaCode(code);
    const next = areas.find((a) => a.code === code)?.id;
    if (type && next !== undefined && type.areaId !== null && type.areaId !== next) chooseType("");
  };
  const levels = typeLevels(lookups?.types ?? [], visible, type ? type.id : null);
  return { areaCode, areas, type, levels, chooseArea, chooseType };
}

/** The fields of `useAreaTypeFilter`: the area, and a menu for each level of the type. */
export function AreaTypeFields({ filter, idPrefix }: { filter: ReturnType<typeof useAreaTypeFilter>; idPrefix: string }) {
  const { areaCode, areas, levels, chooseArea, chooseType } = filter;
  return (
    <>
      <Field label="Area" className="fit">
        <Chips label="Area" value={areaCode} onChange={chooseArea} options={[{ value: "", label: "All" }, ...areas.map((a) => ({ value: a.code, label: a.name }))]} />
      </Field>
      {levels.map((level, i) => (
        <Field key={`${i}-${level.parent?.id ?? 0}`} label={level.parent ? `Kind of ${level.parent.name}` : "Type"} htmlFor={`${idPrefix}-type-${i}`}>
          <SearchSelect
            id={`${idPrefix}-type-${i}`}
            value={level.selected ? String(level.selected.id) : ""}
            // clearing a menu goes back to the type of the menu before it
            onChange={(id) => chooseType(id !== "" ? id : level.parent ? String(level.parent.id) : "")}
            choices={[{ value: "", label: level.parent ? `Any ${level.parent.name}` : "All types" }, ...level.options.map((t) => ({ value: String(t.id), label: t.name }))]}
          />
        </Field>
      ))}
    </>
  );
}
