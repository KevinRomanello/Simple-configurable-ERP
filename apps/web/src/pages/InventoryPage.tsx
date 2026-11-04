import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import type { Area, ItemRow, ItemType, TypeParam } from "../api/types";
import { Chips } from "../components/Chips";
import { HazardChecks, HazardPills } from "../components/HazardPills";
import { ItemThumb } from "../components/ItemThumb";
import { PriceSelector } from "../components/PriceSelector";
import { ReceiveForm } from "../components/ReceiveForm";
import { SearchSelect } from "../components/SearchSelect";
import { Card, Cards, DataTable, Field, MoneyCard, PageHeader, Panel, type Column } from "../components/ui";
import { useMe } from "../lib/auth";
import { money, moneyE4, quantity } from "../lib/format";
import { HAZARDS, useInventoryLookups } from "../lib/inventory";
import { parseNumber, showValue, sortValue } from "../lib/params";
import { usePrice } from "../lib/price";

const PICTURE: Column<ItemRow> = { key: "picture", header: "", cell: (r) => <ItemThumb id={r.id} hasImage={r.hasImage} name={r.name} /> };
const ITEM: Column<ItemRow> = {
    key: "name",
    header: "ITEM",
    sort: (r) => r.name,
    cell: (r) => (
      <>
        <Link to={`/inventory/items/${r.id}`} className="item-link">{r.name}</Link>
        {r.origin === "made" && <span className="pill teal">made</span>}
        {r.code && <div className="muted">{r.code}</div>}
      </>
    ),
};
const none = <span className="muted">—</span>;
const CATEGORY: Column<ItemRow> = { key: "category", header: "CATEGORY", sort: (r) => r.category, cell: (r) => r.category ?? none };
const HAZARD_COLUMN: Column<ItemRow> = {
    key: "hazards",
    header: "HAZARDS",
    sort: (r) => HAZARDS.filter((h) => r[h.key]).length || null,
    cell: (r) => (HAZARDS.some((h) => r[h.key]) ? <HazardPills item={r} /> : none),
};
const STOCK: Column<ItemRow>[] = [
  { key: "onHand", header: "ON THE SHELF", num: true, sort: (r) => r.onHandMilli, cell: (r) => `${quantity(r.onHandMilli)} ${r.unit}` },
  {
    key: "bought",
    header: "BOUGHT",
    num: true,
    sort: (r) => (r.origin === "made" ? null : r.boughtMilli),
    cell: (r) => (r.origin === "made" ? <span className="muted">—</span> : `${quantity(r.boughtMilli)} ${r.unit}`),
  },
  {
    key: "unit",
    header: "UNIT PRICE",
    num: true,
    sort: (r) => r.unitE4,
    cell: (r) => (
      <>
        {r.unitE4 === null ? <span className="muted" title="Never bought">—</span> : moneyE4(r.unitE4)}
        {!r.complete && r.unitE4 !== null && <span className="negative" title="Something in its cost has never been bought"> !</span>}
      </>
    ),
  },
  {
    key: "value",
    header: "VALUE",
    num: true,
    className: "sum",
    sort: (r) => r.valueCents,
    cell: (r) => (r.valueCents === null ? <span className="muted">—</span> : money(r.valueCents)),
  },
  { key: "where", header: "WHERE", sort: (r) => r.places.join(", ") || null, cell: (r) => (r.places.length ? r.places.join(", ") : <span className="muted">—</span>) },
];

/** A column for what is written in one parameter of the chosen type. */
const paramColumn = (param: TypeParam): Column<ItemRow> => ({
  key: `p${param.id}`,
  header: param.name.toUpperCase(),
  num: param.kind === "number",
  sort: (r) => sortValue(param, r.values),
  cell: (r) => (r.values[param.id] === undefined ? none : showValue(param, r.values[param.id])),
});

/**
 * With a type chosen the list shows its parameters instead of area, type and category (they are
 * the same on every row), and the hazards only if the type asks them.
 */
