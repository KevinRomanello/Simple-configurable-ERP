import type { Figures, FundInput, Lookups, Phase, Snapshot, SponsorType } from "@erp/calc";
import type { RawFigures, RawInputs } from "./read-inputs";

export interface Converted {
  snapshot: Snapshot;
  warnings: string[];
}

/** URL-safe area code, the same rule the database seed uses ("MT + DMT" -> "mt-dmt"). */
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const TEAM_FUND = "Team's fund";
const lower = (s: string) => s.toLowerCase();

/** "Partially sponsorized with VAT (22%)" -> partial, 22. */
export function parseSponsorOption(option: string): { type: SponsorType; rate: number } | null {
  const type: SponsorType | null = option.startsWith("Total")
    ? "total"
    : option.startsWith("Partially")
      ? "partial"
      : option.startsWith("No sponsorized")
        ? "none"
        : null;
  if (type === null) return null;
  const rate = /\((\d+)%\)/.exec(option);
  return { type, rate: rate ? Number(rate[1]) : 0 };
}

const cents = (euros: number) => Math.round(euros * 100);

/**
 * Turns what was read from the sheet into the calculation engine's Snapshot, in memory.
 * Funds and suppliers are matched without regard to case; the first spelling wins.
 */
export function toSnapshot(raw: RawInputs, lookups: Lookups): Converted {
  const warnings = [...raw.warnings];

  // --- funds: the team fund plus every external name found anywhere ------------------------
  const funds: FundInput[] = [
    { id: 1, name: TEAM_FUND, kind: "team", paysVat: { estimate: false, actual: false } },
  ];
  const fundId = new Map<string, number>([[lower(TEAM_FUND), 1]]);
  const fundNamed = (name: string): number => {
    const known = fundId.get(lower(name));
    if (known !== undefined) return known;
    const id = funds.length + 1;
    funds.push({ id, name, kind: "external", paysVat: { estimate: false, actual: false } });
    fundId.set(lower(name), id);
    return id;
  };
  for (const phase of ["estimate", "actual"] as const) {
    for (const row of raw.contracts[phase]) fundNamed(row.name);
    for (const name of raw.paysVat[phase].keys()) fundNamed(name);
  }

  // --- suppliers: one list ---------------------------------------------------------------
  const suppliers: Snapshot["suppliers"] = [];
  const supplierId = new Map<string, number>();
  const supplierNamed = (name: string): number => {
    const known = supplierId.get(lower(name));
    if (known !== undefined) return known;
    suppliers.push({ id: suppliers.length + 1, name });
    supplierId.set(lower(name), suppliers.length);
    return suppliers.length;
  };
  for (const name of [...raw.suppliers.estimate, ...raw.suppliers.actual]) supplierNamed(name);

  // --- areas, projects, lines ----------------------------------------------------------------
  const categories = new Map(lookups.categories.map((c) => [lower(c), c]));
  const priorities = new Map(lookups.priorities.map((p) => [lower(p), p]));

  const figuresOf = (raw: RawFigures, where: string): Figures | null => {
    const empty =
      raw.quantity === null && raw.unitCost === null && raw.sponsorOption === null &&
      raw.fund === null && raw.supplier === null && raw.purchaseDate === null && raw.arrivalDate === null;
    if (empty) return null;

    let option = null as ReturnType<typeof parseSponsorOption>;
    if (raw.sponsorOption !== null) {
      option = parseSponsorOption(raw.sponsorOption);
      if (option === null) warnings.push(`${where}: unknown sponsor option "${raw.sponsorOption}"`);
    }
    return {
      quantityMilli: Math.round((raw.quantity ?? 0) * 1000),
      unitCostE4: Math.round((raw.unitCost ?? 0) * 10_000),
      sponsorType: option?.type ?? null,
      sponsorValueCents: raw.sponsorValue === null ? null : cents(raw.sponsorValue),
      vatRate: option?.rate ?? null,
      fundId: raw.fund === null ? null : fundNamed(raw.fund),
      supplierId: raw.supplier === null ? null : supplierNamed(raw.supplier),
      purchaseDate: raw.purchaseDate,
      arrivalDate: raw.arrivalDate,
    };
  };

  const areas: Snapshot["areas"] = [];
  const projects: Snapshot["projects"] = [];
  const lines: Snapshot["lines"] = [];
  raw.areas.forEach((area, areaIndex) => {
    const areaId = areaIndex + 1;
    areas.push({ id: areaId, code: slug(area.name), name: area.name, position: areaId });
    area.projects.forEach((project, projectIndex) => {
      const id = projects.length + 1;
      projects.push({
        id,
        areaId,
        name: project.name,
        ownerName: project.ownerName,
        position: projectIndex + 1,
      });
      project.lines.forEach((line, lineIndex) => {
        const where = `${area.name} row ${line.sheetRow}`;
        let category: string | null = null;
        if (line.category !== null) {
          category = categories.get(lower(line.category)) ?? null;
          if (category === null) warnings.push(`${where}: unknown category "${line.category}"`);
        }
        let priority: string | null = null;
        if (line.priority !== null) {
          priority = priorities.get(lower(line.priority)) ?? null;
          if (priority === null) warnings.push(`${where}: unknown priority "${line.priority}"`);
        }
        lines.push({
          id: lines.length + 1,
          projectId: id,
          position: lineIndex + 1,
          item: line.item,
          category,
          priority,
          note: line.note,
          version: 1,
          figures: {
            estimate: figuresOf(line.estimate, `${where} (estimate)`),
            actual: figuresOf(line.actual, `${where} (actual)`),
          },
        });
      });
    });
  });

  // --- fund flags, contracts, inflows, bank ---------------------------------------------------
  for (const phase of ["estimate", "actual"] as Phase[]) {
    for (const [name, pays] of raw.paysVat[phase]) funds[fundNamed(name) - 1]!.paysVat[phase] = pays;
  }
  const contracts: Snapshot["contracts"] = [];
  const inflows: Snapshot["inflows"] = [];
  for (const phase of ["estimate", "actual"] as Phase[]) {
    for (const row of raw.contracts[phase]) {
      contracts.push({
        id: contracts.length + 1,
        fundId: fundNamed(row.name),
        phase,
        amountCents: cents(row.amount),
        inflowDate: row.date,
      });
    }
    for (const row of raw.inflows[phase]) {
      inflows.push({
        id: inflows.length + 1,
        phase,
        sourceName: row.name,
        amountCents: cents(row.amount),
        inflowDate: row.date,
      });
    }
  }

  return {
    snapshot: {
      lookups,
      areas,
      projects,
      lines,
      funds,
      contracts,
      inflows,
      suppliers,
      receipts: [], // the sheet knows nothing about what has physically arrived
      bank: raw.bank === null ? null : { amountCents: cents(raw.bank.amount), asOfDate: raw.bank.date },
    },
    warnings,
  };
}
