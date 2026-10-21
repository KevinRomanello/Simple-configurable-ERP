import { roundDiv } from "@erp/calc";
import { asc, eq, like, sql } from "drizzle-orm";
import { fromScaled } from "../core/money";
import { placeholderPng, type Shape } from "./demo-image";
import { ownerDb, ownerPool } from "./owner";
import { area, componentPart, inventoryItem, itemImage, project, stockMovement } from "./schema";

// Made-up inventory, only to have something to look at and try. Nothing here is real: names,
// prices and places are invented. Every item has a code starting with DEMO-, which is how
// `--remove` finds them. It is written without the history (the session turns the audit triggers
// off) so that the History page is not filled with things nobody did.
//
//   pnpm db:seed-demo             add it (does nothing if it is already there)
//   pnpm db:seed-demo -- --remove take it away again

const remove = process.argv.includes("--remove");

type Receipt = { on: string; qty: number; net: number; at: string; spot?: string; for?: string; free?: boolean };
type Use = { on: string; qty: number; at: string; spot?: string; for?: string; note?: string };
interface Demo {
  code: string;
  name: string;
  category: string;
  unit: string;
  purpose: string;
  color: [number, number, number];
  shape: Shape;
  picture?: boolean;
  safetyCodes?: string;
  disposal?: string;
  storageNotes?: string;
  maintenanceNotes?: string;
  receipts: Receipt[];
  uses?: Use[];
}