function columnsFor(type: ItemType | undefined, areas: Area[], types: ItemType[]): Column<ItemRow>[] {
  if (type) return [PICTURE, ITEM, ...type.params.map(paramColumn), ...(type.hazards ? [HAZARD_COLUMN] : []), ...STOCK];
  const area: Column<ItemRow> = { key: "area", header: "AREA", sort: (r) => areas.find((a) => a.id === r.areaId)?.name ?? null, cell: (r) => areas.find((a) => a.id === r.areaId)?.name ?? none };
  const kind: Column<ItemRow> = { key: "type", header: "TYPE", sort: (r) => types.find((t) => t.id === r.typeId)?.name ?? null, cell: (r) => types.find((t) => t.id === r.typeId)?.name ?? none };
  return [PICTURE, ITEM, area, kind, CATEGORY, HAZARD_COLUMN, ...STOCK];
}

/** INVENTORY: everything the team keeps, how much of it, where, and what it is worth. */
export function InventoryPage() {
  const canEdit = useMe().permissions.canManageInventory;
  const [price, setPrice] = usePrice();
  const lookups = useInventoryLookups();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [origin, setOrigin] = useState("");
  const [location, setLocation] = useState("");
  const [hazards, setHazards] = useState({ flammable: false, toxic: false, carcinogenic: false });
  const [areaCode, setAreaCode] = useState("");
  const [typeId, setTypeId] = useState("");
  /** What is typed in the filters of the parameters, by the name the API takes (`p12`, `p12min`, `p12max`). */
  const [params, setParams] = useState<Record<string, string>>({});

  const areas = lookups?.areas ?? [];
  const areaId = areas.find((a) => a.code === areaCode)?.id;
  const types = (lookups?.types ?? []).filter((t) => areaId === undefined || t.areaId === null || t.areaId === areaId);
  const type = types.find((t) => String(t.id) === typeId);
  const chooseType = (id: string) => {
    setTypeId(id);
    setParams({}); // the filters of one type mean nothing for another
  };
  const chooseArea = (code: string) => {
    setAreaCode(code);
    const next = areas.find((a) => a.code === code)?.id;
    if (type && next !== undefined && type.areaId !== null && type.areaId !== next) chooseType("");
  };
  const paramQuery = paramFilterQuery(type, params);

  const filters = {
    search: search.trim() || undefined, category: category || undefined, origin: origin || undefined, location: location || undefined,
    area: areaCode || undefined, type: type ? String(type.id) : undefined, ...paramQuery.query,
    // each one ticked narrows the list to the items that are so
    ...(type?.hazards === false ? {} : Object.fromEntries(HAZARDS.filter((h) => hazards[h.key]).map((h) => [h.key, "true"]))),
  };
  const items = useQuery({ queryKey: ["inventory-items", price, filters], queryFn: () => api.inventoryItems(price, filters) });
  const everything = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => api.inventoryItems(price) });

  const rows = items.data ?? [];
  const value = rows.reduce((sum, r) => sum + (r.valueCents ?? 0), 0);

  return (
    <>
      <PageHeader
        title="INVENTORY"
        description="What the team keeps: how much, where, what it cost and what it is for. Goods bought with the budget are added from PENDING when they arrive."
        add={
          canEdit && lookups
            ? {
                label: "Add goods",
                form: (close) =>
                  everything.data && (
                    <Panel title="Add goods that were not in the budget">
                      <ReceiveForm items={everything.data} lookups={lookups} onDone={close} onCancel={close} />
                    </Panel>
                  ),
              }
            : undefined
        }
      />

      <Cards>
        <Card caption="Items shown">{rows.length}</Card>
        <MoneyCard caption="Value on the shelf" cents={value} />
      </Cards>

      <Panel>
        <section className="filter-group" aria-label="What to find">
          <div className="filter-title">Find</div>
          <div className="inline-form">
            <Field label="Search" htmlFor="inventory-search" className="grow">
              <input id="inventory-search" className="input small" placeholder="Name, code, what it is for…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
            <Field label="Category" htmlFor="inventory-category">
              <SearchSelect id="inventory-category" value={category} onChange={setCategory} choices={[{ value: "", label: "All" }, ...(lookups?.categories ?? []).map((c) => ({ value: c, label: c }))]} />
            </Field>
            <Field label="Kind" htmlFor="inventory-origin">
              <select id="inventory-origin" className="input small" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">Bought and made</option>
                <option value="bought">Bought</option>
                <option value="made">Made by the team</option>
              </select>
            </Field>
            <Field label="Where" htmlFor="inventory-location">
              <SearchSelect id="inventory-location" value={location} onChange={setLocation} choices={[{ value: "", label: "Anywhere" }, ...(lookups?.locations ?? []).map((l) => ({ value: l.code, label: l.label }))]} />
            </Field>
            {type?.hazards !== false && <HazardChecks value={hazards} onChange={(key, checked) => setHazards({ ...hazards, [key]: checked })} />}
          </div>
          <div className="inline-form">
            <Field label="Area" className="fit">
              <Chips label="Area" value={areaCode} onChange={chooseArea} options={[{ value: "", label: "All" }, ...areas.map((a) => ({ value: a.code, label: a.name }))]} />
            </Field>
            <Field label="Type" htmlFor="inventory-type">
              <SearchSelect id="inventory-type" value={type ? typeId : ""} onChange={chooseType} choices={[{ value: "", label: "All types" }, ...types.map((t) => ({ value: String(t.id), label: t.name }))]} />
            </Field>
          </div>
        </section>
        {type && type.params.length > 0 && (
          <section className="filter-group" aria-label={`What is written about each ${type.name}`}>
            <div className="filter-title">{type.name}</div>
            <div className="inline-form">
              {type.params.map((param) => (
                <ParamFilter key={param.id} param={param} params={params} errors={paramQuery.errors} onChange={(key, text) => setParams({ ...params, [key]: text })} />
              ))}
            </div>
            {type.params.some((p) => p.kind === "number" && p.prefixes) && <span className="hint">Numbers take k, M, m, µ, n, p: 4.7k, 4k7, 100n.</span>}
          </section>
        )}
        <section className="filter-group" aria-label="Which price">
          <div className="filter-title">Prices</div>
          <PriceSelector value={price} onChange={setPrice} date />
        </section>

        <DataTable title="Inventory" columns={columnsFor(type, areas, lookups?.types ?? [])} rows={items.data} rowKey={(r) => r.id} empty="Nothing here yet" />
      </Panel>
    </>
  );
}

