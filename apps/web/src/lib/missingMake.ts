/** The make and the model of what is bought must be written on every line of the budget: the names of the ones that are not (empty = nothing). */
export function missingMake(line: { brand: string | null; model: string | null }): ("BRAND" | "MODEL")[] {
  return [...(line.brand ? [] : (["BRAND"] as const)), ...(line.model ? [] : (["MODEL"] as const))];
}

/** What the flag of a line without them says: which ones are missing. */
export function missingMakeText(missing: ("BRAND" | "MODEL")[]): string {
  return `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing: write the make and the model of what was bought`;
}
