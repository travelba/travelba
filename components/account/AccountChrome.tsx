"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/crm/ui";

const TABS = [
  {
    href: "/mon-compte",
    label: "Accueil",
    exact: true,
    title: "Accueil",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 3.2 3.5 10.2V21h6.2v-6.3h4.6V21h6.2V10.2L12 3.2Z" />
      </svg>
    ),
  },
  {
    href: "/mon-compte/reservations",
    label: "Réservations",
    title: "Réservations",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5V19l-8-3.2L4 19V5.5Zm2.5-1A1.5 1.5 0 0 0 5 5.5v11.2l7-2.8 7 2.8V5.5A1.5 1.5 0 0 0 17.5 4h-11Z" />
      </svg>
    ),
  },
  {
    href: "/mon-compte/transactions",
    label: "Transactions",
    title: "Transactions",
    pro: true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M7 7h12l-2.2-2.2 1.4-1.4L23 8l-4.8 4.6-1.4-1.4L19 9H7V7Zm10 10H5l2.2 2.2-1.4 1.4L1 16l4.8-4.6 1.4 1.4L5 15h12v2Z" />
      </svg>
    ),
  },
  {
    href: "/mon-compte/profil",
    label: "Compte",
    title: "Compte",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Zm0 2.2c-3.4 0-7 1.7-7 4.2V21h14v-2.6c0-2.5-3.6-4.2-7-4.2Z" />
      </svg>
    ),
  },
] as const;

const SERVICES = [
  { href: "/mon-compte/devis", label: "Devis", title: "Mes devis" },
  { href: "/mon-compte/paiements", label: "Paiements", title: "Paiements" },
  { href: "/mon-compte/documents", label: "Documents", title: "Documents" },
  { href: "/mon-compte/demandes", label: "Demandes", title: "Demandes" },
  {
    href: "/mon-compte/notifications",
    label: "Notifications",
    title: "Notifications",
  },
  { href: "/mon-compte/securite", label: "Sécurité", title: "Sécurité" },
] as const;

function pageTitle(pathname: string) {
  const hit = TABS.find((t) =>
    "exact" in t && t.exact ? pathname === t.href : pathname.startsWith(t.href)
  );
  if (hit?.title) return hit.title;
  return (
    SERVICES.find((service) => pathname.startsWith(service.href))?.title ??
    "Espace client"
  );
}

export function AccountChrome({
  customerName,
  initials,
  children,
}: {
  customerName: string;
  initials: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const title = pageTitle(pathname);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  return (
    <div className="account-app admin-af min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-[var(--aura-surface)]/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandMark href="/mon-compte" subtitle={title} />
          <div className="flex items-center gap-2">
            <Link
              href="/mon-compte/notifications"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--admin-navy)] ring-1 ring-slate-200"
              aria-label="Ouvrir les notifications"
              title="Notifications"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M12 3a7 7 0 0 0-7 7v1.1c0 .6-.2 1.1-.5 1.6L3.2 15A1 1 0 0 0 4 16.5h16a1 1 0 0 0 .8-1.5l-1.3-2.3c-.3-.5-.5-1-.5-1.6V10a7 7 0 0 0-7-7Zm0 18a2.8 2.8 0 0 0 2.7-2.2H9.3A2.8 2.8 0 0 0 12 21Z" />
              </svg>
            </Link>
            <Link
              href="/mon-compte/profil"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-xs font-bold text-white ring-2 ring-[var(--aura-blue-soft)]"
              aria-label={`Compte ${customerName}`}
            >
              {initials}
            </Link>
          </div>
        </div>
        <nav className="mx-auto hidden max-w-[480px] items-center gap-5 px-4 pb-3 sm:px-6 md:flex">
          {TABS.map((tab) => {
            const active =
              "exact" in tab && tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`pb-1 font-display text-sm tracking-wide transition ${
                  active
                    ? "border-b-2 border-[var(--admin-red)] font-bold text-[var(--admin-navy)]"
                    : "font-medium text-slate-600 hover:text-[var(--admin-navy)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            className="ml-auto text-xs font-semibold text-muted hover:text-[var(--admin-navy)]"
          >
            Déconnexion
          </button>
        </nav>
        <nav
          className="mx-auto flex max-w-[480px] gap-2 overflow-x-auto px-4 pb-3 sm:px-6"
          aria-label="Services client"
        >
          {SERVICES.map((service) => {
            const active = pathname.startsWith(service.href);
            return (
              <Link
                key={service.href}
                href={service.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-[var(--admin-navy)] text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-[var(--aura-blue-soft)]"
                }`}
              >
                {service.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[480px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8">{children}</main>

      <nav className="account-tabbar md:hidden" aria-label="Navigation compte">
        <div className="mx-auto grid max-w-[480px] grid-cols-4">
          {TABS.map((tab) => {
            const active =
              "exact" in tab && tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition ${
                  active ? "text-[var(--admin-navy)]" : "text-slate-500"
                }`}
              >
                <span className={`relative ${active ? "opacity-100" : "opacity-70"}`}>
                  {tab.icon}
                  {"pro" in tab && tab.pro ? (
                    <span className="absolute -right-3.5 -top-1 rounded-full bg-[var(--admin-navy)] px-1 text-[7px] font-bold leading-3 text-white">
                      PRO
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
