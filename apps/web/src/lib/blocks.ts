/** "ALL" is the block with every item; the others are the categories (as titled in the old sheets). */
export const blockTitle = (block: string) => (block === "ALL" ? "ALL ITEMS" : block.toUpperCase());