/**
 * The filters of the parameters as the API takes them. A number that cannot be read is not sent
 * (the list is not narrowed by a typo) and its box says so.
 */
function paramFilterQuery(type: ItemType | undefined, typed: Record<string, string>) {
  const query: Record<string, string> = {};
  const errors = new Set<string>();
  for (const param of type?.params ?? []) {
    for (const key of param.kind === "number" ? [`p${param.id}min`, `p${param.id}max`] : [`p${param.id}`]) {
      const text = typed[key]?.trim() ?? "";
      if (text === "") continue;
      const value = param.kind === "number" ? parseNumber(text, param) : text;
      if (value === null) errors.add(key);
      else query[key] = value;
    }
  }
  return { query, errors };
}

/** The filter of one parameter: from–to for a number, a choice for a list or a yes/no, a piece of text for a text. */
function ParamFilter({ param, params, errors, onChange }: {
  param: TypeParam;
  params: Record<string, string>;
  errors: Set<string>;
  onChange: (key: string, text: string) => void;
}) {
  const id = `inventory-p${param.id}`;
  const box = (key: string, label: string) => (
    <input id={key === `p${param.id}max` ? `${id}-max` : id} className={`input small${errors.has(key) ? " error" : ""}`} aria-label={label} maxLength={40}
      value={params[key] ?? ""} onChange={(e) => onChange(key, e.target.value)} />
  );
  if (param.kind === "number") {
    return (
      <Field label={`${param.name}${param.unit ? ` (${param.unit})` : ""}: from – to`} htmlFor={id}>
        <div className="range">
          {box(`p${param.id}min`, `${param.name} from`)}
          <span className="muted">–</span>
          {box(`p${param.id}max`, `${param.name} to`)}
        </div>
      </Field>
    );
  }
  const choices = param.kind === "yesno" ? [["yes", "Yes"], ["no", "No"]] : param.kind === "list" ? param.choices.map((c) => [c, c]) : null;
  return (
    <Field label={param.name} htmlFor={id}>
      {choices ? (
        <select id={id} className="input small" value={params[`p${param.id}`] ?? ""} onChange={(e) => onChange(`p${param.id}`, e.target.value)}>
          <option value="">Any</option>
          {choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      ) : (
        box(`p${param.id}`, param.name)
      )}
    </Field>
  );
}
