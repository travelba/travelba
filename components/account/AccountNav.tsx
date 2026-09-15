"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/mon-compte", label: "Accueil", exact: true },
  { href: "/mon-compte/reservations", label: "Réservations" },
  { href: "/mon-compte/transactions", label: "Transactions" },
  { href: "/mon-compte/profil", label: "Compte" },
];

export function AccountNav({
  customerName,
  initials,
}: {
  customerName?: string;
  initials?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col gap-3 md:w-auto md:flex-1 md:flex-row md:items-center md:justify-end md:gap-6">
      <nav className="hidden items-center gap-6 md:flex">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`pb-1 font-display text-sm tracking-wide transition ${
                active
                  ? "border-b-2 border-[var(--admin-red)] font-bold text-[var(--admin-navy)]"
                  : "font-medium text-slate-600 hover:text-[var(--admin-navy)]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        {initials ? (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-xs font-bold text-white">
              {initials}
            </span>
            {customerName ? (
              <span className="max-w-[140px] truncate text-xs font-semibold text-[var(--admin-navy)]">
                {customerName}
              </span>
            ) : null}
          </div>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={signOut}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-[var(--admin-sky)] hover:text-[var(--admin-navy)]"
        >
          Déconnexion
        </button>
      </div>

      <nav className="flex gap-1 overflow-x-auto pb-1 md:hidden">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                active
                  ? "bg-[var(--admin-navy)] text-white"
                  : "bg-[var(--admin-sky)] text-[var(--admin-navy)]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
