"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  {
    href: "/mon-compte",
    label: "Accueil",
    exact: true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 3.2 3.5 10.2V21h6.2v-6.3h4.6V21h6.2V10.2L12 3.2Z" />
      </svg>
    ),
  },
  {
    href: "/mon-compte/reservations",
    label: "Réservations",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5V19l-8-3.2L4 19V5.5Zm2.5-1A1.5 1.5 0 0 0 5 5.5v11.2l7-2.8 7 2.8V5.5A1.5 1.5 0 0 0 17.5 4h-11Z" />
      </svg>
    ),
  },
  {
    href: "/mon-compte/transactions",
    label: "Transactions",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M7 7h12l-2.2-2.2 1.4-1.4L23 8l-4.8 4.6-1.4-1.4L19 9H7V7Zm10 10H5l2.2 2.2-1.4 1.4L1 16l4.8-4.6 1.4 1.4L5 15h12v2Z" />
      </svg>
    ),
  },
  {
    href: "/mon-compte/profil",
    label: "Compte",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Zm0 2.2c-3.4 0-7 1.7-7 4.2V21h14v-2.6c0-2.5-3.6-4.2-7-4.2Z" />
      </svg>
    ),
  },
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
    <>
      <div className="flex w-full items-center justify-between gap-3 md:w-auto md:flex-1 md:justify-end md:gap-6">
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

        <div className="ml-auto flex items-center gap-2.5">
          {initials ? (
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-xs font-bold text-white ring-2 ring-[var(--aura-blue-soft)]">
                {initials}
              </span>
              {customerName ? (
                <span className="hidden max-w-[140px] truncate text-xs font-semibold text-[var(--admin-navy)] sm:inline">
                  {customerName}
                </span>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-[var(--aura-blue-soft)] hover:text-[var(--admin-navy)]"
          >
            Déconnexion
          </button>
        </div>
      </div>

      <nav className="account-tabbar md:hidden" aria-label="Navigation compte">
        <div className="mx-auto grid max-w-[480px] grid-cols-4">
          {LINKS.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition ${
                  active ? "text-[var(--admin-navy)]" : "text-slate-500"
                }`}
              >
                <span className={`relative ${active ? "opacity-100" : "opacity-70"}`}>
                  {link.icon}
                  {link.label === "Transactions" ? (
                    <span className="absolute -right-3 -top-1 rounded bg-[var(--admin-navy)] px-1 text-[7px] font-bold leading-3 text-white">
                      PRO
                    </span>
                  ) : null}
                </span>
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
