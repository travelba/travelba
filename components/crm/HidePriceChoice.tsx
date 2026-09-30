"use client";

import { useId } from "react";

export function HidePriceChoice({
  name = "hide_prices",
  value,
  onChange,
}: {
  name?: string;
  /** Absent : radios du formulaire. Présent : choix contrôlé, y compris null. */
  value?: boolean | null;
  onChange?: (value: boolean) => void;
}) {
  const autoName = useId();
  const group = onChange ? autoName : name;
  const controlled = Boolean(onChange);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-[var(--admin-navy)]">
        Cacher le prix sur le PDF ?
      </legend>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
          <input
            type="radio"
            name={group}
            value="1"
            required
            checked={controlled ? value === true : undefined}
            onChange={onChange ? () => onChange(true) : undefined}
          />
          Oui, masquer les montants
        </label>
        <label className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
          <input
            type="radio"
            name={group}
            value="0"
            checked={controlled ? value === false : undefined}
            onChange={onChange ? () => onChange(false) : undefined}
          />
          Non, laisser le prix
        </label>
      </div>
    </fieldset>
  );
}
