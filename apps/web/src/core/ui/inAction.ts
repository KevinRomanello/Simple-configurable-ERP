import { createContext, useContext } from "react";

/**
 * True inside the panel of an action (`RowAction`) or a big popup (`Peek`). A box drawn there (`Panel`, `FormPanel`) does not draw
 * its own frame and title: the panel has them already, and a box inside a box is noise. The pages do not know about it: it is the
 * panel that tells its contents.
 */
export const InAction = createContext(false);

export const useInAction = () => useContext(InAction);
