import { useEffect, useRef, useState } from "react";

// The QR codes and the barcodes of the registry (docs/anagrafiche.md, §4): the text of a field, drawn here.
// The libraries (qrcode-generator, JsBarcode: the ones NocoDB uses for the same fields) load only when a code
// is on the page.

/** A QR code as squares of an SVG: it grows with the page and prints sharp. */
export function QrCode({ text, size = 96 }: { text: string; size?: number }) {
  const [cells, setCells] = useState<boolean[][] | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      if (live) setCells(Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c))));
    });
    return () => {
      live = false;
    };
  }, [text]);
  if (!cells) return <span className="muted">…</span>;
  const n = cells.length;
  // one path for all the dark squares, with a quiet zone of two around
  const d = cells.flatMap((row, r) => row.flatMap((dark, c) => (dark ? [`M${c + 2},${r + 2}h1v1h-1z`] : []))).join("");
  return (
    <svg className="code-picture" viewBox={`0 0 ${n + 4} ${n + 4}`} width={size} height={size} role="img" aria-label={`QR code: ${text}`}>
      <rect width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** A barcode in the format of its field; a text the format cannot hold (letters in an EAN-13) is said so. */
export function Barcode({ text, format = "CODE128", height = 48 }: { text: string; format?: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let live = true;
    void import("jsbarcode").then(({ default: JsBarcode }) => {
      if (!live || !ref.current) return;
      try {
        JsBarcode(ref.current, text, { format, height, width: 1.6, margin: 4, fontSize: 12, background: "#fff", lineColor: "#000" });
        setBad(false);
      } catch {
        setBad(true);
      }
    });
    return () => {
      live = false;
    };
  }, [text, format, height]);
  return (
    <span className="code-picture">
      <svg ref={ref} role="img" aria-label={`Barcode: ${text}`} style={bad ? { display: "none" } : undefined} />
      {bad && <span className="hint error">{text}: not a valid {format}</span>}
    </span>
  );
}
