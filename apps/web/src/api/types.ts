// Response shapes. The ones computed by the engine come straight from @erp/calc (type only:
// no engine code is shipped to the browser); the rest are the plain rows of the write API.
export type {
  Analysis, AreaSheet, CalcLine, CashFlowSummary, FundSummaryRow, Gantt, ItemsView, MonthlyInflow,
  Phase, PhaseCalc, Priority, SponsorType, Totals, VatReport,
} from "@erp/calc";

export interface Area {
  id: number;
  code: string;
  name: string;
  position: number;
}

export interface Fund {
  id: number;
  name: string;
  kind: "team" | "external";
  paysVatEstimate: boolean;
  paysVatActual: boolean;
}

export interface Contract {
  id: number;
  fundId: number;
  fundName: string;
  amount: string;
  inflowDate: string | null;
}

export interface Supplier {
  id: number;
  name: string;
}

export interface Inflow {
  id: number;
  phase: "estimate" | "actual";
  sourceName: string;
  amount: string;
  inflowDate: string | null;
}

export interface Bank {
  amount: string;
  asOfDate: string | null;
}

export interface Settings {
  varianceThreshold: number;
}
