"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/admin", label: "Tableau de bord", exact: true },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/reservations", label: "Réservations" },
  { href: "/admin/devis", label: "Devis" },
  { href: "/admin/imports", label: "Imports PDF" },
  { href: "/admin/mtrip", label: "mTrip" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/paiements", label: "Paiements" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/revolut", label: "Revolut" },
  { href: "/admin/demandes", label: "Demandes" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/taches", label: "Tâches" },
  { href: "/admin/fournisseurs", label: "Fournisseurs" },
  { href: "/admin/equipe", label: "Équipe" },
  { href: "/admin/rapports", label: "Rapports" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/parametres", label: "Paramètres" },
];

export function AdminNav({ unmatchedCount = 0 }: { unmatchedCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return null;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside className="flex w-full flex-col gap-6 border-b border-white/10 bg-[var(--admin-navy)] px-4 py-5 text-white lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div>
        <Link href="/admin" className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-display text-xs font-extrabold tracking-wider">
            TBA
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-display text-base font-extrabold">Travelba</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
              Back-office
            </span>
          </span>
        </Link>
        <Link
          href="/admin/reservations"
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[var(--admin-red)] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c8102e]"
        >
          + Nouvelle réservation
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1 lg:flex-col lg:gap-1">
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
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{link.label}</span>
              {badge != null ? (
                <span className="rounded-full bg-[var(--admin-red)] px-2 py-0.5 text-[10px] font-bold">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={signOut}
          className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
