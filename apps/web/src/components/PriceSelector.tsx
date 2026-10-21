import type { PriceChoice } from "../api/types";
import { BASES, METHODS } from "../lib/price";

/**
 * Which price to show: before VAT, with VAT or what the team pays; the latest purchase or the
 * average of them; and, where it matters, on which day (the price of that day, from the
 * purchases made until then).
 */
export function PriceSelector({
  value, onChange, method = true, date = false,
}: {
  value: PriceChoice;
  onChange: (change: Partial<PriceChoice>) => void;
  method?: boolean;
  date?: boolean;
}) {
  return (
    <div className="inline-form">
      <div className="field">
        <label htmlFor="price-basis">Price</label>
        <select id="price-basis" className="input small" value={value.basis} onChange={(e) => onChange({ basis: e.target.value as PriceChoice["basis"] })}>
          {BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </div>
      {method && (
        <div className="field">
          <label htmlFor="price-method">Taken from</label>
          <select id="price-method" className="input small" value={value.method} onChange={(e) => onChange({ method: e.target.value as PriceChoice["method"] })}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      )}
      {date && (
        <div className="field">
          <label htmlFor="price-date">On day</label>
          <input id="price-date" className="input small" type="date" min="2000-01-01" max="2100-12-31" value={value.on ?? ""} onChange={(e) => onChange({ on: e.target.value || undefined })} />
        </div>
      )}
    </div>
  );
}
