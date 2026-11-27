// The places of a page where another part of the site may add something (docs/moduli-architettura.md, §7.4). The owner of the page
// defines the slot, with what it takes (`T`), and exports it from its public.ts; a module or a bridge fills it from its manifest, and
// only the parts that are on fill anything. The page asks what is there (`useSlot`) or draws it (`Slot`), and works without it.
import { createContext, useContext, type ComponentType } from "react";

/** A slot: its name, and what a part puts there. */
export interface SlotDef<T> {
  name: string;
  /** Never set: it only carries `T`. */
  readonly filledWith?: T;
}

export const defineSlot = <T,>(name: string): SlotDef<T> => ({ name });

/** What a part puts in a slot (the `fills` of its manifest). */
export interface Fill {
  slot: string;
  value: unknown;
}

export const fill = <T,>(slot: SlotDef<T>, value: T): Fill => ({ slot: slot.name, value });

const Fills = createContext<Fill[]>([]);

/** Hands the fills of the parts that are on to the pages below it (the menu of the platform does it). */
export const FillsProvider = Fills.Provider;

/** What the parts that are on put in a slot, in the order of their manifests: nothing when none of them fills it. */
export function useSlot<T>(slot: SlotDef<T>): T[] {
  return useContext(Fills)
    .filter((f) => f.slot === slot.name)
    .map((f) => f.value as T);
}

/** Draws the components that fill a slot, with the properties the page gives them. */
export function Slot<P extends object>({ slot, props }: { slot: SlotDef<ComponentType<P>>; props: P }) {
  return (
    <>
      {useSlot(slot).map((Part, i) => (
        <Part key={i} {...props} />
      ))}
    </>
  );
}

/**
 * An action another part of the site adds to the rows of a page: its buttons on a row and the form it opens under the row (`RowAction`).
 * The page keeps which action is open, one at a time, and remembers it as it does its own.
 */
export interface RowActionFill<R> {
  key: string;
  /** The buttons on a row, nothing when the action does not apply to it; `open` opens the form. */
  Buttons: ComponentType<{ row: R; open: () => void }>;
  /** What the panel says above its title. */
  eyebrow: string;
  /** The title of the panel, when it is not the page's. */
  title?: (row: R) => string;
  /** What the panel says about the row, when it is not what the page says. */
  context?: (row: R) => [string, string][];
  /** The form whose draft keeps the panel open when the person comes back to the page; without it the panel starts closed. */
  draftKey?: (rowId: number) => string;
  Form: ComponentType<{ row: R; onClose: () => void }>;
  /** The short form for the popover, when there is one. */
  Quick?: ComponentType<{ row: R; onClose: () => void }>;
}
