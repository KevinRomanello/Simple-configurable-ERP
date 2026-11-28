import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { inventoryApi } from "./api";
import type { Area } from "../../platform/types";
import type { ItemRow, ItemType, TypeParam } from "./types";
import { AreaTypeFields, useAreaTypeFilter } from "./AreaTypeFilter";
import { HazardChecks, HazardPills } from "./HazardPills";
import { ItemThumb } from "./ItemThumb";
import { PriceSelector } from "./PriceSelector";
import { ReceiveForm } from "./ReceiveForm";
import { SearchSelect } from "../../core/SearchSelect";
import { Button } from "../../core/Button";
import { Card, Cards, DataTable, Field, MoneyCard, PageHeader, Panel, type Column } from "../../core/ui";
import { useMe } from "../../platform/auth";
import { money, moneyE4, quantity } from "../../core/format";
import { HAZARDS, useInventoryLookups } from "./inventory";
import { parseNumber, showValue, sortValue } from "./params";
import { usePrice } from "./price";
import { SCREEN, useMaxWidth } from "../../core/screen";

const PICTURE: Column<ItemRow> = { key: "picture", header: "", mobile: "hidden", cell: (r) => <ItemThumb id={r.id} hasImage={r.hasImage} name={r.name} /> };
// on a phone the picture is next to the name, at the top of the card
const ITEM: Column<ItemRow> = {
  key: "name",
  header: "ITEM",
  mobile: "title",
  sort: (r) => r.name,
  cell: (r) => (
    <>
      <span className="phone-only"><ItemThumb id={r.id} hasImage={r.hasImage} name={r.name} /></span>
      <div>
        <Link to={`/inventory/items/${r.id}`} className="item-link">{r.name}</Link>
        {r.origin === "made" && <span className="pill teal">made</span>}
        {r.code && <div className="muted">{r.code}</div>}
      </div>
    </>
  ),
};
// on a phone a card leaves out what is empty (see .none in components.css)
const none = <span className="muted none">—</span>;
// the make and the model, as in the budget: with the item they say which one it is
const BRAND: Column<ItemRow> = { key: "brand", header: "BRAND", sort: (r) => r.brand, cell: (r) => r.brand ?? none };
const MODEL: Column<ItemRow> = { key: "model", header: "MODEL", sort: (r) => r.model, cell: (r) => r.model ?? none };
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
    mobile: "hidden",
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
 * With a type chosen the list shows its parameters instead of area and type (they are
 * the same on every row), and the hazards only if the type asks them.
 */
function columnsFor(type: ItemType | undefined, areas: Area[], types: ItemType[]): Column<ItemRow>[] {
  if (type) return [PICTURE, ITEM, BRAND, MODEL, ...type.params.map(paramColumn), ...(type.hazards ? [HAZARD_COLUMN] : []), ...STOCK];
  const area: Column<ItemRow> = { key: "area", header: "AREA", sort: (r) => areas.find((a) => a.id === r.areaId)?.name ?? null, cell: (r) => areas.find((a) => a.id === r.areaId)?.name ?? none };
  const kind: Column<ItemRow> = { key: "type", header: "TYPE", sort: (r) => types.find((t) => t.id === r.typeId)?.name ?? null, cell: (r) => types.find((t) => t.id === r.typeId)?.name ?? none };
  return [PICTURE, ITEM, BRAND, MODEL, area, kind, HAZARD_COLUMN, ...STOCK];
}

