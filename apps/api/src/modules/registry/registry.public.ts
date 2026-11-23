import { matches, openRegistry, textOf } from "@erp/registry";
import type { db } from "../../db/client";
import { loadRegistry } from "./registry.data";

// What other modules may use of the registry (docs/anagrafiche.md, §2 and §9). Nothing else of this folder
// is imported from outside it: the registry can change inside without touching them.

export { onRegistryChange, onRegistryUse, type RegistryListener, type RegistryUseCheck } from "./registry.write";

/** Reads with the pool or inside a transaction (a change not yet saved is then seen). */
type Reader = Pick<typeof db, "select">;

export interface PersonInRegistry {
  /** The email they sign in with (lower case). */
  email: string;
  name: string;
  /** The given views (groups) whose filter their record matches. */
  views: number[];
  /** The texts of a field (the codes of their areas, for instance), one per item. */
  values: string[];
}

/**
 * The people of the registry, each with the given views they are in and the values of a field. Null when the
 * registry has no people table or no email field yet. Read inside `tx`: a change not yet saved is seen.
 */
export async function peopleInViews(tx: Reader, viewIds: number[], valuesFieldId: number | null): Promise<PersonInRegistry[] | null> {
  const snapshot = await loadRegistry(tx, []);
  const { peopleTableId, emailFieldId } = snapshot.settings;
  if (peopleTableId === null || emailFieldId === null) return null;
  const reg = openRegistry(await loadRegistry(tx, [peopleTableId]));
  const email = reg.field(emailFieldId);
  if (!email) return null;
  const views = viewIds.map((id) => reg.view(id)).filter((v) => v !== undefined && v.tableId === peopleTableId);
  const valuesField = valuesFieldId === null ? undefined : reg.field(valuesFieldId);
  const env = { today: reg.snapshot.today, peopleTableId };
  const out: PersonInRegistry[] = [];
  for (const record of reg.recordsOf(peopleTableId)) {
    const address = textOf(reg.value(record, email)).trim().toLowerCase();
    if (!/^[^\s@,]+@[^\s@,]+$/.test(address)) continue;
    const raw = valuesField ? reg.value(record, valuesField) : [];
    const values = (Array.isArray(raw) ? raw : [raw]).map((v) => textOf(v).trim()).filter((v) => v !== "");
    out.push({ email: address, name: reg.display(record.id), views: views.filter((v) => matches(reg, record, v!.config.filter, env)).map((v) => v!.id), values });
  }
  return out;
}

/** The views of the people table that are groups, for the settings of other modules. */
export async function groupsOfRegistry(tx: Reader) {
  const reg = openRegistry(await loadRegistry(tx, []));
  const people = reg.snapshot.settings.peopleTableId;
  return {
    peopleTableId: people,
    groups: people === null ? [] : reg.viewsOf(people).filter((v) => v.config.group).map((v) => ({ id: v.id, name: v.name })),
    fields: people === null ? [] : reg.fieldsOf(people).map((f) => ({ id: f.id, name: f.name, type: f.type })),
  };
}
