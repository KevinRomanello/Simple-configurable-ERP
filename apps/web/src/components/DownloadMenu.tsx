import { faChartColumn, faDownload, faTable } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";
import { fileBase, saveFile } from "../lib/export/files";
import { todayIso } from "../lib/today";
import { Button } from "./Button";
import { useExportBlocks } from "./ExportBlocks";
import { useNotify } from "./Notice";

type Format = "pdf" | "xlsx";

/**
 * The Download button of a page header: lists the tables and charts of the page, lets the person
 * choose which go into the file and whether it is a PDF or an Excel file, and makes the file here
 * in the browser (the libraries are loaded only when a file is asked for).
 */
export function DownloadMenu() {
  const blocks = useExportBlocks();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState<Set<string>>(new Set()); // what was unticked: whatever is new on the page counts as ticked
  const [format, setFormat] = useState<Format>("pdf");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (blocks.length === 0) return null;
  const ordered = [...blocks].sort((a, b) => {
    const x = a.element();
    const y = b.element();
    return x && y ? (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1) : 0;
  });
  const chosen = ordered.filter((b) => !left.has(b.id));
  const toggle = (id: string) =>
    setLeft((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const download = async () => {
    setBusy(true);
    try {
      const resolved = chosen.flatMap((block) => {
        const collected = block.collect();
        return collected ? [{ title: block.title, collected }] : [];
      });
      const title = document.querySelector("main h1")?.textContent?.trim() || "Export";
      const day = todayIso();
      const blob =
        format === "pdf"
          ? await (await import("../lib/export/pdf")).makePdf(title, `E-Agle TRT, ${day}`, resolved)
          : await (await import("../lib/export/xlsx")).makeXlsx(title, resolved);
      saveFile(blob, `${fileBase(title, day)}.${format}`);
      setOpen(false);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "The file could not be made");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="download" ref={root}>
      <Button variant="ghost" icon={faDownload} aria-expanded={open} onClick={() => setOpen(!open)}>
        Download
      </Button>
      {open && (
        <div className="download-panel" role="dialog" aria-label="Download">
          <strong>What goes in the file</strong>
          <ul>
            {ordered.map((block) => (
              <li key={block.id}>
                <label className="checkbox">
                  <input type="checkbox" checked={!left.has(block.id)} onChange={() => toggle(block.id)} />
                  <FontAwesomeIcon icon={block.kind === "chart" ? faChartColumn : faTable} fixedWidth className="faint" />
                  {block.title}
                </label>
              </li>
            ))}
          </ul>
          <div className="download-formats" role="radiogroup" aria-label="Format">
            <label className="checkbox">
              <input type="radio" name="download-format" checked={format === "pdf"} onChange={() => setFormat("pdf")} />
              PDF
            </label>
            <label className="checkbox">
              <input type="radio" name="download-format" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
              Excel
            </label>
          </div>
          <Button small disabled={busy || chosen.length === 0} onClick={download}>
            {busy ? "Preparing…" : `Download ${format === "pdf" ? "PDF" : "Excel"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
