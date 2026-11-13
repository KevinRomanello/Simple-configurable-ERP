import { roundDiv } from "@erp/calc";
import { and, asc, eq, inArray, like, max, sql } from "drizzle-orm";
import { fromScaled } from "../core/money";
import { placeholderPng, type Shape } from "./demo-image";
import { ownerDb, ownerPool } from "./owner";
import {
  area, category, componentPart, inventoryItem, itemDatasheet, itemDatasheetFile, itemImage, itemParamValue, itemType, itemTypeParam, project, stockMovement,
} from "./schema";

// Made-up inventory, only to have something to look at and try. Nothing here is real: names,
// prices and places are invented. Every item has a code starting with DEMO-, which is how
// `--remove` finds them. It is written without the history (the session turns the audit triggers
// off) so that the History page is not filled with things nobody did.
//
// The items have an area and, many of them, a type with its parameters (docs/inventario.md, §19).
// The types are made if they are missing (a type with the same name is reused) and stay after
// `--remove`: they are useful as a start, and a type the team made by hand is never deleted.
//
// It only adds what is missing (an item is found by its code) and never changes or deletes what is there, so it can be run again
// on an inventory that is being worked on: new demonstration items and types appear, the ones already there stay as they are.
//
//   pnpm db:seed-demo             add what is missing
//   pnpm db:seed-demo -- --remove take every demonstration item away (their types stay)

const remove = process.argv.includes("--remove");

type Receipt = { on: string; qty: number; net: number; at: string; spot?: string; for?: string; free?: boolean };
type Use = { on: string; qty: number; at: string; spot?: string; for?: string; note?: string };

type Kind = (typeof itemTypeParam.$inferSelect)["kind"];
interface DemoType {
  name: string;
  /** The name of the type it is a kind of: it must come before this one in the list, and its parameters are this one's too. */
  parent?: string;
  /** The category of the budget its items belong to. */
  category: string;
  /** The code of its area; none: every area. */
  area?: string;
  hazards: boolean;
  params: { name: string; kind: Kind; unit?: string; prefixes?: boolean; choices?: string[] }[];
}

