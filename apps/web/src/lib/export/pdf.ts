import { chartPicture } from "./chart";
import { place, type Cell, type Table } from "./table";
import type { Resolved } from "./types";

/** The standard PDF fonts know Latin letters and the euro sign: other characters become a safe look-alike. */
const pdfText = (text: string) =>
  text
    .replace(/\u00a0/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\n -ÿ€]/g, "?")
    .replace(/ €/g, "\u00a0€"); // the euro sign stays with its number when a column is narrow

const FILL: Record<NonNullable<Cell["fill"]>, [number, number, number]> = {
  head: [70, 70, 70],
  band: [243, 255, 23],
  total: [230, 230, 230],
};

const PX_TO_MM = 0.2646;

/** More columns than this and the page is the wide one (A3): a table is never cut in two across pages. */
const WIDE_FROM = 14;

const columnsOf = (table: Table) => Math.max(0, ...place([...table.head, ...table.body]).map((p) => p.col + (p.cell.colSpan ?? 1)));

/** A PDF of the chosen blocks: the page title, then each table (as text) or chart (as a picture) with its name. */
export async function makePdf(title: string, subtitle: string, blocks: Resolved[]): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const widest = Math.max(0, ...blocks.map((b) => (b.collected.kind === "table" ? columnsOf(b.collected.table) : 0)));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", compress: true, format: widest > WIDE_FROM ? "a3" : "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(pdfText(title), margin, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(pdfText(subtitle), margin, y + 11);
  doc.setTextColor(0);
  y += 18;

  for (const { title: heading, collected } of blocks) {
    if (y > pageHeight - 35) {
      doc.addPage();
      y = margin;
    }
    if (collected.kind === "table") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(pdfText(heading), margin, y + 4);
      y += 7;
    }

    if (collected.kind === "chart") {
      // the picture carries its own title
      const picture = await chartPicture(collected.svg, heading, collected.legend);
      const available = pageHeight - 2 * margin;
      let width = Math.min(pageWidth - 2 * margin, picture.width * PX_TO_MM);
      let height = (width * picture.height) / picture.width;
      if (y + height > pageHeight - margin) {
        doc.addPage();
        y = margin;
        if (height > available) {
          height = available;
          width = (height * picture.width) / picture.height;
        }
      }
      doc.addImage(picture.dataUrl, "PNG", margin, y, width, height);
      y += height + 8;
      continue;
    }

    const { table } = collected;
    const columns = columnsOf(table);
    const input = (cell: Cell) => ({
      content: pdfText(cell.text),
      colSpan: cell.colSpan,
      rowSpan: cell.rowSpan,
      styles: {
        halign: cell.align === "right" ? ("right" as const) : ("left" as const),
        fontStyle: cell.bold ? ("bold" as const) : ("normal" as const),
        ...(cell.fill ? { fillColor: FILL[cell.fill], textColor: cell.fill === "head" ? 255 : 20 } : {}),
      },
    });
    autoTable(doc, {
      startY: y,
      head: table.head.map((row) => row.map(input)),
      body: table.body.map((row) => row.map(input)),
      theme: "grid",
      styles: { fontSize: columns > 24 ? 6.5 : columns > WIDE_FROM ? 7.5 : columns > 8 ? 8 : 9, cellPadding: 1, lineColor: [190, 190, 190], lineWidth: 0.1, textColor: 20, overflow: "linebreak" },
      margin: { left: margin, right: margin, top: margin, bottom: margin },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
  }

  const pages = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.text(`${page} / ${pages}`, pageWidth - margin, pageHeight - 4, { align: "right" });
  }
  return doc.output("blob");
}