const BOUGHT: Demo[] = [
  {
    code: "DEMO-001", name: "M3 x 10 socket screw A2", category: "Components", unit: "pcs", color: [70, 90, 120], shape: "circle",
    purpose: "Fastens the 3D-printed and aluminium brackets.", storageNotes: "Plastic drawer, box labelled M3.",
    receipts: [
      { on: "2026-06-10", qty: 200, net: 0.062, at: "s1-r1", spot: "Drawer 4, box M3", for: "sw" },
      { on: "2026-09-05", qty: 300, net: 0.071, at: "s1-r1", spot: "Drawer 4, box M3", for: "sw" },
      { on: "2026-10-12", qty: 200, net: 0.068, at: "s1-r1", spot: "Drawer 4, box M3" },
    ],
    uses: [{ on: "2026-09-20", qty: 120, at: "s1-r1", spot: "Drawer 4, box M3", for: "sw" }, { on: "2026-10-15", qty: 60, at: "s1-r1", spot: "Drawer 4, box M3", for: "hw" }],
  },
  {
    code: "DEMO-002", name: "M5 nylon lock nut", category: "Components", unit: "pcs", color: [110, 110, 130], shape: "ring",
    purpose: "Self-locking nut for the pedal box and the steering rack.", storageNotes: "Plastic drawer, box labelled M5.",
    receipts: [
      { on: "2026-06-10", qty: 100, net: 0.09, at: "s1-r1", spot: "Drawer 4, box M5" },
      { on: "2026-09-05", qty: 100, net: 0.085, at: "s1-r1", spot: "Drawer 4, box M5" },
    ],
  },
  {
    code: "DEMO-003", name: "Aluminium 6082 plate 200 x 100 x 5", category: "Manufacturing", unit: "pcs", color: [150, 160, 170], shape: "square",
    purpose: "Raw material for brackets and mounts.", storageNotes: "Flat on the rack, interleaved with paper.",
    receipts: [
      { on: "2026-06-20", qty: 20, net: 6.5, at: "s1-r2", spot: "Rack B", for: "mt-dmt" },
      { on: "2026-09-18", qty: 20, net: 7.2, at: "s1-r2", spot: "Rack B", for: "mt-dmt" },
    ],
    uses: [{ on: "2026-10-02", qty: 6, at: "s1-r2", spot: "Rack B", for: "mt-dmt", note: "Pedal brackets, first batch" }],
  },
  {
    code: "DEMO-004", name: "Epoxy resin L285", category: "Manufacturing", unit: "kg", color: [200, 160, 60], shape: "circle",
    purpose: "Matrix for carbon fibre layups.",
    safetyCodes: "H315, H317, H319, H412 | P280, P302+P352, P305+P351+P338",
    disposal: "Cured resin is non-hazardous. Liquid residue goes to the hazardous waste collection; never down the drain.",
    storageNotes: "Chemicals cabinet, shelf 2. 5-25 C, closed container, away from heat and sunlight. Shelf life 24 months.",
    receipts: [
      { on: "2026-07-02", qty: 4, net: 38, at: "s2-r1", spot: "Chemicals cabinet, shelf 2", for: "mt-dmt" },
      { on: "2026-10-01", qty: 4, net: 41.5, at: "s2-r1", spot: "Chemicals cabinet, shelf 2", for: "mt-dmt" },
    ],
    uses: [{ on: "2026-08-15", qty: 1.5, at: "s2-r1", spot: "Chemicals cabinet, shelf 2", for: "mt-dmt", note: "Monocoque test panel" }],
  },
  {
    code: "DEMO-005", name: "Epoxy hardener H285", category: "Manufacturing", unit: "kg", color: [190, 120, 60], shape: "ring",
    purpose: "Hardener for the L285 resin (mix ratio 100:40 by weight).",
    safetyCodes: "H302, H312, H314, H317, H412 | P260, P280, P303+P361+P353, P305+P351+P338",
    disposal: "Corrosive: never mix with other waste. Hazardous waste collection, in its original bottle.",
    storageNotes: "Chemicals cabinet, shelf 2, next to the resin. Keep the cap tight.",
    receipts: [
      { on: "2026-07-02", qty: 2, net: 33, at: "s2-r1", spot: "Chemicals cabinet, shelf 2", for: "mt-dmt" },
      { on: "2026-10-01", qty: 2, net: 35, at: "s2-r1", spot: "Chemicals cabinet, shelf 2", for: "mt-dmt" },
    ],
    uses: [{ on: "2026-08-15", qty: 0.6, at: "s2-r1", spot: "Chemicals cabinet, shelf 2", for: "mt-dmt" }],
  },
  {
    code: "DEMO-006", name: "Isopropyl alcohol 99 %", category: "Consumable", unit: "l", color: [90, 160, 190], shape: "bars",
    purpose: "Degreasing before bonding and painting.",
    safetyCodes: "H225, H319, H336 | P210, P233, P305+P351+P338",
    disposal: "Collect in the labelled solvent can and hand it to the university chemical waste service.",
    storageNotes: "Flammables cabinet, below 25 C, away from any ignition source. Maximum 5 l in the room.",
    receipts: [{ on: "2026-08-20", qty: 5, net: 9.8, at: "s2-r1", spot: "Flammables cabinet" }],
    uses: [{ on: "2026-09-25", qty: 1.2, at: "s2-r1", spot: "Flammables cabinet", for: "cm" }],
  },
  {
    code: "DEMO-007", name: "LiPo battery 4S 5000 mAh", category: "Consumable", unit: "pcs", color: [200, 70, 70], shape: "square",
    purpose: "Powers the test bench and the data logger.",
    safetyCodes: "UN3480 (class 9) | do not short-circuit, do not charge unattended",
    disposal: "Never in household waste. Discharge to the storage level and take it to the battery collection point.",
    storageNotes: "Fireproof LiPo bag, 3.8 V per cell, 10-25 C. Check for swelling before every use.",
    receipts: [{ on: "2026-09-12", qty: 4, net: 46.9, at: "s1-r3", spot: "Fireproof cabinet", for: "hw" }],
  },
  {
    code: "DEMO-008", name: "Copper cable 2.5 mm2 red", category: "Components", unit: "m", color: [180, 60, 50], shape: "bars",
    purpose: "Power wiring of the low-voltage system.", storageNotes: "On its reel, hung on the wall.",
    receipts: [
      { on: "2026-06-15", qty: 50, net: 0.9, at: "s1-r3", spot: "Wall reels", for: "hw" },
      { on: "2026-09-20", qty: 100, net: 1.15, at: "s1-r3", spot: "Wall reels", for: "hw" },
    ],
    uses: [{ on: "2026-10-05", qty: 18.5, at: "s1-r3", spot: "Wall reels", for: "hw" }],
  },
  {
    code: "DEMO-009", name: "Torque wrench 5-60 Nm", category: "Asset", unit: "pcs", color: [60, 70, 90], shape: "diamond",
    purpose: "Tightening of the suspension and brake fasteners.",
    maintenanceNotes: "Recalibrate every 12 months (due July 2027). Always store at the lowest setting.",
    storageNotes: "In its case, on the tool wall.",
    receipts: [{ on: "2026-07-10", qty: 1, net: 89.9, at: "s1-r3", spot: "Tool wall" }],
  },
  {
    code: "DEMO-010", name: "Digital multimeter", category: "Asset", unit: "pcs", color: [230, 190, 40], shape: "square",
    purpose: "Electrical checks on the car and on the bench.",
    maintenanceNotes: "Replace the 9 V battery when the display dims; check the probes for cracks.",
    storageNotes: "Electronics drawer.",
    receipts: [{ on: "2026-07-10", qty: 2, net: 54, at: "s1-r3", spot: "Electronics drawer" }],
  },
  {
    code: "DEMO-011", name: "Cyanoacrylate glue 20 g", category: "Consumable", unit: "pcs", color: [140, 120, 200], shape: "diamond", picture: false,
    purpose: "Quick fixing of cables and small parts.",
    safetyCodes: "H315, H319, H335 | P261, P305+P351+P338",
    disposal: "Let the residue cure, then general waste.",
    storageNotes: "Fridge in room 2 extends the shelf life.",
    receipts: [{ on: "2026-08-02", qty: 12, net: 3.2, at: "s1-r2", spot: "Glue shelf" }],
    uses: [{ on: "2026-10-08", qty: 3, at: "s1-r2", spot: "Glue shelf", for: "cm" }],
  },
  {
    code: "DEMO-012", name: "Cable ties 200 mm", category: "Components", unit: "pcs", color: [100, 100, 100], shape: "bars", picture: false,
    purpose: "Harness routing.", storageNotes: "Drawer 5.",
    receipts: [{ on: "2026-06-15", qty: 500, net: 0.012, at: "s1-r3", spot: "Drawer 5" }],
  },
  {
    code: "DEMO-013", name: "Safety glasses", category: "Logistic", unit: "pcs", color: [90, 190, 150], shape: "ring",
    purpose: "Mandatory in the workshop.", storageNotes: "Hook by the workshop door.",
    receipts: [{ on: "2026-06-01", qty: 10, net: 4.5, at: "s1-r2", spot: "By the door", free: true }],
  },
  {
    code: "DEMO-014", name: "2-pin sealed connector", category: "Components", unit: "pcs", color: [70, 120, 90], shape: "circle",
    purpose: "Waterproof connection of sensors to the harness.",
    receipts: [{ on: "2026-09-22", qty: 40, net: 0.85, at: "s1-r3", spot: "Electronics drawer", for: "hw" }],
  },
];

