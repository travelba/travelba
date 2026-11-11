import { staffGivenName, staffInitials } from "@/lib/crm/staff-name";

/** Qui est en charge, à côté de la pastille du dossier. Sans nom : « À prendre ». */
export function OwnerBadge({ name, className = "" }: { name?: string | null; className?: string }) {
  const given = staffGivenName(name);
  if (given) {
    const initials = staffInitials(name);
    return (
      <span
        className={`inline-flex max-w-[8.5rem] items-center gap-1 text-[var(--admin-navy)] ${className}`}
        title={`En charge : ${name}`}
      >
        <span
          aria-hidden
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[9px] font-bold leading-none text-[var(--admin-gold)]"
        >
          {initials}
        </span>
        <span className="truncate text-[11px] font-semibold">{given}</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border border-dashed border-[#9e7e51]/70 px-2 py-0.5 text-[10px] font-semibold text-[#9e7e51] ${className}`}
      title="Personne en charge pour le moment"
    >
      À prendre
    </span>
  );
}
