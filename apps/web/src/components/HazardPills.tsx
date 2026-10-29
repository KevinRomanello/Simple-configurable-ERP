import { faFire, faRadiation, faSkullCrossbones } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { HAZARDS } from "../lib/inventory";
import { Field } from "./ui";

const ICON = { flammable: faFire, toxic: faSkullCrossbones, carcinogenic: faRadiation } as const;

/** The marks of an item that is flammable, toxic or carcinogenic: red pills, nothing at all for an item that is none of them. */
export function HazardPills({ item }: { item: { flammable: boolean; toxic: boolean; carcinogenic: boolean } }) {
  return (
    <>
      {HAZARDS.filter((h) => item[h.key]).map((h) => (
        <span key={h.key} className="pill hazard" title={h.label}>
          <FontAwesomeIcon icon={ICON[h.key]} /> {h.label}
        </span>
      ))}
    </>
  );
}

/** The three boxes to tick (in an item's form) or to filter by (in the list), side by side under one label. */
export function HazardChecks({ value, onChange }: {
  value: { flammable: boolean; toxic: boolean; carcinogenic: boolean };
  onChange: (key: "flammable" | "toxic" | "carcinogenic", checked: boolean) => void;
}) {
  return (
    <Field label="Hazards">
      <div className="checks" role="group" aria-label="Hazards">
        {HAZARDS.map((h) => (
          <label key={h.key} className="checkbox">
            <input type="checkbox" checked={value[h.key]} onChange={(e) => onChange(h.key, e.target.checked)} />
            {h.label}
          </label>
        ))}
      </div>
    </Field>
  );
}
