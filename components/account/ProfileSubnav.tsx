"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/mon-compte/profil", label: "Informations personnelles", exact: true },
  { href: "/mon-compte/profil/paiement", label: "Moyens de paiement" },
  { href: "/mon-compte/profil/documents", label: "Pièces par voyage" },
  { href: "/mon-compte/profil/compagnons", label: "Compagnons de voyage" },
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
                ? "bg-[var(--admin-navy)] text-[var(--admin-gold-soft)]"
                : "bg-white text-[var(--admin-navy)] ring-1 ring-[#e5e3dc] hover:bg-[var(--surface-2)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
