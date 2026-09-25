export function BusyBar({
  active = true,
  value = null,
  label,
  tone = "ink",
}: {
  active?: boolean;
  value?: number | null;
  label?: string;
  /** ink : barre marine. light : barre champagne sur fond marine. */
  tone?: "ink" | "light";
}) {
  if (!active) return null;
  const known = typeof value === "number" && Number.isFinite(value);
  const pct = known ? Math.max(0, Math.min(100, value)) : null;
  return (
    <div className="space-y-1.5">
      {label ? (
        <p className="text-[12px] font-medium text-current">
          {label}
          {pct != null ? ` · ${Math.round(pct)} %` : ""}
        </p>
      ) : null}
      <div
        className={`h-1.5 overflow-hidden rounded-full ${tone === "light" ? "bg-white/15" : "bg-[#e9e8e5]"}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-label={label || "En cours"}
      >
        <div
          className={`h-full rounded-full ${tone === "light" ? "bg-[#C5A880]" : "bg-[var(--admin-navy,#0b192c)]"} ${pct == null ? "tb-busy-bar" : "transition-[width] duration-200"}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