interface DemoMade {
  code: string;
  name: string;
  purpose: string;
  color: [number, number, number];
  shape: Shape;
  /** [code of the part, quantity] */
  parts: [string, number][];
  /** How many are on the shelf, and where. */
  counted?: { qty: number; at: string; spot: string };
}

const MADE: DemoMade[] = [
  {
    code: "DEMO-020", name: "Pedal bracket", purpose: "Mounts the brake pedal to the chassis.", color: [120, 130, 150], shape: "square",
    parts: [["DEMO-003", 1], ["DEMO-001", 6]], counted: { qty: 4, at: "s1-r2", spot: "Shelf 1, made parts" },
  },
  {
    code: "DEMO-021", name: "Brake pedal assembly", purpose: "The complete pedal: bracket, pivot hardware and plates.", color: [170, 90, 90], shape: "diamond",
    parts: [["DEMO-020", 1], ["DEMO-001", 4], ["DEMO-003", 2], ["DEMO-002", 2]],
  },
  {
    code: "DEMO-022", name: "Dash wiring harness", purpose: "Connects the dash display, the buttons and the data logger.", color: [90, 150, 110], shape: "bars",
    parts: [["DEMO-008", 3.5], ["DEMO-012", 12], ["DEMO-014", 6]],
  },
];

