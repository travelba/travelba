"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { useMirror } from "@/lib/crm/use-mirror";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AgencyLogo } from "@/components/AgencyLogo";
import { HotelReplyToasts } from "@/components/admin/HotelReplyToasts";
import { Icon } from "@/components/crm/icons";
import { MobileTabBar, MoreSheet, SearchOverlay, SidebarGroups, UserMenu } from "@/components/admin/AdminNavParts";
import {
  activeAdminNavHref,
  adminNavGroups,
  adminPageTitle,
  moreSheetGroups,
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
  stripeCount = 0,
  emailCount = 0,
  leCount = 0,
  pieceCount = 0,
  staffName = "",
  staffRole = "",
  showExample = false,
  children,
}: {
  unmatchedCount?: number;
  stripeCount?: number;
  emailCount?: number;
  leCount?: number;
  pieceCount?: number;
  staffName?: string;
  staffRole?: "admin" | "agent" | "partner" | "";
  showExample?: boolean;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const counts: AdminNavCounts = useMemo(
    () => ({ revolut: unmatchedCount, stripe: stripeCount, emails: emailCount, le: leCount, pieces: pieceCount }),
    [unmatchedCount, stripeCount, emailCount, leCount, pieceCount]
  );
  const groups = useMemo(() => adminNavGroups({ role: staffRole, showExample }), [staffRole, showExample]);
  const partner = staffRole === "partner";
  const home = partner ? "/admin/little-emperors" : "/admin";
  const search = searchParams.toString();
  const activeHref = activeAdminNavHref(groups, pathname, search);
  const searching = pathname === "/admin/recherche";
  const currentQuery = searching ? searchParams.get("q") || "" : "";
  // Le layout persiste d’une page à l’autre : le champ suit l’URL (`?q=`) tant qu’on n’y tape pas.
  const [query, setQuery] = useMirror(currentQuery);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const collapsedRaw = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => "[]");
  const collapsed = useMemo(() => parseCollapsedGroups(collapsedRaw), [collapsedRaw]);
  const openIds = openAdminNavGroups(groups, collapsed, activeHref);
  const pageTitle = adminPageTitle(groups, pathname, search);

  if (pathname === "/admin/login") {
    return <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>;
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(partner ? "/admin/login?espace=myler" : "/admin/login");
    router.refresh();
  }

  function goSearch(q: string) {
    setSearchOpen(false);
    setMoreOpen(false);
    router.push(q ? `/admin/recherche?q=${encodeURIComponent(q)}` : "/admin/recherche");
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    goSearch(query.trim());
  }

  function toggleGroup(groupId: string) {
    writeCollapsed(toggleCollapsedGroup(collapsed, groupId));
  }

  const newBooking = (
    <Link
      href="/admin/reservations/nouveau"
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
        <div className="flex h-14 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link href={home} aria-label={partner ? "Little Emperors" : "Tableau de bord"} className="shrink-0">
              <AgencyLogo className="h-9 w-9" />
            </Link>
            <p className="truncate font-display text-sm font-semibold" aria-live="polite">
              {pageTitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {partner ? null : (
            <button
              type="button"
              aria-label="Rechercher"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(true)}
              className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-lg text-white"
            >
              <Icon name="search" className="h-5 w-5" />
            </button>
            )}
            <UserMenu name={staffName} role={staffRole} onSignOut={signOut} variant="dark" />
          </div>
        </div>
      </header>
      {searchOpen ? (
        <SearchOverlay open initialQuery={currentQuery} onClose={() => setSearchOpen(false)} onSubmit={goSearch} />
      ) : null}
      <MoreSheet
        open={moreOpen}
        groups={moreSheetGroups(groups)}
        activeHref={activeHref}
        counts={counts}
        name={staffName}
        role={staffRole}
        onClose={() => setMoreOpen(false)}
        onSignOut={signOut}
      />

      <aside
        aria-label={partner ? "Little Emperors" : "Barre latérale agence"}
        className="z-50 hidden w-72 flex-col bg-[var(--admin-navy)] px-5 py-6 text-white lg:fixed lg:left-0 lg:top-0 lg:flex lg:h-full lg:shrink-0"
      >
        <Link href={home} className="flex items-center gap-3 px-1">
          <AgencyLogo className="h-10 w-10" />
          <span className="flex flex-col leading-tight">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
              Travel Business
            </span>
            <span className="text-sm font-medium text-[#dbe5f6]">{partner ? "MyLER partner" : "Espace agence"}</span>
          </span>
        </Link>
        {partner ? null : <div className="mt-5">{newBooking}</div>}
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
        {partner ? (
          <p className="font-display text-lg font-bold text-[var(--admin-navy)]">Little Emperors</p>
        ) : (
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
        )}
        <div className="ml-6 flex items-center gap-4">
          <UserMenu name={staffName} role={staffRole} onSignOut={signOut} />
        </div>
      </header>
      <main className={`min-w-0 max-w-full px-4 pt-6 sm:px-6 sm:pt-8 lg:pt-8 lg:pb-8 lg:pl-[calc(18rem+2rem)] lg:pr-8 ${partner ? "pb-8" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"}`}>
        {children}
      </main>
      {partner ? null : (
        <MobileTabBar pathname={pathname} counts={counts} moreOpen={moreOpen} onMore={() => setMoreOpen((open) => !open)} />
      )}
      {partner ? null : <HotelReplyToasts />}
    </>
  );
}
