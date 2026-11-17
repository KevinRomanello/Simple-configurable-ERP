import type { Phase } from "../api/types";

// What each column of the budget grid says when the pointer rests on its heading. The words follow the team's guide to the
// budget (docs.eagletrt.it, "Budget"); the columns the old sheet did not have (CAR, GROSS UNIT COST, ALSO FROM, VAT %, ARRIVED
// and the icons) are described from how the site works. docs/come-funziona.md

/** One text for both blocks, or one for EXPECTED and one for ACTUAL when the words change. */
type Help = string | Record<Phase, string>;

/** By column: the id of a column of a block is the part after "estimate." or "actual.". */
const HELP: Record<string, Help> = {
  status:
    "What the line still needs. Triangle: CASH FROM or VAT % is missing, or more has arrived than was bought. Coins: the funds cannot cover the line. Hourglass: ordered, not everything has arrived yet. Check: everything has arrived. Rest on an icon to read it.",
  item: "The name of the item.",
  category:
    "What the cost is for.\nComponents: everything that goes in the car.\nManufacturing: all the processes involved in producing the finished machine.\nConsumable: consumables (sheets of paper, felt-tip pens…).\nAsset: physical items that last (servers, screwdrivers…).\nLogistic: transport for trade fairs and tests, and reimbursements for private transport.\nAdministration: association fees, VAT…\nSoftware: software licences.",
  priority:
    "How much the item matters.\nHigh: all the necessary that makes the car move.\nMedium: all the necessary that improves the performance of the car and increases the score of the team in the competitions (design phase included).\nLow: everything else.",
  car: "The car the item is bought for: the car of this season (in grey) unless another one is chosen (highlighted).",
  note: "A free note on the line, for example the unit the item is measured in.",
  EXPECTED: "The estimate made at the start of the season, to compare with ACTUAL.",
  ACTUAL: "The real figures, filled in as the purchases are made.",
  quantity: { estimate: "How many pieces you plan to buy.", actual: "How many pieces were really bought." },
  unitNetCost:
    "The price of one piece, VAT excluded. If you only know the total, enter quantity 1 and the total cost, and write the detail in NOTE (for example that the item is measured in kg). The price is typed here or in GROSS UNIT COST: the other one is worked out from it.",
  unitGrossCost:
    "The price of one piece, VAT included. The price is typed here or in NET UNIT COST: the other one is worked out from it. With a partial sponsor type the net price.",
  net: "Quantity × net unit cost: the cost without VAT. Calculated.",
  vat: "The VAT on the net cost, from the VAT % of the line or the rate of the fund. In the subtotal and total rows it is only the VAT the team pays out of its own money. Calculated.",
  fund: "The fund the money is taken from: the team's own money, or the virtual wallet of a sponsor. Rest on a cell to see what each fund pays.",
  moreFunds: "Another fund of the same group that pays what the first one cannot cover. The column is there only when a fund of the project runs short.",
  supplier: "The company the item is bought from. If it is not in the list, add it in the BOUGHT FROM page.",
  vatRate: "The VAT rate of the line. It is asked only when the team's own money pays (or no fund is chosen yet): a sponsor brings its own rate.",
  outflow: {
    estimate: "The money that is expected to leave the fund register for the item: the cost with VAT minus what a sponsor gives for free. Calculated.",
    actual: "The money that really left the fund register for the item: the cost with VAT minus what a sponsor gave for free. Calculated.",
  },
  purchaseDate: { estimate: "The day you plan to buy the item.", actual: "The day the item was bought." },
  arrivalDate: { estimate: "The day you expect the item to be delivered.", actual: "The day the item was delivered." },
  arrival: "How much of what was bought has arrived. The inventory counts it: PENDING shows what is still to come.",
};

/** The text of a column (`phase`: the block it is in, if any); none for a column that needs no words (the bin). */
export function columnHelp(id: string, phase?: Phase): string | undefined {
  const help = HELP[id];
  if (help === undefined) return undefined;
  return typeof help === "string" ? help : phase && help[phase];
}
