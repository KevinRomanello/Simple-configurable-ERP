import { makeCell, type Table } from "./table";

// A chart of the page (Recharts draws it as an SVG) becomes a picture. The picture is made apart
// from the page, so every colour and font the SVG takes from the page's CSS is written into it first.

export interface Legend {
  label: string;
  color: string;
}

const STYLE_PROPERTIES = [
  "fill", "stroke", "stroke-width", "stroke-dasharray", "fill-opacity", "stroke-opacity", "opacity",
  "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline",
];

// A downloaded chart is for paper and for documents: white, with dark text, whatever the site looks like.
const PAPER = "#ffffff";
const INK = "#1f1f1f";
const GRID = "#dddddd";
const AXIS = "#888888";

/** Copies the computed look of every element of `from` onto the same element of `to`. */
function inlineStyles(from: Element, to: Element) {
  const style = getComputedStyle(from);
  const target = to as SVGElement;
  for (const property of STYLE_PROPERTIES) target.style.setProperty(property, style.getPropertyValue(property));
  [...from.children].forEach((child, i) => to.children[i] && inlineStyles(child, to.children[i]!));
}

/** A CSS colour or a `var(--token)` as a plain colour. */
export function plainColour(value: string): string {
  const token = /^var\((--[\w-]+)\)$/.exec(value.trim());
  return token ? getComputedStyle(document.documentElement).getPropertyValue(token[1]!).trim() || "#888" : value;
}

export interface ChartPicture {
  dataUrl: string;
  /** In points, at the size it was drawn (twice as many pixels). */
  width: number;
  height: number;
}

/** The chart, its title and its legend as one PNG. */
export async function chartPicture(svg: SVGSVGElement, title: string, legend: Legend[]): Promise<ChartPicture> {
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  for (const el of clone.querySelectorAll<SVGElement>("text, tspan")) el.style.setProperty("fill", INK);
  for (const el of clone.querySelectorAll<SVGElement>(".recharts-cartesian-grid line")) el.style.setProperty("stroke", GRID);
  for (const el of clone.querySelectorAll<SVGElement>(".recharts-cartesian-axis-line, .recharts-cartesian-axis-tick-line")) el.style.setProperty("stroke", AXIS);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const image = new Image();
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The chart could not be drawn"));
    image.src = url;
  });

  const scale = 2;
  const top = 28;
  const lineHeight = 20;
  const legendFont = "12px sans-serif";

  // the legend goes on to the next line when the chart is too narrow for it
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = legendFont;
  const places: { item: Legend; x: number; line: number }[] = [];
  let x = 8;
  let line = 0;
  for (const item of legend) {
    const size = 15 + measure.measureText(item.label).width + 18;
    if (x > 8 && x + size > width) {
      x = 8;
      line += 1;
    }
    places.push({ item, x, line });
    x += size;
  }
  const bottom = legend.length > 0 ? 12 + (line + 1) * lineHeight : 6;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil((height + top + bottom) * scale);
  const context = canvas.getContext("2d")!;
  context.scale(scale, scale);
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height + top + bottom);
  context.fillStyle = INK;
  context.font = "bold 13px sans-serif";
  context.fillText(title, 8, 19);
  context.drawImage(image, 0, top, width, height);
  URL.revokeObjectURL(url);

  context.font = legendFont;
  for (const { item, x: left, line: row } of places) {
    const y = top + height + 8 + row * lineHeight;
    context.fillStyle = plainColour(item.color);
    context.fillRect(left, y, 10, 10);
    context.fillStyle = INK;
    context.fillText(item.label, left + 15, y + 9);
  }
  return { dataUrl: canvas.toDataURL("image/png"), width, height: height + top + bottom };
}

/** The numbers behind a chart (in euros), for the Excel file: the first column names each bar. */
export function chartTable(firstColumn: string, series: string[], rows: { name: string; values: number[] }[]): Table {
  return {
    head: [[makeCell(firstColumn, { bold: true, fill: "head" }), ...series.map((s) => makeCell(s, { bold: true, fill: "head", align: "right" }))]],
    body: rows.map((row) => [
      makeCell(row.name),
      ...row.values.map((v) => ({ text: String(v).replace(".", ","), value: v, format: '#,##0.00 "€"', align: "right" as const })),
    ]),
  };
}
