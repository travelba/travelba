/** Qui est en charge du dossier, dans les listes. Sans nom : « À prendre ». */
export function OwnerBadge({ name, className = "" }: { name?: string | null; className?: string }) {
  if (name) {
    return (
      <span
        className={`inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full bg-[var(--admin-navy)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--admin-gold)] ${className}`}
        title={`En charge : ${name}`}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border border-dashed border-[var(--admin-gold-dark)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--admin-gold-dark)] ${className}`}
      title="Personne en charge pour le moment"
    >
      À prendre
    </span>
  );
}
