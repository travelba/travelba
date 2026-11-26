import Link from "next/link";

const LINKS = [
  { href: "/admin/whatsapp/revue", id: "revue", label: "Revue de la semaine" },
  { href: "/admin/whatsapp/qualite", id: "qualite", label: "Qualité du concierge" },
] as const;

export function ConciergeQualityTabs({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <nav className="flex flex-wrap gap-4 text-sm" aria-label="Qualité du concierge">
      {LINKS.map((link) => (
        <Link
          key={link.id}
          href={link.href}
          aria-current={current === link.id ? "page" : undefined}
          className={current === link.id ? "font-semibold text-[var(--admin-navy)]" : "text-muted underline-offset-2 hover:underline"}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
