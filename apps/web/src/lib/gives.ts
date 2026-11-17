import type { Fund, FundType } from "../api/types";

// What a sponsor gives, as the person chooses it in CASH FROM: the three kinds of sponsor and, among them, a fund with
// no limit (which the server keeps as a fund that is `unlimited`). docs/sponsor-e-fondi.md, §10

export type Gives = FundType | "unlimited";

/** What the sponsor `fund` gives. */
export const givesOf = (fund: Pick<Fund, "type" | "unlimited">): Gives => (fund.unlimited ? "unlimited" : fund.type);

/** What the server is told for a choice. */
export function givesBody(gives: Gives): { type: FundType; unlimited: boolean } {
  return gives === "unlimited" ? { type: "fund", unlimited: true } : { type: gives, unlimited: false };
}

/** Only a fund is a sum of money, with a contract: goods are not, and a fund with no limit has no sum behind it. */
export const hasMoney = (gives: Gives): boolean => gives === "fund";
