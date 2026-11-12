import type { StatementIssue } from "../api/types";
import { money } from "./format";

// What the "Things to check" box of FINANCIAL STATEMENT says about each thing the API found. docs/registro-di-cassa.md

export interface IssueText {
  title: string;
  /** What the rule or the problem is, whatever the year. */
  what: string;
  /** What it does to the money of the year shown. */
  now: string;
}

const movements = (count: number) => `${count} movement${count === 1 ? "" : "s"}`;

export function issueText({ kind, label, count, cents }: StatementIssue): IssueText {
  const sum = `${movements(count)}, ${money(cents)}`;
  switch (kind) {
    case "noVoce":
      return {
        title: "Movements with no Voce",
        what: "A movement with no Voce is in no row of the statement, so its totals are lower than the register.",
        now: `Not counted: ${sum}. Choose a Voce for them in the CASH REGISTER.`,
      };
    case "unknownVoce":
      return {
        title: `Voce “${label}”`,
        what: "The register has this Voce, but the statement has no row for it, so it is counted nowhere.",
        now: `Not counted: ${sum}. Give them a Voce of the statement, or ask an admin for a row.`,
      };
    case "paypalLeftOut":
      return {
        title: label,
        what: "The sheet does not count the Paypal movements of this row, only Cassa and Banca.",
        now: `Left out: ${sum}.`,
      };
    case "outsideTotals":
      return {
        title: label,
        what: "No sum adds up this row: the sheet leaves it out of its section and of the total.",
        now: `Missing from the totals: ${sum}.`,
      };
    case "sectionInSection":
      return {
        title: label,
        what: "This section is counted inside the one above it, not as a section of the total. Adding the numbered sections by hand counts it twice.",
        now: `Inside the section above: ${sum}.`,
      };
    case "wrongSign":
      return {
        title: label,
        what: "A revenue below zero or a cost above zero (a refund, a mistake). The column without sign shows it as a normal amount.",
        now: `It is ${money(cents)}, in ${movements(count)}.`,
      };
  }
}
