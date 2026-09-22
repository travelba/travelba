"use client";

import { useState } from "react";
import { Field, fieldControlClass } from "@/components/crm/fields";
import { LOYALTY_PROGRAMS, type LoyaltyKey, type LoyaltyMap } from "@/lib/crm/loyalty";

export function LoyaltyFields({
  values,
  onChange,
  onlyFilled = false,
}: {
  values: LoyaltyMap;
  onChange: (next: LoyaltyMap) => void;
  /** Côté client : une ligne par numéro déjà saisi, pas les six champs vides. */
  onlyFilled?: boolean;
}) {
  const [added, setAdded] = useState<LoyaltyKey[]>([]);
  const [picking, setPicking] = useState(false);
  const visible = onlyFilled
    ? LOYALTY_PROGRAMS.filter((program) => values[program.key] || added.includes(program.key))
    : LOYALTY_PROGRAMS;
  const hidden = LOYALTY_PROGRAMS.filter(
    (program) => !visible.some((row) => row.key === program.key)
  );

  return (
    <div className={onlyFilled ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
      {onlyFilled ? null : (
        <p className="sm:col-span-2 font-display text-base font-bold text-[var(--admin-navy)]">
          Programmes de fidélité
        </p>
      )}
      {visible.map((program) => (
        <Field key={program.key} label={program.label} hint={program.hint}>
          <input
            value={values[program.key] || ""}
            onChange={(event) =>
              onChange({ ...values, [program.key]: event.target.value.toUpperCase() })
            }
            autoComplete="off"
            className={fieldControlClass}
          />
        </Field>
      ))}
      {onlyFilled && hidden.length ? (
        picking ? (
          <Field label="Programme" className="sm:col-span-2">
            <select
              className={fieldControlClass}
              defaultValue=""
              onChange={(event) => {
                const key = event.target.value as LoyaltyKey;
                if (!key) return;
                setAdded((current) => [...current, key]);
                setPicking(false);
              }}
            >
              <option value="">Choisir</option>
              {hidden.map((program) => (
                <option key={program.key} value={program.key}>
                  {program.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-left text-sm font-semibold text-[var(--admin-navy)] underline"
          >
            Ajouter un programme
          </button>
        )
      ) : null}
    </div>
  );
}
