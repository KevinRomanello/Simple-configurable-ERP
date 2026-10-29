import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { useRef, useState } from "react";
import { api, datasheetUrl } from "../api/client";
import type { DatasheetRow } from "../api/types";
import { date, fileSize } from "../lib/format";
import { useAction } from "../lib/useAction";
import { IconButton } from "./Button";
import { useNotify } from "./Notice";
import { AddSection, DataTable, Field, FormPanel, Panel, type Column } from "./ui";

const MAX_BYTES = 10_000_000; // the same limit as the API (DATASHEET_LIMITS)

/** The form to add a PDF to an item, opened from the yellow «Add data sheet». */
function AddDatasheet({ itemId, onDone }: { itemId: number; onDone: () => void }) {
  const act = useAction();
  const notify = useNotify();
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");

  const choose = (chosen: File | undefined) => {
    if (chosen && chosen.size > MAX_BYTES) {
      notify("error", `The file is ${fileSize(chosen.size)}: a data sheet can be at most ${fileSize(MAX_BYTES)}`);
      if (picker.current) picker.current.value = "";
      return;
    }
    setFile(chosen ?? null);
    if (chosen && name.trim() === "") setName(chosen.name.replace(/\.pdf$/i, ""));
  };
  const submit = async () => {
    if (file && (await act(() => api.addDatasheet(itemId, file, name.trim())))) onDone();
  };

  return (
    <FormPanel title="Add a data sheet" submitLabel="Add data sheet" canSubmit={file !== null && name.trim() !== ""} onSubmit={submit} onCancel={onDone}>
      <Field label="PDF file" htmlFor="datasheet-file">
        <input id="datasheet-file" ref={picker} className="input small" type="file" accept="application/pdf" onChange={(e) => choose(e.target.files?.[0])} />
      </Field>
      <Field label="Name" htmlFor="datasheet-name">
        <input id="datasheet-name" className="input small" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
    </FormPanel>
  );
}

/**
 * The PDFs of an item. The list carries only name, size and date: each name is a plain link, so
 * the file itself is fetched only when somebody clicks it.
 */
export function Datasheets({ itemId, sheets, canEdit }: { itemId: number; sheets: DatasheetRow[]; canEdit: boolean }) {
  const act = useAction();
  const remove = (sheet: DatasheetRow) => {
    if (window.confirm(`Delete the data sheet "${sheet.name}"?`)) void act(() => api.removeDatasheet(sheet.id));
  };
  const columns: Column<DatasheetRow>[] = [
    {
      key: "name",
      header: "DATA SHEET",
      sort: (s) => s.name,
      cell: (s) => <a href={datasheetUrl(s.id)} target="_blank" rel="noopener" className="item-link">{s.name}</a>,
    },
    { key: "size", header: "SIZE", num: true, sort: (s) => s.sizeBytes, cell: (s) => fileSize(s.sizeBytes) },
    { key: "added", header: "ADDED", sort: (s) => s.uploadedAt, cell: (s) => date(s.uploadedAt.slice(0, 10)) },
    { key: "by", header: "BY", sort: (s) => s.uploadedBy, cell: (s) => s.uploadedBy ?? <span className="muted">—</span> },
    {
      key: "remove",
      header: "",
      num: true,
      cell: (s) => canEdit && <IconButton icon={faTrash} label={`Delete ${s.name}`} danger onClick={() => remove(s)} />,
    },
  ];
  if (sheets.length === 0 && !canEdit) return null;
  return (
    <Panel title="Data sheets">
      <DataTable title="Data sheets" columns={columns} rows={sheets} rowKey={(s) => s.id} empty="No data sheet yet" />
      {canEdit && <AddSection label="Add data sheet" form={(close) => <AddDatasheet itemId={itemId} onDone={close} />} />}
    </Panel>
  );
}
