"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AgencyLogo } from "@/components/AgencyLogo";
import { Icon } from "@/components/crm/icons";
import { siteConfig } from "@/lib/site";

const LINKS = [
  { href: "/admin", label: "Tableau de bord", icon: "grid_view", exact: true },
  { href: "/admin/clients", label: "Clients", icon: "group" },
  { href: "/admin/reservations", label: "Réservations", icon: "event" },
  { href: "/admin/emails", label: "E-mails", icon: "mail" },
  { href: "/admin/little-emperors", label: "Little Emperors", icon: "hotel" },
  { href: "/admin/transactions", label: "Transactions", icon: "account_balance" },
  { href: "/admin/revolut", label: "Revolut", icon: "sync_alt" },
  { href: "/admin/outils", label: "Outils", icon: "build" },
];

export function AdminNav({
  unmatchedCount = 0,
  emailCount = 0,
  leCount = 0,
  staffName = "",
  staffRole = "",
  children,
}: {
  unmatchedCount?: number;
  emailCount?: number;
  leCount?: number;
  staffName?: string;
  staffRole?: "admin" | "agent" | "";
  children?: React.ReactNode;
}) {
  const links =
    staffRole === "admin"
      ? [...LINKS, { href: "/admin/equipe", label: "Équipe", icon: "person_add" }]
      : LINKS;
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);
  const initials =
    staffName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "TB";

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
    router.push(q ? `/admin/recherche?q=${encodeURIComponent(q)}` : "/admin/recherche");
  }

  function navLink(link: (typeof links)[number], variant: "dark" | "light", onNavigate?: () => void) {
    const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
    const badge =
      link.href === "/admin/revolut" && unmatchedCount > 0
        ? unmatchedCount
        : link.href === "/admin/emails" && emailCount > 0
          ? emailCount
          : link.href === "/admin/little-emperors" && leCount > 0
            ? leCount
            : null;
    const dark = variant === "dark";
    return (
      <Link
        key={`${variant}-${link.href}`}
        href={link.href}
        onClick={onNavigate}
        className={`admin-tap flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
          onNavigate ? "w-full" : ""
        } ${
          dark
            ? active
              ? "bg-white/10 font-semibold text-[var(--admin-gold)]"
              : "text-[#c5c6cd] hover:bg-white/5 hover:text-white"
            : active
              ? "bg-[var(--admin-navy)] font-semibold text-[var(--admin-gold-soft)]"
              : "text-muted hover:bg-[var(--surface-2)] hover:text-[var(--admin-navy)]"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <Icon name={link.icon} className="h-4 w-4" />
          <span>{link.label}</span>
        </span>
        {badge != null ? (
          <span className="rounded-full bg-[var(--admin-gold)] px-2 py-0.5 font-label text-[10px] font-bold text-[var(--admin-navy)]">
            {badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full max-w-full overflow-hidden bg-[var(--admin-navy)] pt-[env(safe-area-inset-top)] text-white lg:hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <div className="flex min-w-0 items-center gap-1">
            <Link href="/admin" className="flex min-w-0 items-center gap-2">
              <AgencyLogo className="h-9 w-9 shrink-0" />
              <span className="truncate font-display text-sm font-semibold">Espace agence</span>
            </Link>
            <button
              type="button"
              className="admin-tap inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
              aria-expanded={menuOpen}
              aria-controls="admin-mobile-menu"
              aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? "close" : "menu"} className="h-5 w-5" />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/admin/reservations"
              className="admin-af-btn-accent admin-tap rounded-md px-3 py-2 text-xs"
            >
              + Résa
            </Link>
            <button type="button" onClick={signOut} className="admin-tap px-2 text-xs font-semibold text-[#c5c6cd]">
              Sortir
            </button>
          </div>
        </div>
        <form onSubmit={onSearch} className="relative px-3 pb-3">
          <Icon
            name="search"
            className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c5c6cd]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md bg-white/10 py-2.5 pl-10 pr-4 text-[13px] text-white outline-none placeholder:text-[#c5c6cd] focus:bg-white/15 focus:ring-2 focus:ring-[var(--admin-gold)]/40"
            placeholder="Client, référence TB-, hôtel, confirmation…"
            aria-label="Rechercher un client ou un dossier"
            type="search"
          />
        </form>
      </header>

      {menuOpen ? (
        <div
          id="admin-mobile-menu"
          className="fixed inset-0 z-[60] flex flex-col bg-[var(--admin-navy)] pt-[env(safe-area-inset-top)] text-white lg:hidden"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-3">
            <p className="font-display text-sm font-semibold">Menu</p>
            <button
              type="button"
              className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-lg"
              aria-label="Fermer le menu"
              onClick={() => setMenuOpen(false)}
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {links.map((link) => navLink(link, "dark", () => setMenuOpen(false)))}
          </nav>
        </div>
      ) : null}

      <aside className="z-50 hidden w-72 flex-col justify-between bg-[var(--admin-navy)] px-5 py-6 text-white lg:fixed lg:left-0 lg:top-0 lg:flex lg:h-full lg:shrink-0">
        <div className="flex flex-col gap-6">
          <Link href="/admin" className="flex items-center gap-3 px-1">
            <AgencyLogo className="h-10 w-10" />
            <span className="flex flex-col leading-tight">
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
                Travel Business
              </span>
              <span className="text-sm font-medium text-[#dbe5f6]">Espace agence</span>
            </span>
          </Link>

          <nav className="flex flex-col gap-1">{links.map((link) => navLink(link, "dark"))}</nav>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/admin/reservations"
            className="admin-af-btn-accent inline-flex items-center justify-center rounded-lg px-3 py-2.5 text-sm"
          >
            + Nouvelle réservation
          </Link>
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[#c5c6cd] transition hover:bg-white/5 hover:text-white"
          >
            <Icon name="support_agent" className="h-4 w-4 text-[var(--admin-gold)]" />
            WhatsApp agence
          </a>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#c5c6cd] transition hover:bg-white/5 hover:text-white"
          >
            Déconnexion
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 hidden h-20 items-center justify-between border-b border-[var(--border)] bg-[rgba(250,249,246,0.9)] px-8 shadow-[0_1px_8px_rgba(11,25,44,0.04)] backdrop-blur-xl lg:flex lg:pl-[calc(18rem+2rem)]">
        <form onSubmit={onSearch} className="relative w-full max-w-xl">
          <Icon
            name="search"
            className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md bg-[var(--surface-2)] py-2.5 pl-10 pr-4 text-[13px] text-[var(--admin-navy)] outline-none transition focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30"
            placeholder="Client, référence TB-, hôtel, confirmation…"
            aria-label="Rechercher un client ou un dossier"
            type="search"
          />
        </form>
        <div className="ml-6 flex items-center gap-4">
          <Link
            href="/admin/reservations"
            className="admin-af-btn-accent inline-flex items-center rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.08em]"
          >
            + Réservation
          </Link>
          {unmatchedCount > 0 ? (
            <Link
              href="/admin/revolut"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-gold)]/40 bg-[var(--admin-gold-soft)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)]"
            >
              <Icon name="sync_alt" className="h-4 w-4" />
              {unmatchedCount} virement{unmatchedCount > 1 ? "s" : ""} à rapprocher
            </Link>
          ) : null}
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-[var(--admin-gold)]"
            title={staffName || "Agent connecté"}
            role="img"
            aria-label={staffName ? `Agent ${staffName}` : "Agent connecté"}
          >
            {initials}
          </span>
        </div>
      </header>
      <main className="min-w-0 max-w-full px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 sm:pb-[max(2rem,env(safe-area-inset-bottom))] lg:pt-8 lg:pb-8 lg:pl-[calc(18rem+2rem)] lg:pr-8">
        {children}
      </main>
    </>
  );
}