/** INVENTORY: everything the team keeps, how much of it, where, and what it is worth. */
export function InventoryPage() {
  const canEdit = useMe().permissions.canManageInventory;
  const [price, setPrice] = usePrice();
  const lookups = useInventoryLookups();
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("");
  const [location, setLocation] = useState("");
  const [hazards, setHazards] = useState({ flammable: false, toxic: false, carcinogenic: false });
  /** What is typed in the filters of the parameters, by the name the API takes (`p12`, `p12min`, `p12max`). */
  const [params, setParams] = useState<Record<string, string>>({});
  // the filters of one type mean nothing for another: they start again when the type changes
  const areaType = useAreaTypeFilter(lookups, () => setParams({}));
  const { areaCode, areas, type } = areaType;
  // the search, the area, the type and the place are always in sight; the rest (kind, hazards, the parameters of the type, the prices)
  // is behind «More filters», which says how many of them are on. On a phone every filter but the search is behind «Filters».
  const phone = useMaxWidth(SCREEN.phone);
  const [filtersShown, setFiltersShown] = useState(false);
  const [moreShown, setMoreShown] = useState(false);
  const showFilters = !phone || filtersShown;
  const showMore = phone ? filtersShown : moreShown;

  const paramQuery = paramFilterQuery(type, params);

  const filters = {
    search: search.trim() || undefined, origin: origin || undefined, location: location || undefined,
    area: areaCode || undefined, type: type ? String(type.id) : undefined, ...paramQuery.query,
    // each one ticked narrows the list to the items that are so
    ...(type?.hazards === false ? {} : Object.fromEntries(HAZARDS.filter((h) => hazards[h.key]).map((h) => [h.key, "true"]))),
  };
  const filtersOn = Object.keys(filters).filter((key) => key !== "search" && filters[key as keyof typeof filters] !== undefined).length;
  const moreOn = Object.keys(filters).filter((key) => !["search", "area", "type", "location"].includes(key) && filters[key as keyof typeof filters] !== undefined).length;
  const items = useQuery({ queryKey: ["inventory-items", price, filters], queryFn: () => inventoryApi.inventoryItems(price, filters) });
  const everything = useQuery({ queryKey: ["inventory-items", price, {}], queryFn: () => inventoryApi.inventoryItems(price) });

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
                draftKey: "receive:item:none",
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
        <div className="filters">
          <div className="inline-form" role="search" aria-label="Find in the inventory">
            <div className="search-row">
              <Field label="Search" htmlFor="inventory-search" className="grow">
                <input id="inventory-search" className="input small" placeholder="Name, code, what it is for…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </Field>
              {phone && (
                <Button small variant="ghost" aria-expanded={filtersShown} onClick={() => setFiltersShown(!filtersShown)}>
                  {filtersShown ? "Close" : `Filters${filtersOn > 0 ? ` (${filtersOn})` : ""}`}
                </Button>
              )}
            </div>
            {showFilters && (
              <>
                <AreaTypeFields filter={areaType} idPrefix="inventory" />
                <Field label="Where" htmlFor="inventory-location">
                  <SearchSelect id="inventory-location" value={location} onChange={setLocation} choices={[{ value: "", label: "Anywhere" }, ...(lookups?.locations ?? []).map((l) => ({ value: l.code, label: l.label }))]} />
                </Field>
              </>
            )}
            {!phone && (
              <Button small variant="ghost" aria-expanded={moreShown} onClick={() => setMoreShown(!moreShown)}>
                {moreShown ? "Fewer filters" : `More filters${moreOn > 0 ? ` (${moreOn})` : ""}`}
              </Button>
            )}
          </div>
          {showMore && (
            <div className="filters-more">
              <section className="filter-group" aria-label="What kind">
                <div className="inline-form">
                  <Field label="Kind" htmlFor="inventory-origin">
                    <select id="inventory-origin" className="input small" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                      <option value="">Bought and made</option>
                      <option value="bought">Bought</option>
                      <option value="made">Made by the team</option>
                    </select>
                  </Field>
                  {type?.hazards !== false && <HazardChecks value={hazards} onChange={(key, checked) => setHazards({ ...hazards, [key]: checked })} />}
                </div>
              </section>
              {type && type.params.length > 0 && (
                <section className="filter-group" aria-label={`What is written about each ${type.name}`}>
                  <div className="filter-title">{type.path}</div>
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
            </div>
          )}
        </div>

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
