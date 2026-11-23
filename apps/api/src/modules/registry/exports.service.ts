import { recordPermission, textOf, toCsv, type Field, type RecordRow, type Registry, type Table, type Viewer } from "@erp/registry";
import { invalid } from "../../core/errors";
import { matching, needReadable, open, out, select, type Query } from "./records.service";

// The records of a table as files (docs/anagrafiche.md, §10.2): CSV and JSON (any view), iCalendar (a
// calendar or a timeline view). The same records and fields the list would give the person asking.

/** The rows of a request with the fields shown, each value as the viewer may see it. */
function rows(reg: Registry, table: Table, viewer: Viewer, shown: Field[], records: RecordRow[]) {
  return records.map((r) => {
    const visible = recordPermission(reg, table, r, viewer).visible;
    return shown.map((f) => (visible.has(f.id) ? textOf(reg.output(r, f)) : ""));
  });
}

/** GET /registry/tables/:t/export.csv */
export async function exportCsv(tableRef: string | number, query: Query) {
  const { reg, table, viewer } = await open(tableRef);
  needReadable(reg, table, viewer);
  const { s, all } = matching(reg, table, viewer, query);
  return { name: table.name, csv: `﻿${toCsv([s.shown.map((f) => f.name), ...rows(reg, table, viewer, s.shown, all)])}` };
}

/** GET /registry/tables/:t/export.json: every record found, as the list gives them (without paging). */
export async function exportJson(tableRef: string | number, query: Query) {
  const { reg, table, viewer } = await open(tableRef);
  needReadable(reg, table, viewer);
  const { s, all } = matching(reg, table, viewer, query);
  return { name: table.name, records: all.map((r) => out(reg, table, r, viewer, s.shown, query.fieldKey === "id")) };
}

const icsText = (text: string) => text.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
const icsDay = (day: string) => day.replaceAll("-", "");
const icsMoment = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** One event of the calendar: a whole day (or days) for dates, a span of time for moments. */
function icsEvent(reg: Registry, table: Table, record: RecordRow, start: Field, end: Field | undefined, base: string): string[] {
  const from = textOf(reg.value(record, start)).slice(0, 25);
  if (!/^\d{4}-\d{2}-\d{2}/.test(from)) return [];
  const to = end ? textOf(reg.value(record, end)).slice(0, 25) : "";
  const allDay = from.length === 10;
  const lines = ["BEGIN:VEVENT", `UID:registry-${record.id}@erp`, `DTSTAMP:${icsMoment(record.updatedAt)}`, `SUMMARY:${icsText(reg.display(record.id))}`];
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDay(from)}`);
    // the end of a day-long event is the day after its last one
    lines.push(`DTEND;VALUE=DATE:${icsDay(nextDay(/^\d{4}-\d{2}-\d{2}/.test(to) && to.slice(0, 10) >= from ? to.slice(0, 10) : from))}`);
  } else {
    lines.push(`DTSTART:${icsMoment(from)}`);
    if (/^\d{4}-\d{2}-\d{2}T/.test(to) && to >= from) lines.push(`DTEND:${icsMoment(to)}`);
  }
  lines.push(`URL:${base}/registry/${encodeURIComponent(table.name)}?record=${record.id}`, "END:VEVENT");
  return lines;
}

/** GET /registry/tables/:t/export.ics?view=: the records of a calendar or timeline view, as events. */
export async function exportIcs(tableRef: string | number, query: Query, base: string) {
  const { reg, table, viewer } = await open(tableRef);
  needReadable(reg, table, viewer);
  const { s, all } = matching(reg, table, viewer, query);
  const config = s.view?.config;
  if (!config?.dateField) throw invalid("Choose a calendar or a timeline view: its date makes the events");
  const visible = new Set(select(reg, table, viewer, {}).searchFields.map((f) => f.id));
  const start = reg.field(config.dateField);
  const end = config.endDateField !== undefined ? reg.field(config.endDateField) : undefined;
  if (!start || !visible.has(start.id)) throw invalid("You cannot see the date of this view");
  const events = all.flatMap((r) => icsEvent(reg, table, r, start, end && visible.has(end.id) ? end : undefined, base));
  const calendar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ERP//Registry//EN", `X-WR-CALNAME:${icsText(`${table.name} – ${s.view!.name}`)}`, ...events, "END:VCALENDAR"];
  return { name: `${table.name} - ${s.view!.name}`, ics: `${calendar.join("\r\n")}\r\n` };
}