const TYPES: DemoType[] = [
  {
    name: "Fastener", category: "Components", area: "mt-dmt", hazards: false,
    params: [
      { name: "Kind", kind: "list", choices: ["Screw", "Nut", "Washer"] },
      { name: "Thread", kind: "list", choices: ["M3", "M4", "M5", "M6"] },
      { name: "Length", kind: "number", unit: "m", prefixes: true },
    ],
  },
  { name: "Cable", category: "Components", area: "hw", hazards: false, params: [{ name: "Section", kind: "number", unit: "mm²" }, { name: "Colour", kind: "text" }] },
  { name: "Connector", category: "Components", area: "hw", hazards: false, params: [{ name: "Pins", kind: "number" }, { name: "Sealed", kind: "yesno" }] },
  {
    name: "Battery", category: "Consumable", area: "hw", hazards: true,
    params: [{ name: "Voltage", kind: "number", unit: "V", prefixes: true }, { name: "Capacity", kind: "number", unit: "Ah", prefixes: true }, { name: "Cells", kind: "number" }],
  },
  {
    name: "Resistor", category: "Components", area: "hw", hazards: false,
    params: [
      { name: "Resistance", kind: "number", unit: "Ω", prefixes: true },
      { name: "Power", kind: "number", unit: "W", prefixes: true },
      { name: "Tolerance", kind: "list", choices: ["1 %", "5 %"] },
      { name: "Package", kind: "list", choices: ["0402", "0603", "0805"] },
    ],
  },
  {
    name: "Capacitor", category: "Components", area: "hw", hazards: false,
    params: [
      { name: "Capacitance", kind: "number", unit: "F", prefixes: true },
      { name: "Voltage", kind: "number", unit: "V", prefixes: true },
      { name: "Dielectric", kind: "list", choices: ["C0G", "X5R", "X7R"] },
      { name: "Package", kind: "list", choices: ["0402", "0603", "0805"] },
    ],
  },
  // a family with kinds under it, to try the tree of types (docs/inventario.md, §20): IC, and under it the Op-amp, the
  // Microcontroller (with its own kinds) and the Voltage regulator, each with what is written about it on top of what IC has
  {
    name: "IC", category: "Components", area: "hw", hazards: false,
    params: [
      { name: "Package", kind: "list", choices: ["SOT-223", "TO-220", "TO-263", "SOIC-8", "SOIC-16", "TSSOP-20", "QFN-32", "TQFP-32", "LQFP-48"] },
      { name: "Pins", kind: "number" },
      { name: "Max supply", kind: "number", unit: "V", prefixes: true },
    ],
  },
  {
    name: "Op-amp", parent: "IC", category: "Components", area: "hw", hazards: false,
    params: [
      { name: "Gain bandwidth", kind: "number", unit: "Hz", prefixes: true },
      { name: "Channels", kind: "number" },
      { name: "Rail-to-rail", kind: "yesno" },
    ],
  },
  {
    name: "Microcontroller", parent: "IC", category: "Components", area: "hw", hazards: false,
    params: [
      { name: "Core", kind: "list", choices: ["Cortex-M0", "Cortex-M3", "Cortex-M4", "AVR 8-bit"] },
      { name: "Flash", kind: "number", unit: "B", prefixes: true },
      { name: "RAM", kind: "number", unit: "B", prefixes: true },
      { name: "Max clock", kind: "number", unit: "Hz", prefixes: true },
    ],
  },
  { name: "ARM Cortex-M", parent: "Microcontroller", category: "Components", area: "hw", hazards: false, params: [{ name: "Series", kind: "list", choices: ["F1", "F4", "G0", "G4"] }] },
  { name: "AVR", parent: "Microcontroller", category: "Components", area: "hw", hazards: false, params: [] },
  {
    name: "Voltage regulator", parent: "IC", category: "Components", area: "hw", hazards: false,
    params: [
      { name: "Output voltage", kind: "number", unit: "V", prefixes: true },
      { name: "Max current", kind: "number", unit: "A", prefixes: true },
      { name: "Topology", kind: "list", choices: ["Linear", "LDO", "Buck", "Boost"] },
    ],
  },
];

