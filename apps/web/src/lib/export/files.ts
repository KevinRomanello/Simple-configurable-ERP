/** Excel keeps this name for itself. */
const RESERVED = "history";

/** A name for a sheet of an Excel file: at most 31 characters, none of `: \ / ? * [ ]`, no apostrophe at either end, not "History", and not used before. */
export function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").slice(0, 31) || "Sheet";
  const taken = (name: string) => used.has(name.toLowerCase()) || name.toLowerCase() === RESERVED;
  let name = base;
  for (let n = 2; taken(name); n += 1) {
    const suffix = ` (${n})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

/** "EXPECTED GANTT", 2026-10-23 -> "expected-gantt-2026-10-23". */
export function fileBase(title: string, day: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "export"}-${day}`;
}

/** Hands a file to the browser as a download. */
export function saveFile(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
