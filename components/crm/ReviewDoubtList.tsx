export function ReviewDoubtList({
  rows,
  onValidateAll,
  busy = false,
}: {
  rows: { key: string; label: string; reasons: string[] }[];
  /** Lève le marqueur de toutes les cartes listées. Absent : pas de bouton (relecture avant enregistrement). */
  onValidateAll?: () => void;
  busy?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1 text-sm text-accent" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Lecture douteuse</p>
        {onValidateAll ? (
          <button
            type="button"
            disabled={busy}
            onClick={onValidateAll}
            className="admin-tap inline-flex h-8 items-center rounded-full border border-accent/40 bg-white px-3 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-40"
          >
            Tout valider
          </button>
        ) : null}
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="font-semibold">{row.label}</span>
            {" — "}
            {row.reasons.join(" ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
