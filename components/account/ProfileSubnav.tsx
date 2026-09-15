"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/mon-compte/profil", label: "Profil & coordonnées", exact: true },
  { href: "/mon-compte/profil/paiement", label: "Moyens de paiement" },
  { href: "/mon-compte/profil/documents", label: "Documents" },
  { href: "/mon-compte/profil/compagnons", label: "Compagnons" },
];

export function ProfileSubnav() {
  const pathname = usePathname();

  return (
    <nav className="mt-5 flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-[var(--admin-navy)] text-white"
                : "bg-white text-[var(--admin-navy)] ring-1 ring-[var(--border)] hover:bg-[var(--admin-sky)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