interface Demo {
  code: string;
  name: string;
  category: string;
  unit: string;
  purpose: string;
  /** The code of its area; none: every area. */
  area?: string;
  /** The name of its type, and what is written in its parameters (numbers exact, in the unit of the parameter). */
  type?: string;
  params?: Record<string, string | boolean>;
  flammable?: boolean;
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
    code: "DEMO-001", area: "mt-dmt", type: "Fastener", params: { Kind: "Screw", Thread: "M3", Length: "0.01" }, name: "M3 x 10 socket screw A2", category: "Components", unit: "pcs", color: [70, 90, 120], shape: "circle",
    purpose: "Fastens the 3D-printed and aluminium brackets.", storageNotes: "Plastic drawer, box labelled M3.",
    receipts: [
      { on: "2026-06-10", qty: 200, net: 0.062, at: "s1-r1", spot: "Drawer 4, box M3", for: "sw" },
      { on: "2026-09-05", qty: 300, net: 0.071, at: "s1-r1", spot: "Drawer 4, box M3", for: "sw" },
      { on: "2026-10-12", qty: 200, net: 0.068, at: "s1-r1", spot: "Drawer 4, box M3" },
    ],
    uses: [{ on: "2026-09-20", qty: 120, at: "s1-r1", spot: "Drawer 4, box M3", for: "sw" }, { on: "2026-10-15", qty: 60, at: "s1-r1", spot: "Drawer 4, box M3", for: "hw" }],
  },
  {
    code: "DEMO-002", area: "mt-dmt", type: "Fastener", params: { Kind: "Nut", Thread: "M5" }, name: "M5 nylon lock nut", category: "Components", unit: "pcs", color: [110, 110, 130], shape: "ring",
    purpose: "Self-locking nut for the pedal box and the steering rack.", storageNotes: "Plastic drawer, box labelled M5.",
    receipts: [
      { on: "2026-06-10", qty: 100, net: 0.09, at: "s1-r1", spot: "Drawer 4, box M5" },
      { on: "2026-09-05", qty: 100, net: 0.085, at: "s1-r1", spot: "Drawer 4, box M5" },
    ],
  },
  {
    code: "DEMO-003", area: "mt-dmt", name: "Aluminium 6082 plate 200 x 100 x 5", category: "Manufacturing", unit: "pcs", color: [150, 160, 170], shape: "square",
    purpose: "Raw material for brackets and mounts.", storageNotes: "Flat on the rack, interleaved with paper.",
    receipts: [
      { on: "2026-06-20", qty: 20, net: 6.5, at: "s1-r2", spot: "Rack B", for: "mt-dmt" },
      { on: "2026-09-18", qty: 20, net: 7.2, at: "s1-r2", spot: "Rack B", for: "mt-dmt" },
    ],
    uses: [{ on: "2026-10-02", qty: 6, at: "s1-r2", spot: "Rack B", for: "mt-dmt", note: "Pedal brackets, first batch" }],
  },
  {
    code: "DEMO-004", area: "mt-dmt", name: "Epoxy resin L285", category: "Manufacturing", unit: "kg", color: [200, 160, 60], shape: "circle",
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
    code: "DEMO-005", area: "mt-dmt", name: "Epoxy hardener H285", category: "Manufacturing", unit: "kg", color: [190, 120, 60], shape: "ring",
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
    code: "DEMO-006", flammable: true, name: "Isopropyl alcohol 99 %", category: "Consumable", unit: "l", color: [90, 160, 190], shape: "bars",
    purpose: "Degreasing before bonding and painting.",
    safetyCodes: "H225, H319, H336 | P210, P233, P305+P351+P338",
    disposal: "Collect in the labelled solvent can and hand it to the university chemical waste service.",
    storageNotes: "Flammables cabinet, below 25 C, away from any ignition source. Maximum 5 l in the room.",
    receipts: [{ on: "2026-08-20", qty: 5, net: 9.8, at: "s2-r1", spot: "Flammables cabinet" }],
    uses: [{ on: "2026-09-25", qty: 1.2, at: "s2-r1", spot: "Flammables cabinet", for: "cm" }],
  },
  {
    code: "DEMO-007", area: "hw", type: "Battery", params: { Voltage: "14.8", Capacity: "5", Cells: "4" }, name: "LiPo battery 4S 5000 mAh", category: "Consumable", unit: "pcs", color: [200, 70, 70], shape: "square",
    purpose: "Powers the test bench and the data logger.",
    safetyCodes: "UN3480 (class 9) | do not short-circuit, do not charge unattended",
    disposal: "Never in household waste. Discharge to the storage level and take it to the battery collection point.",
    storageNotes: "Fireproof LiPo bag, 3.8 V per cell, 10-25 C. Check for swelling before every use.",
    receipts: [{ on: "2026-09-12", qty: 4, net: 46.9, at: "s1-r3", spot: "Fireproof cabinet", for: "hw" }],
  },
  {
    code: "DEMO-008", area: "hw", type: "Cable", params: { Section: "2.5", Colour: "Red" }, name: "Copper cable 2.5 mm2 red", category: "Components", unit: "m", color: [180, 60, 50], shape: "bars",
    purpose: "Power wiring of the low-voltage system.", storageNotes: "On its reel, hung on the wall.",
    receipts: [
      { on: "2026-06-15", qty: 50, net: 0.9, at: "s1-r3", spot: "Wall reels", for: "hw" },
      { on: "2026-09-20", qty: 100, net: 1.15, at: "s1-r3", spot: "Wall reels", for: "hw" },
    ],
    uses: [{ on: "2026-10-05", qty: 18.5, at: "s1-r3", spot: "Wall reels", for: "hw" }],
  },
  {
    code: "DEMO-009", area: "mt-dmt", name: "Torque wrench 5-60 Nm", category: "Asset", unit: "pcs", color: [60, 70, 90], shape: "diamond",
    purpose: "Tightening of the suspension and brake fasteners.",
    maintenanceNotes: "Recalibrate every 12 months (due July 2027). Always store at the lowest setting.",
    storageNotes: "In its case, on the tool wall.",
    receipts: [{ on: "2026-07-10", qty: 1, net: 89.9, at: "s1-r3", spot: "Tool wall" }],
  },
  {
    code: "DEMO-010", area: "hw", name: "Digital multimeter", category: "Asset", unit: "pcs", color: [230, 190, 40], shape: "square",
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
    code: "DEMO-014", area: "hw", type: "Connector", params: { Pins: "2", Sealed: true }, name: "2-pin sealed connector", category: "Components", unit: "pcs", color: [70, 120, 90], shape: "circle",
    purpose: "Waterproof connection of sensors to the harness.",
    receipts: [{ on: "2026-09-22", qty: 40, net: 0.85, at: "s1-r3", spot: "Electronics drawer", for: "hw" }],
  },
  // a few parts of the electronics, to try the filters on what is written about them
  smd("DEMO-030", "Resistor 1k 0603 1%", "Resistor", { Resistance: "1000", Power: "0.1", Tolerance: "1 %", Package: "0603" }, 200, 0.0045),
  smd("DEMO-031", "Resistor 4k7 0603 1%", "Resistor", { Resistance: "4700", Power: "0.1", Tolerance: "1 %", Package: "0603" }, 200, 0.0045),
  smd("DEMO-032", "Resistor 10k 0805 5%", "Resistor", { Resistance: "10000", Power: "0.125", Tolerance: "5 %", Package: "0805" }, 100, 0.0031),
  smd("DEMO-033", "Capacitor 100n 50V X7R 0603", "Capacitor", { Capacitance: "0.0000001", Voltage: "50", Dielectric: "X7R", Package: "0603" }, 300, 0.006),
  smd("DEMO-034", "Capacitor 10u 25V X5R 0805", "Capacitor", { Capacitance: "0.00001", Voltage: "25", Dielectric: "X5R", Package: "0805" }, 50, 0.038),
  // integrated circuits: the generic IC has what every IC has; the others have more on top (the tree of types)
  ic("DEMO-100", "74HC595 shift register", "IC", { Package: "SOIC-16", Pins: "16", "Max supply": "6" }, 50, 0.18),
  ic("DEMO-101", "LM358 dual op-amp", "Op-amp", { Package: "SOIC-8", Pins: "8", "Max supply": "32", "Gain bandwidth": "1000000", Channels: "2", "Rail-to-rail": false }, 40, 0.22, [{ on: "2026-10-05", qty: 10, at: "s1-r3", spot: "Electronics drawer, IC box", for: "hw" }]),
  ic("DEMO-102", "TL072 dual op-amp", "Op-amp", { Package: "SOIC-8", Pins: "8", "Max supply": "36", "Gain bandwidth": "3000000", Channels: "2", "Rail-to-rail": false }, 20, 0.41),
  ic("DEMO-103", "MCP6002 rail-to-rail op-amp", "Op-amp", { Package: "SOIC-8", Pins: "8", "Max supply": "6", "Gain bandwidth": "1000000", Channels: "2", "Rail-to-rail": true }, 25, 0.38),
  ic("DEMO-104", "STM32F103C8T6", "ARM Cortex-M", { Package: "LQFP-48", Pins: "48", "Max supply": "3.6", Core: "Cortex-M3", Flash: "65536", RAM: "20480", "Max clock": "72000000", Series: "F1" }, 10, 3.9),
  ic("DEMO-105", "STM32G031K8", "ARM Cortex-M", { Package: "QFN-32", Pins: "32", "Max supply": "3.6", Core: "Cortex-M0", Flash: "65536", RAM: "8192", "Max clock": "64000000", Series: "G0" }, 10, 1.6),
  ic("DEMO-106", "ATmega328P-AU", "AVR", { Package: "TQFP-32", Pins: "32", "Max supply": "5.5", Core: "AVR 8-bit", Flash: "32768", RAM: "2048", "Max clock": "20000000" }, 10, 2.3),
  ic("DEMO-107", "LM7805 regulator 5 V 1.5 A", "Voltage regulator", { Package: "TO-220", Pins: "3", "Max supply": "35", "Output voltage": "5", "Max current": "1.5", Topology: "Linear" }, 30, 0.35),
  ic("DEMO-108", "AMS1117-3.3 LDO", "Voltage regulator", { Package: "SOT-223", Pins: "3", "Max supply": "15", "Output voltage": "3.3", "Max current": "1", Topology: "LDO" }, 40, 0.19),
  ic("DEMO-109", "LM2596 buck regulator 5 V 3 A", "Voltage regulator", { Package: "TO-263", Pins: "5", "Max supply": "40", "Output voltage": "5", "Max current": "3", Topology: "Buck" }, 12, 1.1),
];

