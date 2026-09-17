"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/admin", label: "Tableau de bord", icon: "grid_view", exact: true },
  { href: "/admin/clients", label: "Clients", icon: "group" },
  { href: "/admin/reservations", label: "Réservations", icon: "flight_takeoff" },
  { href: "/admin/transactions", label: "Transactions", icon: "account_balance" },
  { href: "/admin/revolut", label: "Revolut", icon: "sync_alt" },
];

export function AdminNav({
  unmatchedCount = 0,
  children,
}: {
  unmatchedCount?: number;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  if (pathname === "/admin/login") {
    return <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>;
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/admin/clients?q=${encodeURIComponent(q)}` : "/admin/clients");
  }

  return (
    <>
      <aside className="z-50 flex w-full flex-col justify-between border-b border-[var(--border)] bg-white px-4 py-5 shadow-[0_1px_8px_rgba(0,0,0,0.04)] lg:fixed lg:left-0 lg:top-0 lg:h-full lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex flex-col gap-6">
          <Link href="/admin" className="flex items-center gap-3 px-1">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--admin-navy)] font-display text-[11px] font-extrabold tracking-wider text-[var(--admin-gold)]">
              TBA
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
                Travel Business
              </span>
              <span className="font-display text-base font-semibold text-[var(--admin-navy)]">
                Private Agency
              </span>
            </span>
          </Link>

          <nav className="flex flex-wrap gap-1 lg:flex-col">
            {LINKS.map((link) => {
              const active = link.exact
                ? pathname === link.href
                : pathname.startsWith(link.href);
              const badge =
                link.href === "/admin/revolut" && unmatchedCount > 0
                  ? unmatchedCount
                  : null;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm transition ${
                    active
                      ? "bg-[var(--admin-navy)] font-semibold text-[var(--admin-gold-soft)]"
                      : "text-muted hover:bg-[var(--surface-2)] hover:text-[var(--admin-navy)]"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px]">{link.icon}</span>
                    <span>{link.label}</span>
                  </span>
                  {badge != null ? (
                    <span className="rounded-full bg-[var(--admin-gold)] px-2 py-0.5 font-label text-[10px] font-bold text-[var(--admin-navy)]">
                      {badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/admin/reservations"
            className="admin-af-btn-accent inline-flex items-center justify-center rounded-md px-3 py-2.5 text-sm"
          >
            + Nouvelle réservation
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted transition hover:bg-[var(--surface-2)] hover:text-[var(--admin-navy)]"
          >
            Déconnexion
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 hidden h-20 items-center justify-between border-b border-[var(--border)] bg-[rgba(250,249,246,0.9)] px-8 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:flex lg:pl-[calc(18rem+2rem)]">
        <form onSubmit={onSearch} className="relative w-full max-w-xl">
          <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-muted">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md bg-[var(--surface-2)] py-2.5 pl-10 pr-4 text-[13px] text-[var(--admin-navy)] outline-none transition focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30"
            placeholder="Rechercher un client ou une réservation…"
            type="search"
          />
        </form>
        <div className="ml-6 flex items-center gap-4">
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-muted">
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            {unmatchedCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--admin-gold)]" />
            ) : null}
          </span>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[var(--admin-gold)]">
            <span className="material-symbols-outlined text-[18px]">person</span>
          </span>
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-8 lg:pl-[calc(18rem+2rem)] lg:pr-8 lg:pt-8">
        {children}
      </main>
    </>
  );
}
