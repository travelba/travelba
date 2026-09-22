"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/mon-compte/profil", label: "Vous", exact: true },
  { href: "/mon-compte/profil/documents", label: "Pièces" },
  { href: "/mon-compte/profil/compagnons", label: "Voyageurs" },
  { href: "/mon-compte/profil/facturation", label: "Facturation" },
];

export function ProfileSubnav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex rounded-full bg-[#efeeeb] p-1 shadow-[0_1px_2px_rgba(11,25,44,0.04)]"
      aria-label="Sections du compte"
    >
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex-1 rounded-full px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.04em] transition ${
              active
                ? "bg-[var(--admin-navy)] text-white shadow-sm"
                : "text-[#5a5c60] hover:text-[var(--admin-navy)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
