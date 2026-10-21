import { useSearchParams } from "react-router";
import type { PriceBasis, PriceChoice, PriceMethod } from "../api/types";

export const BASES: { value: PriceBasis; label: string }[] = [
  { value: "net", label: "Net (before VAT)" },
  { value: "gross", label: "With VAT" },
  { value: "team", label: "Team cost" },
];

export const METHODS: { value: PriceMethod; label: string }[] = [
  { value: "last", label: "Latest purchase" },
  { value: "average", label: "Average of purchases" },
];

/** Reads the choice from the address, so a view can be shared or bookmarked exactly as it is. */
export function readPrice(params: URLSearchParams): PriceChoice {
  const basis = params.get("basis");
  const method = params.get("method");
  const on = params.get("on");
  return {
    basis: BASES.some((b) => b.value === basis) ? (basis as PriceBasis) : "net",
    method: METHODS.some((m) => m.value === method) ? (method as PriceMethod) : "last",
    ...(on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? { on } : {}),
  };
}

/** The price choice of the page (which price, how, on which day) and a way to change it. */
export function usePrice(): [PriceChoice, (change: Partial<PriceChoice>) => void] {
  const [params, setParams] = useSearchParams();
  const choice = readPrice(params);
  // Built from the address as it is at the moment of the change, not from the last render: two
  // changes in a row (a choice and a typed date) must both stay. The router updates the address
  // synchronously, so reading it back is always up to date.
  const change = (patch: Partial<PriceChoice>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  return [choice, change];
}
