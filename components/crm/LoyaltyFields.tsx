"use client";

import { Field, fieldControlClass } from "@/components/crm/fields";
import { LOYALTY_PROGRAMS, type LoyaltyMap } from "@/lib/crm/loyalty";

export function LoyaltyFields({
  values,
  onChange,
}: {
  values: LoyaltyMap;
  onChange: (next: LoyaltyMap) => void;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <p className="sm:col-span-2 font-display text-base font-bold text-[var(--admin-navy)]">
        Programmes de fidélité
      </p>
      {LOYALTY_PROGRAMS.map((program) => (
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
    </section>
  );
}
