"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AgencyLogo } from "@/components/AgencyLogo";
import { HotelReplyToasts } from "@/components/admin/HotelReplyToasts";
import { Icon } from "@/components/crm/icons";
import { SidebarGroups, UserMenu } from "@/components/admin/AdminNavParts";
import {
  activeAdminNavHref,
  adminNavGroups,
  openAdminNavGroups,
  parseCollapsedGroups,
  toggleCollapsedGroup,
  type AdminNavCounts,
} from "@/lib/crm/admin-nav";

const COLLAPSED_KEY = "tba-admin-nav-collapsed";
const collapsedListeners = new Set<() => void>();

function subscribeCollapsed(callback: () => void) {
  collapsedListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    collapsedListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) || "[]";
  } catch {
    return "[]";
  }
}

function writeCollapsed(next: string[]) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
  } catch {
    // Sans stockage, les groupes restent ouverts à la prochaine visite.
  }
  for (const listener of collapsedListeners) listener();
}

export function AdminNav({
  unmatchedCount = 0,
  emailCount = 0,
  leCount = 0,
  pieceCount = 0,
  staffName = "",
  staffRole = "",
  showExample = false,
  children,
}: {
  unmatchedCount?: number;
  emailCount?: number;
  leCount?: number;
  pieceCount?: number;
  staffName?: string;
  staffRole?: "admin" | "agent" | "";
  showExample?: boolean;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const counts: AdminNavCounts = useMemo(
    () => ({ revolut: unmatchedCount, emails: emailCount, le: leCount, pieces: pieceCount }),
    [unmatchedCount, emailCount, leCount, pieceCount]
  );
  const groups = useMemo(() => adminNavGroups({ role: staffRole, showExample }), [staffRole, showExample]);
  const search = searchParams.toString();
  const activeHref = activeAdminNavHref(groups, pathname, search);
  const searching = pathname === "/admin/recherche";
  const [query, setQuery] = useState(searching ? searchParams.get("q") || "" : "");
  const [menuOpen, setMenuOpen] = useState(false);
  const collapsedRaw = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => "[]");
  const collapsed = useMemo(() => parseCollapsedGroups(collapsedRaw), [collapsedRaw]);
  const openIds = openAdminNavGroups(groups, collapsed, activeHref);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

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
    setMenuOpen(false);
    router.push(q ? `/admin/recherche?q=${encodeURIComponent(q)}` : "/admin/recherche");
  }

  function toggleGroup(groupId: string) {
    writeCollapsed(toggleCollapsedGroup(collapsed, groupId));
  }

  const newBooking = (
    <Link
      href="/admin/reservations/nouveau"
      onClick={() => setMenuOpen(false)}
      aria-current={pathname === "/admin/reservations/nouveau" ? "page" : undefined}
      className="admin-af-btn-accent admin-tap inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm"
    >
      <Icon name="add" className="h-4 w-4" />
      Nouveau dossier
    </Link>
  );

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
          <div className="flex shrink-0 items-center gap-2">
            <UserMenu name={staffName} role={staffRole} onSignOut={signOut} variant="dark" />
          </div>
        </div>
        <form onSubmit={onSearch} className="relative px-3 pb-3" role="search">
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
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {newBooking}
            <SidebarGroups
              groups={groups}
              activeHref={activeHref}
              counts={counts}
              openIds={openIds}
              onToggle={toggleGroup}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <aside
        aria-label="Barre latérale agence"
        className="z-50 hidden w-72 flex-col bg-[var(--admin-navy)] px-5 py-6 text-white lg:fixed lg:left-0 lg:top-0 lg:flex lg:h-full lg:shrink-0"
      >
        <Link href="/admin" className="flex items-center gap-3 px-1">
          <AgencyLogo className="h-10 w-10" />
          <span className="flex flex-col leading-tight">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
              Travel Business
            </span>
            <span className="text-sm font-medium text-[#dbe5f6]">Espace agence</span>
          </span>
        </Link>
        <div className="mt-5">{newBooking}</div>
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <SidebarGroups
            groups={groups}
            activeHref={activeHref}
            counts={counts}
            openIds={openIds}
            onToggle={toggleGroup}
          />
        </div>
      </aside>

      <header className="sticky top-0 z-40 hidden h-20 items-center justify-between border-b border-[var(--border)] bg-[rgba(250,249,246,0.9)] px-8 shadow-[0_1px_8px_rgba(11,25,44,0.04)] backdrop-blur-xl lg:flex lg:pl-[calc(18rem+2rem)]">
        <form onSubmit={onSearch} className="relative w-full max-w-xl" role="search">
          <Icon
            name="search"
            className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-current={searching ? "page" : undefined}
            className={`w-full rounded-md py-2.5 pl-10 pr-4 text-[13px] text-[var(--admin-navy)] outline-none transition focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30 ${
              searching ? "bg-white ring-2 ring-[var(--admin-gold)]/60" : "bg-[var(--surface-2)]"
            }`}
            placeholder="Client, référence TB-, hôtel, confirmation…"
            aria-label="Rechercher un client ou un dossier"
            type="search"
          />
        </form>
        <div className="ml-6 flex items-center gap-4">
          {unmatchedCount > 0 ? (
            <Link
              href="/admin/revolut"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-gold)]/40 bg-[var(--admin-gold-soft)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)]"
            >
              <Icon name="sync_alt" className="h-4 w-4" />
              {unmatchedCount} virement{unmatchedCount > 1 ? "s" : ""} à rapprocher
            </Link>
          ) : null}
          <UserMenu name={staffName} role={staffRole} onSignOut={signOut} />
        </div>
      </header>
      <main className="min-w-0 max-w-full px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 sm:pb-[max(2rem,env(safe-area-inset-bottom))] lg:pt-8 lg:pb-8 lg:pl-[calc(18rem+2rem)] lg:pr-8">
        {children}
      </main>
      <HotelReplyToasts />
    </>
  );
}