/** A small surface-mount part of HW, bought once for a project of the area. */
function smd(code: string, name: string, type: string, params: Record<string, string>, qty: number, net: number): Demo {
  return {
    code, name, category: "Components", unit: "pcs", area: "hw", type, params, color: [60, 60, 70], shape: "square", picture: false,
    purpose: "Boards of the low-voltage system.", storageNotes: "SMD box, one bag per value.",
    receipts: [{ on: "2026-09-22", qty, net, at: "s1-r3", spot: "Electronics drawer, SMD box", for: "hw" }],
  };
}

/** An integrated circuit of HW, bought once for a project of the area. */
function ic(code: string, name: string, type: string, params: Record<string, string | boolean>, qty: number, net: number, uses?: Use[]): Demo {
  return {
    code, name, category: "Components", unit: "pcs", area: "hw", type, params, color: [50, 50, 60], shape: "square", picture: false,
    purpose: "Boards of the low-voltage system and of the data logger.", storageNotes: "Electronics drawer, anti-static box of the ICs.",
    receipts: [{ on: "2026-09-22", qty, net, at: "s1-r3", spot: "Electronics drawer, IC box", for: "hw" }],
    ...(uses ? { uses } : {}),
  };
}

interface DemoMade {
  code: string;
  name: string;
  purpose: string;
  area: string;
  color: [number, number, number];
  shape: Shape;
  /** [code of the part, quantity] */
  parts: [string, number][];
  /** How many are on the shelf, and where. */
  counted?: { qty: number; at: string; spot: string };
}

