import { faChevronLeft, faChevronRight, faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { registry, type FileRef, type RegField, type RegRecord, type RegTable, type RegView } from "../../api/registry";
import { IconButton } from "../../components/Button";
import { ValueView } from "../../components/registry/Values";
import { Picture } from "../../components/Picture";
import { approach, clampZoom, levelsOf, TILE, tileLayout, tileZoom, wheelPoints, zoomTo, type Camera } from "../../lib/mapZoom";
import { isPicture, planMove, showValue } from "../../lib/registry";
import { useAction } from "../../lib/useAction";

// The other ways of looking at a view (docs/anagrafiche.md, §6): cards with a picture (gallery), columns by a choice
// (kanban), the days of a month (calendar), bars from a date to another (timeline, a gantt with its arrows) and
// points on a map. The records are the same as the grid's. Cards and bars move with the pointer events, so they
// work with a mouse, a finger and an automated test.


function titleOf(table: RegTable, record: RegRecord) {
  const primary = table.fields.find((f) => f.id === table.primaryFieldId);
  return (primary ? showValue(primary, record.fields[primary.name]) : "") || `#${record.id}`;
}

function CardBody({ table, record, fields }: { table: RegTable; record: RegRecord; fields: RegField[] }) {
  return (
    <>
      <strong>{titleOf(table, record)}</strong>
      {fields.filter((f) => f.id !== table.primaryFieldId).slice(0, 5).map((f) => {
        const v = record.fields[f.name];
        if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return null;
        return (
          <div key={f.id} className="card-line">
            <span className="label-s muted">{f.name}</span> <ValueView field={f} value={v} />
          </div>
        );
      })}
    </>
  );
}

/**
 * Moving a card onto a target (an element with `data-drop="<key>"`): pressed and moved by a few pixels it is a
 * drag, otherwise a click. Returns what a card needs and the floating copy shown while it moves.
 */
function useDrag(onDrop: (id: number, key: string) => void) {
  const [drag, setDrag] = useState<{ id: number; label: string; x: number; y: number; over: string | null } | null>(null);
  const moved = useRef(false);
  const start = (event: ReactPointerEvent, id: number, label: string) => {
    if (event.button !== 0) return;
    const x0 = event.clientX;
    const y0 = event.clientY;
    moved.current = false;
    const target = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-drop]") as HTMLElement | null)?.dataset.drop ?? null;
    const move = (e: PointerEvent) => {
      if (!moved.current && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
      moved.current = true;
      setDrag({ id, label, x: e.clientX, y: e.clientY, over: target(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // a quick gesture may bring few moves, or none: the distance between press and release decides too
      if (Math.hypot(e.clientX - x0, e.clientY - y0) >= 6) moved.current = true;
      if (moved.current) {
        const key = target(e.clientX, e.clientY);
        if (key !== null) onDrop(id, key);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /** The click that ends a drag does not open the record. */
  const clicked = () => !moved.current;
  const ghost = drag && <div className="drag-ghost" style={{ left: drag.x + 8, top: drag.y + 8 }}>{drag.label}</div>;
  return { start, clicked, over: drag?.over ?? null, dragging: drag?.id ?? null, ghost };
}

export function Gallery({ table, view, records, fields, onOpen }: { table: RegTable; view: RegView; records: RegRecord[]; fields: RegField[]; onOpen: (id: number) => void }) {
  const cover = table.fields.find((f) => f.id === view.config.coverField);
  return (
    <div className="gallery">
      {records.map((r) => {
        const picture = cover ? ((r.fields[cover.name] as FileRef[] | undefined) ?? []).find(isPicture) : undefined;
        return (
          <button key={r.id} type="button" className="gallery-card" onClick={() => onOpen(r.id)}>
            {cover && (picture ? <Picture src={registry.fileUrl(picture.id)} alt={picture.name} /> : <span className="gallery-empty" aria-hidden="true" />)}
            <CardBody table={table} record={r} fields={fields.filter((f) => f.id !== cover?.id)} />
          </button>
        );
      })}
    </div>
  );
}

export function Kanban({ table, view, records, fields, onOpen }: { table: RegTable; view: RegView; records: RegRecord[]; fields: RegField[]; onOpen: (id: number) => void }) {
  const act = useAction();
  const by = table.fields.find((f) => f.id === (Array.isArray(view.config.groupBy) ? view.config.groupBy[0] : view.config.groupBy));
  const drag = useDrag((id, to) => {
    const record = records.find((r) => r.id === id);
    if (!by || !record || (record.fields[by.name] ?? "") === to) return;
    void act(() => registry.updateRecord(table.id, id, { [by.name]: to === "" ? null : to }, record.version));
  });
  if (!by || by.type !== "select") return <p className="empty">A kanban needs a Choice field to make its columns: choose it in Table settings › Views.</p>;
  const canMove = table.writable.includes(by.id);
  // the column of the cards without a choice goes last: it appears while a card moves, and must not push the others
  const columns = [...(by.options.choices ?? []).map((c) => c.name), ""];
  return (
    <div className="kanban">
      {columns.map((column) => {
        const cards = records.filter((r) => (r.fields[by.name] ?? "") === column);
        if (column === "" && cards.length === 0 && drag.dragging === null) return null;
        return (
          <section key={column} data-drop={column} className={`kanban-column${drag.over === column ? " over" : ""}`} aria-label={column || "Empty"}>
            <h3>{column || "(empty)"} <span className="muted">{cards.length}</span></h3>
            {cards.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`kanban-card${drag.dragging === r.id ? " dragging" : ""}`}
                onPointerDown={canMove ? (e) => drag.start(e, r.id, titleOf(table, r)) : undefined}
                onClick={() => drag.clicked() && onOpen(r.id)}
              >
                <CardBody table={table} record={r} fields={fields.filter((f) => f.id !== by.id)} />
              </button>
            ))}
          </section>
        );
      })}
      {drag.ghost}
    </div>
  );
}

/** The day (YYYY-MM-DD) of a value of a date field: a date, a moment, the first of a list. */
function dayOf(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  return v.length > 10 ? new Date(v).toLocaleDateString("en-CA") : v.slice(0, 10);
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTHS = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function MonthNav({ month, onMonth, children }: { month: Date; onMonth: (d: Date) => void; children?: ReactNode }) {
  const shift = (n: number) => onMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <div className="inline-form month-nav">
      <IconButton icon={faChevronLeft} label="Month before" onClick={() => shift(-1)} />
      <strong>{MONTHS.format(month)}</strong>
      <IconButton icon={faChevronRight} label="Month after" onClick={() => shift(1)} />
      <button type="button" className="chip" onClick={() => onMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
      {children}
    </div>
  );
}

/** The month where most records are, or this month: so a calendar never opens empty by chance. */
function startMonth(days: string[]): Date {
  const now = new Date();
  const thisMonth = iso(now).slice(0, 7);
  if (days.length === 0 || days.some((d) => d.startsWith(thisMonth))) return new Date(now.getFullYear(), now.getMonth(), 1);
  const latest = [...days].sort().at(-1)!;
  return new Date(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)) - 1, 1);
}

export function CalendarView({ table, view, records, onOpen }: { table: RegTable; view: RegView; records: RegRecord[]; onOpen: (id: number) => void }) {
  const act = useAction();
  const field = table.fields.find((f) => f.id === view.config.dateField);
  const days = field ? records.map((r) => dayOf(r.fields[field.name])).filter((d): d is string => d !== null) : [];
  const [month, setMonth] = useState(() => startMonth(days));
  const canMove = field !== undefined && field.type === "date" && table.writable.includes(field.id);
  const drag = useDrag((id, day) => {
    const record = records.find((r) => r.id === id);
    if (!field || !record || dayOf(record.fields[field.name]) === day) return;
    void act(() => registry.updateRecord(table.id, id, { [field.name]: day }, record.version));
  });
  if (!field) return <p className="empty">A calendar needs a date field: choose it in Table settings › Views.</p>;
  // six weeks from the Monday before the first of the month
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const from = new Date(first);
  from.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i));
  const today = iso(new Date());
  const undated = records.filter((r) => dayOf(r.fields[field.name]) === null).length;
  return (
    <div className="stack tight">
      <MonthNav month={month} onMonth={setMonth}>{undated > 0 && <span className="muted label-s">{undated} without {field.name}</span>}</MonthNav>
      <div className="calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="calendar-head label-s muted">{d}</div>)}
        {cells.map((d) => {
          const key = iso(d);
          const here = records.filter((r) => dayOf(r.fields[field.name]) === key);
          return (
            <div key={key} data-drop={key} className={`calendar-day${d.getMonth() !== month.getMonth() ? " other" : ""}${key === today ? " today" : ""}${drag.over === key ? " over" : ""}`}>
              <span className="label-s">{d.getDate()}</span>
              {here.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="calendar-item"
                  onPointerDown={canMove ? (e) => drag.start(e, r.id, titleOf(table, r)) : undefined}
                  onClick={() => drag.clicked() && onOpen(r.id)}
                >
                  {titleOf(table, r)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {drag.ghost}
    </div>
  );
}

const DAY = 86_400_000;
const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** The height of a row of the timeline and the space between two, as in the style sheet (.timeline-rows). */
const ROW = 26;
const GAP = 4;

export function Timeline({ table, view, records, onOpen }: { table: RegTable; view: RegView; records: RegRecord[]; onOpen: (id: number) => void }) {
  const start = table.fields.find((f) => f.id === view.config.dateField);
  const end = table.fields.find((f) => f.id === view.config.endDateField);
  // a link of the table to itself: the records that come after, drawn as arrows (a gantt)
  const next = table.fields.find((f) => f.id === view.config.dependencyField);
  const act = useAction();
  // bars move and stretch only when their dates are days the person may change
  const canMove = start?.type === "date" && table.writable.includes(start.id) && (!end || (end.type === "date" && table.writable.includes(end.id)));
  const [slide, setSlide] = useState<{ id: number; mode: "move" | "start" | "end"; days: number } | null>(null);
  const slid = useRef(false);
  const rows = start
    ? records
        .map((r) => {
          const s = dayOf(r.fields[start.name]);
          const e = (end && dayOf(r.fields[end.name])) || s;
          return s ? { r, s, e: e! < s ? s : e! } : null;
        })
        .filter((x): x is { r: RegRecord; s: string; e: string } => x !== null)
        .sort((a, b) => a.s.localeCompare(b.s))
    : [];
  const [month, setMonth] = useState(() => startMonth(rows.map((x) => x.s)));
  if (!start) return <p className="empty">A timeline needs a start date: choose it in Table settings › Views.</p>;
  // three months from the one chosen
  const from = new Date(month.getFullYear(), month.getMonth(), 1).getTime();
  const to = new Date(month.getFullYear(), month.getMonth() + 3, 1).getTime();
  const span = to - from;
  const at = (day: string) => new Date(`${day}T00:00:00`).getTime();
  const shown = rows.filter((x) => at(x.e) + DAY > from && at(x.s) < to);

  /** The new days of a bar moved by `days` (the whole bar, or one of its ends). */
  const placed = (row: { s: string; e: string }, mode: "move" | "start" | "end", days: number) => {
    const s = mode === "end" ? row.s : shiftDay(row.s, days);
    const e = mode === "start" ? row.e : shiftDay(row.e, days);
    return mode === "start" ? { s: s > e ? e : s, e } : { s, e: e < s ? s : e };
  };
  const save = (row: { r: RegRecord; s: string; e: string }, mode: "move" | "start" | "end", days: number) => {
    const { s, e } = placed(row, mode, days);
    const bars = rows.map((x) => ({ id: x.r.id, start: x.s, end: x.e, next: next ? ((x.r.fields[next.name] as { id: number }[] | undefined) ?? []).map((n) => n.id) : [] }));
    // in a gantt the records after it move on too, when they would start before it ends
    const moves = planMove(bars, row.r.id, s, end ? e : s);
    // a record without an end stays without one (it is a day); the bar stretched by its end gets one
    const hasEnd = (id: number) => end !== undefined && ((id === row.r.id && mode === "end") || dayOf(records.find((r) => r.id === id)?.fields[end.name]) !== null);
    return act(() => registry.updateRecords(table.id, moves.map((m) => ({ id: m.id, fields: { [start!.name]: m.start, ...(hasEnd(m.id) ? { [end!.name]: m.end } : {}) } }))));
  };
  const begin = (event: ReactPointerEvent, row: { r: RegRecord; s: string; e: string }, mode: "move" | "start" | "end") => {
    if (!canMove || event.button !== 0) return;
    event.stopPropagation();
    const lane = (event.currentTarget as HTMLElement).closest(".timeline-lane")!.getBoundingClientRect();
    const dayPx = lane.width / (span / DAY);
    const x0 = event.clientX;
    slid.current = false;
    const daysAt = (x: number) => Math.round((x - x0) / dayPx);
    const move = (e: PointerEvent) => {
      if (Math.abs(e.clientX - x0) >= 4) slid.current = true;
      if (slid.current) setSlide({ id: row.r.id, mode, days: daysAt(e.clientX) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (Math.abs(e.clientX - x0) >= 4) slid.current = true;
      setSlide(null);
      const days = daysAt(e.clientX);
      if (slid.current && days !== 0) void save(row, mode, days);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const ticks = [0, 1, 2].map((m) => new Date(month.getFullYear(), month.getMonth() + m, 1));
  const today = Date.now();
  return (
    <div className="stack tight">
      <MonthNav month={month} onMonth={setMonth}>
        <span className="muted label-s">{start.name}{end ? ` → ${end.name}` : ""} · {shown.length} of {rows.length} in these three months</span>
      </MonthNav>
      <div className="timeline">
        <div className="timeline-scale">
          {ticks.map((t) => <span key={t.toISOString()} style={{ left: `${((t.getTime() - from) / span) * 100}%` }}>{MONTHS.format(t)}</span>)}
          {today > from && today < to && <i className="timeline-today" style={{ left: `${((today - from) / span) * 100}%` }} />}
        </div>
        <div className="timeline-rows">
          {shown.map((row) => {
            const { r } = row;
            // while it moves, the bar shows where it would go
            const { s, e } = slide?.id === r.id ? placed(row, slide.mode, slide.days) : row;
            const left = Math.max(0, (at(s) - from) / span);
            const right = Math.min(1, (at(e) + DAY - from) / span);
            return (
              <div key={r.id} className="timeline-row">
                <span className="timeline-label">{titleOf(table, r)}</span>
                <div className="timeline-lane">
                  <button
                    type="button"
                    className={`timeline-bar${canMove ? " movable" : ""}${slide?.id === r.id ? " moving" : ""}`}
                    style={{ left: `${left * 100}%`, width: `${Math.max(0.6, (right - left) * 100)}%` }}
                    title={`${s} → ${e}${canMove ? " · drag to move" : ""}`}
                    onPointerDown={(event) => begin(event, row, "move")}
                    onClick={() => !slid.current && onOpen(r.id)}
                  >
                    {canMove && end && <span className="timeline-handle start" aria-hidden onPointerDown={(event) => begin(event, row, "start")} />}
                    {s === e ? s : `${s} → ${e}`}
                    {canMove && end && <span className="timeline-handle end" aria-hidden onPointerDown={(event) => begin(event, row, "end")} />}
                  </button>
                </div>
              </div>
            );
          })}
          {next && shown.length > 1 && <Arrows rows={shown} field={next.name} x={(day) => Math.min(1, Math.max(0, (at(day) - from) / span)) * 1000} />}
        </div>
        {shown.length === 0 && <p className="empty">Nothing in these three months.</p>}
      </div>
    </div>
  );
}

/** The arrows of a gantt: from the end of a record to the start of each record that comes after it. */
function Arrows({ rows, field, x }: { rows: { r: RegRecord; s: string; e: string }[]; field: string; x: (day: string) => number }) {
  const index = new Map(rows.map((row, i) => [row.r.id, i]));
  const height = rows.length * ROW + (rows.length - 1) * GAP;
  const y = (i: number) => i * (ROW + GAP) + ROW / 2;
  const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  const lines = rows.flatMap((row, i) =>
    ((row.r.fields[field] as { id: number }[] | undefined) ?? []).flatMap((after) => {
      const j = index.get(after.id);
      if (j === undefined) return [];
      const x1 = x(nextDay(row.e));
      const x2 = x(rows[j]!.s);
      const bend = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 16));
      return [`M${x1},${y(i)} H${bend} V${y(j)} H${x2}`];
    }),
  );
  return (
    <svg className="timeline-arrows" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <marker id="timeline-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" />
        </marker>
      </defs>
      {lines.map((d, k) => <path key={k} d={d} markerEnd="url(#timeline-arrow)" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

// --- the map ----------------------------------------------------------------------------------------

const MAP_HEIGHT = 480;

/** A point (latitude, longitude) in the pixels of the whole world at zoom `z` (Web Mercator, like every web map). */
function worldPixel(lat: number, lng: number, z: number): { x: number; y: number } {
  const size = TILE * 2 ** z;
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

/** The zoom and centre that show every point, with a margin. */
function fit(points: { lat: number; lng: number }[], width: number): Camera {
  for (let z = 16; z > 1; z--) {
    const px = points.map((p) => worldPixel(p.lat, p.lng, z));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) < width - 80 && Math.max(...ys) - Math.min(...ys) < MAP_HEIGHT - 80) {
      return { z, x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
    }
  }
  const p = worldPixel(points[0]?.lat ?? 46.07, points[0]?.lng ?? 11.12, 2);
  return { z: 2, ...p };
}

/**
 * The map view (NocoDB's Map): each record at the coordinates of its field. The pictures of the map come from the
 * ERP (`/api/registry/tiles`), which fetches them for everybody: the browser talks to nobody else.
 *
 * The map moves and zooms only after a click on it, so that the page scrolls past it as it does past any other box: the wheel
 * and the pinch of a trackpad are the map's while it is clicked, until the pointer leaves it, somebody clicks elsewhere or Esc
 * is pressed (the + and − buttons and the pins work always). The zoom is continuous: every movement of the wheel zooms a little,
 * and the map eases towards where they lead (lib/mapZoom.ts), keeping the point under the pointer still.
 */
export function MapView({ table, view, records, onOpen }: { table: RegTable; view: RegView; records: RegRecord[]; onOpen: (id: number) => void }) {
  const geo = table.fields.find((f) => f.id === view.config.geoField);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const points = geo
    ? records.flatMap((r) => {
        const [lat, lng] = String(r.fields[geo.name] ?? "").split(";").map(Number);
        return lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && String(r.fields[geo.name] ?? "") !== "" ? [{ r, lat, lng }] : [];
      })
    : [];
  // the camera is also kept in a ref: the wheel and the drawing loop read the latest one without waiting for a render
  const [camera, setCamera] = useState(() => fit(points, 800));
  const cameraRef = useRef(camera);
  const commit = (c: Camera) => {
    cameraRef.current = c;
    setCamera(c);
  };
  useEffect(() => {
    const measured = box.current?.clientWidth ?? 800;
    setWidth(measured);
    goal.current = null;
    commit(fit(points, measured));
  }, [view.id, points.length]);

  // where the zoom is going (a zoom and the pixel under which the map stays still), and the drawing that eases towards it
  const goal = useRef<{ z: number; offset: { x: number; y: number } } | null>(null);
  const frame = useRef<number | null>(null);
  const draw = () => {
    frame.current = null;
    const to = goal.current;
    if (!to) return;
    const now = cameraRef.current;
    const z = approach(now.z, to.z);
    commit(zoomTo(now, z, to.offset));
    if (z === to.z) goal.current = null;
    else frame.current = requestAnimationFrame(draw);
  };
  const ease = () => {
    if (frame.current === null) frame.current = requestAnimationFrame(draw);
  };

  // clicked: the map is the one that gets the wheel
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const activate = (on: boolean) => {
    activeRef.current = on;
    setActive(on);
  };
  const panning = useRef(false);
  useEffect(() => {
    if (!active) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) activate(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") activate(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [active]);

  // The wheel and the pinch of a trackpad zoom the map and nothing else: the listener is not a passive one (React's `onWheel` is),
  // so that the page does not scroll, and the browser does not zoom the whole page, at the same time. Until the map is clicked it
  // lets them through.
  const hasMap = geo !== undefined;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const offset = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
      goal.current = { z: clampZoom((goal.current?.z ?? cameraRef.current.z) + levelsOf(wheelPoints(e, window.innerHeight))), offset };
      ease();
    };
    // Safari sends a pinch as its own gesture events, and zooms the page with them
    const still = (e: Event) => {
      if (activeRef.current) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", still);
    el.addEventListener("gesturechange", still);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", still);
      el.removeEventListener("gesturechange", still);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      goal.current = null;
    };
  }, [hasMap]);

  // The pictures: those of the level nearest the zoom, stretched to it. While the ones of a new level arrive, the ones of the
  // level before stay under them, so that there is no blank map in between.
  const want = tileZoom(camera.z);
  const [settled, setSettled] = useState(want);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const seen = (key: string) => setLoaded((now) => (now.has(key) ? now : new Set(now.size > 3000 ? [] : now).add(key)));
  const left = camera.x - width / 2;
  const top = camera.y - MAP_HEIGHT / 2;
  const wanted = tileLayout(camera.z, want, left, top, width, MAP_HEIGHT);
  useEffect(() => {
    if (settled !== want && wanted.every((t) => loaded.has(t.key))) setSettled(want);
  });
  const under = settled !== want && Math.abs(camera.z - settled) <= 2 ? tileLayout(camera.z, settled, left, top, width, MAP_HEIGHT) : [];
  const tiles = [...(under.length > 150 ? [] : under), ...wanted];

  if (!geo) return <p className="empty">A map needs a field of coordinates: choose it in Table settings › Views.</p>;

  const zoom = (by: 1 | -1) => {
    goal.current = { z: clampZoom(Math.round(goal.current?.z ?? cameraRef.current.z) + by), offset: { x: 0, y: 0 } };
    ease();
  };
  const pan = (event: ReactPointerEvent) => {
    activate(true);
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    goal.current = null; // a hand on the map stops the zoom that was coming
    panning.current = true;
    const x0 = event.clientX;
    const y0 = event.clientY;
    const start = cameraRef.current;
    const move = (e: PointerEvent) => commit({ ...start, x: start.x - (e.clientX - x0), y: start.y - (e.clientY - y0) });
    const up = () => {
      panning.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="stack tight">
      <div className="inline-form">
        <IconButton icon={faPlus} label="Zoom in" onClick={() => zoom(1)} />
        <IconButton icon={faMinus} label="Zoom out" onClick={() => zoom(-1)} />
        <span className="muted label-s">{geo.name} · {points.length} of {records.length} on the map</span>
      </div>
      <div
        ref={box}
        className={`map${active ? " active" : ""}`}
        style={{ height: MAP_HEIGHT }}
        onPointerDown={pan}
        // a mouse that leaves lets the page have its wheel back; a finger lifted does not mean it left
        onPointerLeave={(e) => e.pointerType === "mouse" && !panning.current && activate(false)}
      >
        {tiles.map((t) => {
          const columns = 2 ** t.level;
          return (
            <img
              key={t.key}
              className="map-tile"
              src={registry.tileUrl(t.level, ((t.tx % columns) + columns) % columns, t.ty)}
              alt=""
              draggable={false}
              style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
              onLoad={() => seen(t.key)}
              onError={() => seen(t.key)}
            />
          );
        })}
        {points.map(({ r, lat, lng }) => {
          const p = worldPixel(lat, lng, camera.z);
          return (
            <button key={r.id} type="button" className="map-pin" style={{ left: p.x - left, top: p.y - top }} title={titleOf(table, r)} onClick={() => onOpen(r.id)}>
              <span className="map-pin-label">{titleOf(table, r)}</span>
            </button>
          );
        })}
        {!active && <span className="map-hint">Click the map to move and zoom it</span>}
        <span className="map-credit">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
        </span>
      </div>
    </div>
  );
}
