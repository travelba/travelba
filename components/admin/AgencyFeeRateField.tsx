"use client";

type Option = { value: string; title: string; hint: string };

/** Trois ou quatre taux, qui passent à la ligne sur un téléphone. */
export function AgencyFeeRateField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const current = options.find((option) => option.value === value) || options[0];
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex max-w-full flex-wrap gap-1 rounded-2xl bg-white/60 p-1 shadow-[inset_0_0_0_1px_var(--border)]"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`admin-tap min-h-11 min-w-[4.5rem] flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition ${
                selected ? "bg-[var(--admin-navy)] text-white" : "text-[var(--admin-navy)] hover:bg-white"
              }`}
            >
              {option.title}
            </button>
          );
        })}
      </div>
      {current?.hint ? <p className="text-xs text-muted">{current.hint}</p> : null}
    </div>
  );
}