async function main() {
  await ownerDb.transaction(async (tx) => {
    // not for the history: this is made-up data (needs the owner, which the tool runs as)
    await tx.execute(sql`set local session_replication_role = replica`);

    const existing = await tx.select({ id: inventoryItem.id }).from(inventoryItem).where(like(inventoryItem.code, "DEMO-%"));
    if (existing.length > 0) {
      const ids = existing.map((e) => e.id);
      await tx.delete(stockMovement).where(sql`${stockMovement.itemId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
      await tx.delete(componentPart).where(sql`${componentPart.componentId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
      await tx.delete(inventoryItem).where(like(inventoryItem.code, "DEMO-%"));
    }
    if (remove) {
      console.log(`Removed ${existing.length} demonstration items.`);
      return;
    }

    // a project of each area, if there is one, to attach purchases and uses to
    const firstProject = new Map<string, number>();
    for (const row of await tx.select({ code: area.code, id: project.id }).from(project).innerJoin(area, eq(project.areaId, area.id)).orderBy(asc(project.position))) {
      if (!firstProject.has(row.code)) firstProject.set(row.code, row.id);
    }
    const projectOf = (areaCode?: string) => (areaCode ? (firstProject.get(areaCode) ?? null) : null);
    const e4 = (euros: number) => Math.round(euros * 10_000);
    const milli = (qty: number) => Math.round(qty * 1000);

    const ids = new Map<string, number>();
    const makeItem = async (d: { code: string; name: string; purpose: string; category?: string; unit?: string; origin?: "bought" | "made" } & Partial<Demo>) => {
      const [row] = await tx
        .insert(inventoryItem)
        .values({
          code: d.code, name: d.name, purpose: d.purpose, category: d.category ?? (d.origin === "made" ? "Components" : null), unit: d.unit ?? "pcs",
          origin: d.origin ?? "bought", safetyCodes: d.safetyCodes ?? null, disposal: d.disposal ?? null,
          storageNotes: d.storageNotes ?? null, maintenanceNotes: d.maintenanceNotes ?? null,
        })
        .returning({ id: inventoryItem.id });
      ids.set(d.code, row!.id);
      return row!.id;
    };
    const picture = async (itemId: number, color: [number, number, number], shape: Shape) => {
      await tx.insert(itemImage).values({ itemId, mime: "image/png", full: placeholderPng(480, color, shape), thumb: placeholderPng(96, color, shape) });
      await tx.update(inventoryItem).set({ imageUpdatedAt: sql`now()` }).where(eq(inventoryItem.id, itemId));
    };

    for (const d of BOUGHT) {
      const itemId = await makeItem(d);
      if (d.picture !== false) await picture(itemId, d.color, d.shape);
      for (const r of d.receipts) {
        const net = e4(r.net);
        const gross = roundDiv(net * 12_200, 10_000); // 22 % VAT
        await tx.insert(stockMovement).values({
          itemId, kind: "receipt", occurredOn: r.on, quantity: fromScaled(milli(r.qty), 3), location: r.at, spot: r.spot ?? "",
          unitNet: fromScaled(net, 4), unitGross: fromScaled(gross, 4), unitTeam: fromScaled(r.free ? 0 : gross, 4), projectId: projectOf(r.for),
          note: r.free ? "Donated by a sponsor" : null,
        });
      }
      for (const u of d.uses ?? []) {
        await tx.insert(stockMovement).values({
          itemId, kind: "use", occurredOn: u.on, quantity: fromScaled(milli(u.qty), 3), location: u.at, spot: u.spot ?? "", projectId: projectOf(u.for), note: u.note ?? null,
        });
      }
    }

    // a few other things that happen on a shelf: a move, a count, a disposal
    const screw = ids.get("DEMO-001")!;
    await tx.insert(stockMovement).values({ itemId: screw, kind: "transfer", occurredOn: "2026-10-16", quantity: fromScaled(milli(100), 3), location: "s1-r1", spot: "Drawer 4, box M3", toLocation: "s2-r1", toSpot: "Workshop box", note: "For the second site" });
    await tx.insert(stockMovement).values({ itemId: ids.get("DEMO-002")!, kind: "adjustment", occurredOn: "2026-10-17", quantity: fromScaled(milli(-3), 3), location: "s1-r1", spot: "Drawer 4, box M5", note: "Count: three missing" });
    await tx.insert(stockMovement).values({ itemId: ids.get("DEMO-006")!, kind: "disposal", occurredOn: "2026-10-18", quantity: fromScaled(milli(0.5), 3), location: "s2-r1", spot: "Flammables cabinet", note: "Opened bottle, expired" });

    for (const m of MADE) {
      const itemId = await makeItem({ ...m, origin: "made" });
      await picture(itemId, m.color, m.shape);
      if (m.counted) {
        await tx.insert(stockMovement).values({ itemId, kind: "adjustment", occurredOn: "2026-10-14", quantity: fromScaled(milli(m.counted.qty), 3), location: m.counted.at, spot: m.counted.spot, note: "Counted when the inventory was started" });
      }
    }
    for (const m of MADE) {
      for (const [partCode, qty] of m.parts) {
        await tx.insert(componentPart).values({ componentId: ids.get(m.code)!, partId: ids.get(partCode)!, quantity: fromScaled(milli(qty), 3) });
      }
    }
    console.log(`Added ${BOUGHT.length} bought items and ${MADE.length} made ones (prefix DEMO-). Take them away with: pnpm db:seed-demo -- --remove`);
  });
  await ownerPool.end();
}

await main();