const MADE: DemoMade[] = [
  {
    code: "DEMO-020", area: "mt-dmt", name: "Pedal bracket", purpose: "Mounts the brake pedal to the chassis.", color: [120, 130, 150], shape: "square",
    parts: [["DEMO-003", 1], ["DEMO-001", 6]], counted: { qty: 4, at: "s1-r2", spot: "Shelf 1, made parts" },
  },
  {
    code: "DEMO-021", area: "mt-dmt", name: "Brake pedal assembly", purpose: "The complete pedal: bracket, pivot hardware and plates.", color: [170, 90, 90], shape: "diamond",
    parts: [["DEMO-020", 1], ["DEMO-001", 4], ["DEMO-003", 2], ["DEMO-002", 2]],
  },
  {
    code: "DEMO-022", area: "hw", name: "Dash wiring harness", purpose: "Connects the dash display, the buttons and the data logger.", color: [90, 150, 110], shape: "bars",
    parts: [["DEMO-008", 3.5], ["DEMO-012", 12], ["DEMO-014", 6]],
  },
];

async function main() {
  await ownerDb.transaction(async (tx) => {
    // not for the history: this is made-up data (needs the owner, which the tool runs as)
    await tx.execute(sql`set local session_replication_role = replica`);

    const existing = await tx.select({ id: inventoryItem.id, code: inventoryItem.code }).from(inventoryItem).where(like(inventoryItem.code, "DEMO-%"));
    if (remove) {
      // with the triggers off the database does not cascade either: everything hanging from the items goes first
      const ids = existing.map((e) => e.id);
      if (ids.length > 0) {
        const sheets = (await tx.select({ id: itemDatasheet.id }).from(itemDatasheet).where(inArray(itemDatasheet.itemId, ids))).map((r) => r.id);
        if (sheets.length > 0) await tx.delete(itemDatasheetFile).where(inArray(itemDatasheetFile.datasheetId, sheets));
        await tx.delete(itemDatasheet).where(inArray(itemDatasheet.itemId, ids));
        await tx.delete(itemImage).where(inArray(itemImage.itemId, ids));
        await tx.delete(itemParamValue).where(inArray(itemParamValue.itemId, ids));
        await tx.delete(stockMovement).where(inArray(stockMovement.itemId, ids));
        await tx.delete(componentPart).where(inArray(componentPart.componentId, ids));
        await tx.delete(inventoryItem).where(like(inventoryItem.code, "DEMO-%"));
      }
      console.log(`Removed ${existing.length} demonstration items (their types stay).`);
      return;
    }

    // a project of each area, if there is one, to attach purchases and uses to
    const firstProject = new Map<string, number>();
    for (const row of await tx.select({ code: area.code, id: project.id }).from(project).innerJoin(area, eq(project.areaId, area.id)).orderBy(asc(project.position))) {
      if (!firstProject.has(row.code)) firstProject.set(row.code, row.id);
    }
    const projectOf = (areaCode?: string) => (areaCode ? (firstProject.get(areaCode) ?? null) : null);
    const areaIds = new Map((await tx.select().from(area)).map((a) => [a.code, a.id]));
    const types = await ensureTypes(tx, areaIds);
    const e4 = (euros: number) => Math.round(euros * 10_000);
    const milli = (qty: number) => Math.round(qty * 1000);

    // what is there already stays as it is; only what is missing is made
    const ids = new Map<string, number>(existing.map((e) => [e.code!, e.id]));
    const created = new Set<string>();
    const makeItem = async (d: { code: string; name: string; purpose: string; category?: string; unit?: string; origin?: "bought" | "made" } & Partial<Demo>) => {
      const type = d.type === undefined ? undefined : types.get(d.type)!;
      const [row] = await tx
        .insert(inventoryItem)
        .values({
          // an item takes the category of its type, as the site does
          code: d.code, name: d.name, purpose: d.purpose, category: type?.category ?? d.category ?? (d.origin === "made" ? "Components" : null), unit: d.unit ?? "pcs",
          origin: d.origin ?? "bought", safetyCodes: d.safetyCodes ?? null, disposal: d.disposal ?? null,
          storageNotes: d.storageNotes ?? null, maintenanceNotes: d.maintenanceNotes ?? null, flammable: d.flammable ?? false,
          areaId: d.area === undefined ? null : areaIds.get(d.area)!, typeId: type?.id ?? null,
        })
        .returning({ id: inventoryItem.id });
      for (const [name, value] of Object.entries(d.params ?? {})) {
        const param = type!.params.get(name)!;
        if (param.kind === "list" && !param.choices.includes(value as string)) throw new Error(`"${value}" is not a choice of ${d.type} → ${name}`);
        await tx.insert(itemParamValue).values({
          itemId: row!.id, paramId: param.id,
          number: param.kind === "number" ? (value as string) : null,
          text: param.kind === "list" || param.kind === "text" ? (value as string) : null,
          flag: param.kind === "yesno" ? (value as boolean) : null,
        });
      }
      ids.set(d.code, row!.id);
      created.add(d.code);
      return row!.id;
    };
    const picture = async (itemId: number, color: [number, number, number], shape: Shape) => {
      await tx.insert(itemImage).values({ itemId, mime: "image/png", full: placeholderPng(480, color, shape), thumb: placeholderPng(96, color, shape) });
      await tx.update(inventoryItem).set({ imageUpdatedAt: sql`now()` }).where(eq(inventoryItem.id, itemId));
    };

    for (const d of BOUGHT) {
      if (ids.has(d.code)) continue;
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

    // a few other things that happen on a shelf: a move, a count, a disposal (only for the items made now)
    if (created.has("DEMO-001")) {
      await tx.insert(stockMovement).values({ itemId: ids.get("DEMO-001")!, kind: "transfer", occurredOn: "2026-10-16", quantity: fromScaled(milli(100), 3), location: "s1-r1", spot: "Drawer 4, box M3", toLocation: "s2-r1", toSpot: "Workshop box", note: "For the second site" });
    }
    if (created.has("DEMO-002")) {
      await tx.insert(stockMovement).values({ itemId: ids.get("DEMO-002")!, kind: "adjustment", occurredOn: "2026-10-17", quantity: fromScaled(milli(-3), 3), location: "s1-r1", spot: "Drawer 4, box M5", note: "Count: three missing" });
    }
    if (created.has("DEMO-006")) {
      await tx.insert(stockMovement).values({ itemId: ids.get("DEMO-006")!, kind: "disposal", occurredOn: "2026-10-18", quantity: fromScaled(milli(0.5), 3), location: "s2-r1", spot: "Flammables cabinet", note: "Opened bottle, expired" });
    }

    for (const m of MADE) {
      if (ids.has(m.code)) continue;
      const itemId = await makeItem({ ...m, origin: "made" });
      await picture(itemId, m.color, m.shape);
      if (m.counted) {
        await tx.insert(stockMovement).values({ itemId, kind: "adjustment", occurredOn: "2026-10-14", quantity: fromScaled(milli(m.counted.qty), 3), location: m.counted.at, spot: m.counted.spot, note: "Counted when the inventory was started" });
      }
    }
    for (const m of MADE.filter((made) => created.has(made.code))) {
      for (const [partCode, qty] of m.parts) {
        await tx.insert(componentPart).values({ componentId: ids.get(m.code)!, partId: ids.get(partCode)!, quantity: fromScaled(milli(qty), 3) });
      }
    }
    console.log(`Added ${created.size} demonstration items (prefix DEMO-); ${existing.length} were there already and stay as they are. Types: ${TYPES.length}. Take the items away with: pnpm db:seed-demo -- --remove`);
  });
  await ownerPool.end();
}

type Tx = Parameters<Parameters<typeof ownerDb.transaction>[0]>[0];

/**
 * The demonstration types and their parameters, made where they are missing. A type or a parameter with the same name (under the
 * same parent) is reused as it is, its category and everything else untouched; one of another kind stops everything, rather than
 * writing a value it cannot hold. A type under another has the parameters of its parents too.
 */
async function ensureTypes(tx: Tx, areaIds: Map<string, number>) {
  type Params = Map<string, { id: number; kind: Kind; choices: string[] }>;
  const types = new Map<string, { id: number; params: Params; category: string | null }>();
  const categories = new Map((await tx.select().from(category)).map((c) => [c.id, c.name]));
  const categoryIds = new Map([...categories].map(([id, name]) => [name, id]));
  for (const t of TYPES) {
    const parent = t.parent === undefined ? null : types.get(t.parent);
    if (t.parent !== undefined && !parent) throw new Error(`The type "${t.name}" is under "${t.parent}", which must come before it in the list`);
    const parentId = parent?.id ?? null;
    let [type] = await tx
      .select()
      .from(itemType)
      .where(and(sql`lower(${itemType.name}) = lower(${t.name})`, sql`coalesce(${itemType.parentId}, 0) = ${parentId ?? 0}`));
    if (!type) {
      const categoryId = categoryIds.get(t.category);
      if (categoryId === undefined) throw new Error(`The category "${t.category}" of the type "${t.name}" does not exist: add it in Settings`);
      type = (await tx.insert(itemType).values({ name: t.name, parentId, categoryId, areaId: t.area === undefined ? null : areaIds.get(t.area)!, hazards: t.hazards }).returning())[0]!;
    }
    const params: Params = new Map(parent?.params);
    for (const p of t.params) {
      let [param] = await tx.select().from(itemTypeParam).where(and(eq(itemTypeParam.typeId, type.id), sql`lower(${itemTypeParam.name}) = lower(${p.name})`));
      if (!param) {
        const [last] = await tx.select({ position: max(itemTypeParam.position) }).from(itemTypeParam).where(eq(itemTypeParam.typeId, type.id));
        [param] = await tx
          .insert(itemTypeParam)
          .values({ typeId: type.id, name: p.name, kind: p.kind, unit: p.unit ?? null, prefixes: p.prefixes ?? false, choices: p.choices ?? [], position: (last?.position ?? 0) + 1 })
          .returning();
      }
      if (param!.kind !== p.kind) throw new Error(`The type "${type.name}" already has "${param!.name}" as ${param!.kind}, not ${p.kind}: rename one of them`);
      params.set(p.name, { id: param!.id, kind: param!.kind, choices: param!.choices });
    }
    types.set(t.name, { id: type.id, params, category: type.categoryId === null ? null : (categories.get(type.categoryId) ?? null) });
  }
  return types;
}

await main();
