import Link from "next/link";

/** Suite à donner quand le client a demandé un règlement qui ne s’encaisse pas seul. */
export function ClientPayFollowUp({
  title,
  next,
  links = [],
}: {
  title: string;
  next: string;
  links?: { href: string; label: string }[];
}) {
  return (
    <section className="rounded-2xl border border-[var(--admin-gold)] bg-[#fbf7ec] px-4 py-3 text-sm text-[var(--admin-navy)]">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-snug">{next}</p>
      {links.length ? (
        <p className="mt-2 flex flex-wrap gap-3">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="font-semibold underline underline-offset-2">
              {link.label}
            </Link>
          ))}
        </p>
      ) : null}
    </section>
  );
}
